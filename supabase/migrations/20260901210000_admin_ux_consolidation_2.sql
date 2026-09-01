begin;

-- Tranche 2 only adds operational admin read models. Financial definitions,
-- transitions and execution functions remain unchanged.

create or replace function public.admin_list_professional_verifications_ux_v2(
  p_view text default 'open', p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb; v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  perform public.assert_admin_permission('verification.read');
  if p_view not in ('open', 'history') or coalesce(p_offset, -1) < 0 then
    raise exception 'Invalid verification view' using errcode = '22023';
  end if;

  if p_view = 'open' then
    with page as (
      select u.id as professional_id, u.first_name, u.last_name, u.business_name,
        u.email, u.professional_email, u.verification_status,
        u.verification_submitted_at, u.id_document, u.certificate_document,
        null::uuid as reviewer_id, null::text as reviewer_email,
        null::text as decision, null::text as review_reason,
        null::timestamptz as reviewed_at, count(*) over () as total_count
      from public.users u
      where u.role = 'pro' and u.verification_status = 'pending'
      order by u.verification_submitted_at asc nulls first, u.id
      limit v_limit offset p_offset
    )
    select jsonb_build_object('view', p_view, 'total', coalesce(max(total_count), 0),
      'items', coalesce(jsonb_agg(to_jsonb(page) - 'total_count'
        order by verification_submitted_at asc nulls first, professional_id), '[]'::jsonb))
    into v_result from page;
  else
    with page as (
      select u.id as professional_id, u.first_name, u.last_name, u.business_name,
        u.email, u.professional_email, u.verification_status,
        u.verification_submitted_at, review.id_document, review.certificate_document,
        review.reviewer_id, auth_user.email::text as reviewer_email,
        review.decision, review.reason as review_reason, review.reviewed_at,
        count(*) over () as total_count
      from public.professional_verification_reviews review
      join public.users u on u.id = review.professional_id
      left join auth.users auth_user on auth_user.id = review.reviewer_id
      order by review.reviewed_at desc, review.id desc
      limit v_limit offset p_offset
    )
    select jsonb_build_object('view', p_view, 'total', coalesce(max(total_count), 0),
      'items', coalesce(jsonb_agg(to_jsonb(page) - 'total_count'
        order by reviewed_at desc, professional_id), '[]'::jsonb))
    into v_result from page;
  end if;

  perform public.record_admin_read_audit('verifications.list', 'provider_verification_collection',
    p_view, jsonb_build_object('result_count', jsonb_array_length(v_result->'items'),
      'offset', p_offset));
  return v_result;
end
$$;

create or replace function public.admin_list_missions_ux_v2(
  p_query text default null,
  p_status text default 'all',
  p_flow_version text default 'all',
  p_party_query text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_attention_only boolean default false,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_party text := lower(trim(coalesce(p_party_query, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  perform public.assert_admin_permission('missions.read');
  if length(v_query) > 200 or length(v_party) > 200
     or p_flow_version not in ('all', 'legacy_v1', 'marketplace_v2')
     or p_status not in ('all', 'pending', 'proposed', 'confirmed', 'cancel_requested',
       'completed', 'cancelled', 'payment_pending', 'paid', 'attention')
     or (p_date_from is not null and p_date_to is not null and p_date_from > p_date_to) then
    raise exception 'Invalid mission filters' using errcode = '22023';
  end if;

  with enriched as (
    select m.id, m.booking_id, m.service, m.status, m.financial_flow_version,
      m.client_id, m.pro_id as provider_id, m.date as scheduled_at, m.created_at,
      coalesce(nullif(trim(concat_ws(' ', client.first_name, client.last_name)), ''), client.email) as client_label,
      coalesce(nullif(trim(concat_ws(' ', provider.first_name, provider.last_name)), ''),
        provider.business_name, provider.email) as provider_label,
      client.email as client_email, provider.email as provider_email,
      case when payment.id is not null then 'paid'
        when selection.id is not null and selection.lock_released_at is null then 'payment_pending'
        else null end as payment_state,
      coalesce(payment.livemode, false) as livemode,
      payment.id as payment_id,
      cancellation.id as cancellation_id,
      cancellation.requested_by_actor_type as cancellation_requested_by,
      cancellation.reason as cancellation_reason,
      cancellation.created_at as cancellation_requested_at,
      cancellation.response_due_at as cancellation_response_due_at,
      cancellation_workflow.current_state as cancellation_state,
      dispute.id as dispute_id, dispute_workflow.current_state as dispute_state,
      payment_dispute.id as payment_dispute_id,
      payment_dispute_workflow.current_state as payment_dispute_state,
      coalesce(incident.has_open, false) as has_open_incident,
      (coalesce(dispute_workflow.current_state <> 'resolved', false)
        or coalesce(cancellation_workflow.current_state in ('routed_to_dispute', 'financial_resolution_pending')
          or (cancellation.response_due_at <= clock_timestamp() and cancellation_workflow.current_state in (
            'client_full_refund_requested','provider_partial_allocation_proposed','mutual_allocation_proposed')), false)
        or (payment_dispute.id is not null and payment_dispute.resolved_at is null)
        or coalesce(incident.has_open, false)) as attention_required,
      array_remove(array[
        case when dispute_workflow.current_state <> 'resolved' then 'service_dispute' end,
        case when cancellation_workflow.current_state in ('routed_to_dispute', 'financial_resolution_pending')
          or (cancellation.response_due_at <= clock_timestamp() and cancellation_workflow.current_state in (
            'client_full_refund_requested','provider_partial_allocation_proposed','mutual_allocation_proposed')) then 'cancellation_review' end,
        case when payment_dispute.id is not null and payment_dispute.resolved_at is null then 'payment_dispute' end,
        case when incident.has_open then 'financial_incident' end
      ], null)::text[] as attention_reasons
    from public.missions m
    left join public.users client on client.id = m.client_id
    left join public.users provider on provider.id = m.pro_id
    left join public.checkout_v2_payments payment on payment.proposal_id = m.id
    left join lateral (
      select selected.id, selected.lock_released_at
      from public.checkout_v2_selections selected
      where selected.selected_proposal_id = m.id
      order by (selected.lock_released_at is null) desc, selected.created_at desc limit 1
    ) selection on true
    left join public.cancellation_cases_v2 cancellation on cancellation.payment_id = payment.id
    left join public.workflow_instances cancellation_workflow
      on cancellation_workflow.id = cancellation.workflow_instance_id
    left join public.service_disputes_v2 dispute on dispute.payment_id = payment.id
    left join public.workflow_instances dispute_workflow on dispute_workflow.id = dispute.workflow_instance_id
    left join lateral (
      select candidate.* from public.payment_disputes_v2 candidate
      where candidate.payment_id = payment.id order by candidate.opened_at desc limit 1
    ) payment_dispute on true
    left join public.workflow_instances payment_dispute_workflow
      on payment_dispute_workflow.id = payment_dispute.workflow_instance_id
    left join lateral (
      select true as has_open from public.admin_financial_incident_sources_v2 source
      where source.payment_id = payment.id and source.is_open limit 1
    ) incident on true
  ), filtered as (
    select enriched.*,
      case
        when enriched.financial_flow_version = 'legacy_v1' then 'legacy'
        when enriched.has_open_incident then 'financial_incident'
        when enriched.dispute_state is not null and enriched.dispute_state <> 'resolved' then 'service_dispute'
        when enriched.cancellation_state in ('routed_to_dispute', 'financial_resolution_pending')
          or (enriched.cancellation_response_due_at <= clock_timestamp() and enriched.cancellation_state in (
            'client_full_refund_requested','provider_partial_allocation_proposed','mutual_allocation_proposed')) then 'cancellation_review'
        when enriched.payment_dispute_state is not null and enriched.payment_dispute_state <> 'resolved' then 'payment_dispute'
        when enriched.payment_state is not null then enriched.payment_state
        else enriched.status
      end as operational_state
    from enriched
    where (p_flow_version = 'all' or enriched.financial_flow_version = p_flow_version)
      and (p_date_from is null or enriched.scheduled_at >= p_date_from)
      and (p_date_to is null or enriched.scheduled_at <= p_date_to)
      and (v_party = '' or concat_ws(' ', enriched.client_label, enriched.provider_label,
        enriched.client_email, enriched.provider_email) ilike '%' || v_party || '%')
      and (v_query = '' or concat_ws(' ', enriched.id, enriched.booking_id, enriched.service,
        enriched.client_email, enriched.provider_email) ilike '%' || v_query || '%')
      and (not p_attention_only or enriched.attention_required)
      and (p_status = 'all' or enriched.status = p_status
        or (p_status = 'payment_pending' and enriched.payment_state = 'payment_pending')
        or (p_status = 'paid' and enriched.payment_state = 'paid')
        or (p_status = 'attention' and enriched.attention_required))
  ), page as (
    select filtered.*, count(*) over () as total_count
    from filtered order by created_at desc, id limit v_limit offset v_offset
  )
  select jsonb_build_object('total', coalesce(max(total_count), 0), 'limit', v_limit,
    'offset', v_offset, 'items', coalesce(jsonb_agg(to_jsonb(page) - 'total_count'
      order by created_at desc, id), '[]'::jsonb)) into v_result from page;

  perform public.record_admin_read_audit('missions.list.filtered', 'mission_collection', null,
    jsonb_build_object('query_length', length(v_query), 'party_query_length', length(v_party),
      'status', p_status, 'flow_version', p_flow_version, 'attention_only', p_attention_only,
      'result_count', jsonb_array_length(v_result->'items'), 'offset', v_offset));
  return v_result;
end
$$;

create or replace function public.admin_list_dispute_cases_ux_v2(
  p_queue text default 'disputes_open', p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_items jsonb; v_total integer; v_limit integer := least(greatest(coalesce(p_limit,50),1),100);
begin
  perform public.assert_admin_permission('disputes.read');
  if p_queue not in ('disputes_open','disputes_history','cancellations_open','cancellations_history')
     or coalesce(p_offset,-1) < 0 then raise exception 'Invalid dispute queue' using errcode='22023'; end if;

  if p_queue like 'disputes_%' then
    select count(*) into v_total from public.service_disputes_v2 d
      join public.workflow_instances w on w.id=d.workflow_instance_id
      where (p_queue='disputes_open' and w.current_state<>'resolved')
         or (p_queue='disputes_history' and w.current_state='resolved');
    select coalesce(jsonb_agg(item order by item->>'updated_at' desc),'[]'::jsonb) into v_items from (
      select jsonb_build_object('case_type','dispute','id',d.id,'payment_id',d.payment_id,
        'mission_id',p.proposal_id,'issue_code',d.issue_code,'reason',d.reason,'state',w.current_state,
        'requested_by',d.opened_by_actor_type,'requested_at',d.created_at,
        'created_at',d.created_at,'updated_at',d.updated_at,
        'client_label',coalesce(nullif(trim(concat_ws(' ',cu.first_name,cu.last_name)),''),cu.email),
        'provider_label',coalesce(nullif(trim(concat_ws(' ',pu.first_name,pu.last_name)),''),pu.business_name,pu.email),
        'currency',p.currency,'client_total_amount_cents',p.amount_total_cents) item
      from public.service_disputes_v2 d join public.workflow_instances w on w.id=d.workflow_instance_id
      join public.checkout_v2_payments p on p.id=d.payment_id
      join public.users cu on cu.id=p.client_id join public.users pu on pu.id=p.provider_id
      where (p_queue='disputes_open' and w.current_state<>'resolved')
         or (p_queue='disputes_history' and w.current_state='resolved')
      order by d.updated_at desc limit v_limit offset p_offset
    ) listed;
  else
    select count(*) into v_total from public.cancellation_cases_v2 c
      join public.workflow_instances w on w.id=c.workflow_instance_id
      where (p_queue='cancellations_open' and (w.current_state in ('routed_to_dispute','financial_resolution_pending')
        or (c.response_due_at<=clock_timestamp() and w.current_state in ('client_full_refund_requested',
          'provider_partial_allocation_proposed','mutual_allocation_proposed'))))
      or (p_queue='cancellations_history' and (c.resolved_at is not null or w.current_state in ('resolved','rejected')));
    select coalesce(jsonb_agg(item order by item->>'updated_at' desc),'[]'::jsonb) into v_items from (
      select jsonb_build_object('case_type','cancellation','id',c.id,'payment_id',c.payment_id,
        'mission_id',p.proposal_id,'cancellation_type',c.cancellation_type,'reason',c.reason,
        'state',w.current_state,'requested_by',c.requested_by_actor_type,'requested_at',c.created_at,
        'response_due_at',c.response_due_at,'created_at',c.created_at,'updated_at',c.updated_at,
        'linked_dispute_id',d.id,
        'client_label',coalesce(nullif(trim(concat_ws(' ',cu.first_name,cu.last_name)),''),cu.email),
        'provider_label',coalesce(nullif(trim(concat_ws(' ',pu.first_name,pu.last_name)),''),pu.business_name,pu.email),
        'currency',p.currency,'client_total_amount_cents',p.amount_total_cents) item
      from public.cancellation_cases_v2 c join public.workflow_instances w on w.id=c.workflow_instance_id
      join public.checkout_v2_payments p on p.id=c.payment_id
      join public.users cu on cu.id=p.client_id join public.users pu on pu.id=p.provider_id
      left join public.service_disputes_v2 d on d.cancellation_id=c.id
      where (p_queue='cancellations_open' and (w.current_state in ('routed_to_dispute','financial_resolution_pending')
        or (c.response_due_at<=clock_timestamp() and w.current_state in ('client_full_refund_requested',
          'provider_partial_allocation_proposed','mutual_allocation_proposed'))))
      or (p_queue='cancellations_history' and (c.resolved_at is not null or w.current_state in ('resolved','rejected')))
      order by c.updated_at desc limit v_limit offset p_offset
    ) listed;
  end if;
  perform public.record_admin_read_audit('disputes.queue.filtered',p_queue,null,
    jsonb_build_object('result_count',jsonb_array_length(v_items),'offset',p_offset));
  return jsonb_build_object('items',v_items,'total',v_total,'limit',v_limit,'offset',p_offset);
end
$$;

create or replace function public.admin_get_dispute_queue_counts_ux_v2()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  perform public.assert_admin_permission('disputes.read');
  select jsonb_build_object(
    'disputes_open',(select count(*) from public.service_disputes_v2 d join public.workflow_instances w on w.id=d.workflow_instance_id where w.current_state<>'resolved'),
    'disputes_history',(select count(*) from public.service_disputes_v2 d join public.workflow_instances w on w.id=d.workflow_instance_id where w.current_state='resolved'),
    'cancellations_open',(select count(*) from public.cancellation_cases_v2 c join public.workflow_instances w on w.id=c.workflow_instance_id where w.current_state in ('routed_to_dispute','financial_resolution_pending') or (c.response_due_at<=clock_timestamp() and w.current_state in ('client_full_refund_requested','provider_partial_allocation_proposed','mutual_allocation_proposed'))),
    'cancellations_history',(select count(*) from public.cancellation_cases_v2 c join public.workflow_instances w on w.id=c.workflow_instance_id where c.resolved_at is not null or w.current_state in ('resolved','rejected'))
  ) into v_result;
  perform public.record_admin_read_audit('disputes.counts','dispute_collection',null,'{}'::jsonb);
  return v_result;
end
$$;

create or replace function public.admin_get_payment_dispute_counts_ux_v2()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  perform public.assert_admin_permission('risk.read');
  select jsonb_build_object(
    'open',count(*) filter(where dispute.resolved_at is null and workflow.current_state<>'liability_admin_review'),
    'won',count(*) filter(where dispute.stripe_status='won' and dispute.resolved_at is null),
    'lost_review',count(*) filter(where workflow.current_state='liability_admin_review'),
    'resolved',count(*) filter(where dispute.resolved_at is not null),
    'all',count(*)
  ) into v_result from public.payment_disputes_v2 dispute
  join public.workflow_instances workflow on workflow.id=dispute.workflow_instance_id;
  perform public.record_admin_read_audit('risk.payment_disputes.counts','payment_dispute_collection',null,'{}'::jsonb);
  return v_result;
end
$$;

create or replace function public.admin_get_incident_counts_ux_v2()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  perform public.assert_admin_permission('incidents.read');
  select jsonb_build_object('open',count(*) filter(where is_open),'all',count(*),
    'blocking',count(*) filter(where is_open and incident_type='runtime_control_blocked'),
    'critical',count(*) filter(where is_open and incident_type<>'runtime_control_blocked'))
  into v_result from public.admin_financial_incident_sources_v2;
  perform public.record_admin_read_audit('incidents.counts','financial_incident_queue_v2',null,'{}'::jsonb);
  return v_result;
end
$$;

create or replace function public.admin_search_audit_ux_v2(
  p_query text default null, p_source text default 'all', p_outcome text default 'all',
  p_actor_query text default null, p_date_from timestamptz default null,
  p_date_to timestamptz default null, p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb; v_actor text:=trim(coalesce(p_actor_query,''));
begin
  perform public.assert_admin_permission('audit.read');
  if p_source not in ('all','admin','financial','authentication')
     or p_outcome not in ('all','success','failed') or p_limit not between 1 and 100
     or p_offset<0 or length(v_actor)>200
     or (p_date_from is not null and p_date_to is not null and p_date_from>p_date_to) then
    raise exception 'Invalid audit search' using errcode='22023';
  end if;
  with events as (
    select 'admin'::text source,id::text record_id,event_type,entity_type,
      coalesce(entity_id,'') entity_id,admin_account_id actor_id,action,outcome,reason,
      occurred_at,coalesce(deduplication_key,'') deduplication_key,
      jsonb_build_object('before',before_state,'after',after_state,'evidence',evidence) payload
    from public.admin_audit_log
    union all
    select 'financial',id::text,event_type,entity_type,entity_id,actor_user_id,
      event_type,'success',reason,created_at,deduplication_key,
      jsonb_build_object('before',before_state,'after',after_state,'evidence',evidence)
    from public.financial_audit_log
    union all
    select 'authentication',id::text,event_type,'admin_session',coalesce(session_id,''),
      user_id,event_type,outcome,null,occurred_at,deduplication_key,client_context
    from public.admin_auth_events
  ), filtered as (
    select event.*,auth_user.email::text as actor_email from events event
    left join auth.users auth_user on auth_user.id=event.actor_id
    where (p_source='all' or event.source=p_source)
      and (p_outcome='all' or event.outcome=p_outcome)
      and (p_date_from is null or event.occurred_at>=p_date_from)
      and (p_date_to is null or event.occurred_at<=p_date_to)
      and (v_actor='' or concat_ws(' ',auth_user.email,event.actor_id::text) ilike '%'||v_actor||'%')
      and (nullif(trim(coalesce(p_query,'')),'') is null or concat_ws(' ',event.event_type,
        event.entity_type,event.entity_id,event.actor_id::text,auth_user.email,event.action,
        event.outcome,event.reason,event.deduplication_key) ilike '%'||trim(p_query)||'%')
  ), page as (
    select filtered.*,count(*) over() total_count from filtered
    order by occurred_at desc,record_id desc limit p_limit offset p_offset
  )
  select jsonb_build_object('source',p_source,'query',p_query,'outcome',p_outcome,
    'total',coalesce(max(total_count),0),'items',coalesce(jsonb_agg(to_jsonb(page)-'total_count'
      order by occurred_at desc,record_id desc),'[]'::jsonb)) into v_result from page;
  perform public.record_admin_read_audit('audit.search.filtered','admin_audit','global',
    jsonb_build_object('source',p_source,'outcome',p_outcome,'query',p_query,
      'actor_query_length',length(v_actor),'limit',p_limit,'offset',p_offset));
  return v_result;
end
$$;

revoke all on function public.admin_list_professional_verifications_ux_v2(text,integer,integer) from public,anon;
revoke all on function public.admin_list_missions_ux_v2(text,text,text,text,timestamptz,timestamptz,boolean,integer,integer) from public,anon;
revoke all on function public.admin_list_dispute_cases_ux_v2(text,integer,integer) from public,anon;
revoke all on function public.admin_get_dispute_queue_counts_ux_v2() from public,anon;
revoke all on function public.admin_get_payment_dispute_counts_ux_v2() from public,anon;
revoke all on function public.admin_get_incident_counts_ux_v2() from public,anon;
revoke all on function public.admin_search_audit_ux_v2(text,text,text,text,timestamptz,timestamptz,integer,integer) from public,anon;

grant execute on function public.admin_list_professional_verifications_ux_v2(text,integer,integer) to authenticated;
grant execute on function public.admin_list_missions_ux_v2(text,text,text,text,timestamptz,timestamptz,boolean,integer,integer) to authenticated;
grant execute on function public.admin_list_dispute_cases_ux_v2(text,integer,integer) to authenticated;
grant execute on function public.admin_get_dispute_queue_counts_ux_v2() to authenticated;
grant execute on function public.admin_get_payment_dispute_counts_ux_v2() to authenticated;
grant execute on function public.admin_get_incident_counts_ux_v2() to authenticated;
grant execute on function public.admin_search_audit_ux_v2(text,text,text,text,timestamptz,timestamptz,integer,integer) to authenticated;

commit;
