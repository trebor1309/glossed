-- Operational service-dispute and cancellation administration. Money remains
-- exclusively executed by the existing marketplace_v2 service-role workflows.

insert into public.admin_role_permissions (role_code, permission_code)
values ('disputes', 'disputes.allocate')
on conflict do nothing;

alter table public.service_dispute_decisions_v2
  drop constraint service_dispute_decisions_v2_administrator_id_fkey;
alter table public.service_dispute_decisions_v2
  add constraint service_dispute_decisions_v2_administrator_id_fkey
  foreign key (administrator_id) references public.admin_accounts(user_id) on delete restrict;

create table public.admin_dispute_allocation_previews_v2 (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.service_disputes_v2(id) on delete restrict,
  admin_id uuid not null references public.admin_accounts(user_id) on delete restrict,
  decision_code text not null check (decision_code in (
    'provider_full', 'client_full_refund', 'partial', 'reject_dispute'
  )),
  workflow_revision bigint not null check (workflow_revision > 0),
  previous_allocation_snapshot_id uuid references public.financial_allocation_snapshots(id) on delete restrict,
  currency text not null check (currency ~ '^[a-z]{3}$'),
  client_total_amount_cents bigint not null check (client_total_amount_cents > 0),
  provider_initial_gross_amount_cents bigint not null check (provider_initial_gross_amount_cents > 0),
  provider_awarded_gross_amount_cents bigint not null check (provider_awarded_gross_amount_cents >= 0),
  provider_statutory_withholding_amount_cents bigint not null check (provider_statutory_withholding_amount_cents >= 0),
  provider_transfer_amount_cents bigint not null check (provider_transfer_amount_cents >= 0),
  platform_fee_rate_bps integer not null check (platform_fee_rate_bps between 0 and 10000),
  platform_fee_final_amount_cents bigint not null check (platform_fee_final_amount_cents >= 0),
  client_tax_allocated_amount_cents bigint not null check (client_tax_allocated_amount_cents >= 0),
  client_refund_amount_cents bigint not null check (client_refund_amount_cents >= 0),
  refund_delta_amount_cents bigint not null check (refund_delta_amount_cents >= 0),
  provider_recovery_target_amount_cents bigint not null check (provider_recovery_target_amount_cents >= 0),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  operation_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  constraint admin_dispute_preview_provider_split check (
    provider_transfer_amount_cents + provider_statutory_withholding_amount_cents
      = provider_awarded_gross_amount_cents
  ),
  constraint admin_dispute_preview_allocation_balanced check (
    client_total_amount_cents = provider_awarded_gross_amount_cents
      + platform_fee_final_amount_cents + client_tax_allocated_amount_cents
      + client_refund_amount_cents
  ),
  constraint admin_dispute_preview_consumption check (
    (consumed_at is null and operation_id is null)
    or (consumed_at is not null and operation_id is not null)
  )
);

create index admin_dispute_previews_case_idx
  on public.admin_dispute_allocation_previews_v2(dispute_id, created_at desc);

alter table public.admin_dispute_allocation_previews_v2 enable row level security;
revoke all on public.admin_dispute_allocation_previews_v2 from public, anon, authenticated;
grant all on public.admin_dispute_allocation_previews_v2 to service_role;

create or replace function public.protect_admin_dispute_preview_v2()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Allocation previews are immutable' using errcode = '42501';
  end if;
  if current_setting('app.admin_dispute_preview_consume', true) is distinct from 'on'
     or new.id is distinct from old.id
     or new.dispute_id is distinct from old.dispute_id
     or new.admin_id is distinct from old.admin_id
     or new.decision_code is distinct from old.decision_code
     or new.workflow_revision is distinct from old.workflow_revision
     or new.previous_allocation_snapshot_id is distinct from old.previous_allocation_snapshot_id
     or new.currency is distinct from old.currency
     or new.client_total_amount_cents is distinct from old.client_total_amount_cents
     or new.provider_initial_gross_amount_cents is distinct from old.provider_initial_gross_amount_cents
     or new.provider_awarded_gross_amount_cents is distinct from old.provider_awarded_gross_amount_cents
     or new.provider_statutory_withholding_amount_cents is distinct from old.provider_statutory_withholding_amount_cents
     or new.provider_transfer_amount_cents is distinct from old.provider_transfer_amount_cents
     or new.platform_fee_rate_bps is distinct from old.platform_fee_rate_bps
     or new.platform_fee_final_amount_cents is distinct from old.platform_fee_final_amount_cents
     or new.client_tax_allocated_amount_cents is distinct from old.client_tax_allocated_amount_cents
     or new.client_refund_amount_cents is distinct from old.client_refund_amount_cents
     or new.refund_delta_amount_cents is distinct from old.refund_delta_amount_cents
     or new.provider_recovery_target_amount_cents is distinct from old.provider_recovery_target_amount_cents
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at
     or old.consumed_at is not null or new.consumed_at is null or new.operation_id is null then
    raise exception 'Invalid allocation preview mutation' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger protect_admin_dispute_preview_v2
before update or delete on public.admin_dispute_allocation_previews_v2
for each row execute function public.protect_admin_dispute_preview_v2();

create or replace function public.admin_preview_service_dispute_allocation_v2(
  p_dispute_id uuid,
  p_decision_code text,
  p_provider_awarded_gross_amount_cents bigint default null,
  p_provider_statutory_withholding_amount_cents bigint default null,
  p_client_tax_allocated_amount_cents bigint default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := auth.uid();
  v_dispute public.service_disputes_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_payment public.checkout_v2_payments%rowtype;
  v_terms public.financial_terms_snapshots%rowtype;
  v_previous public.financial_allocation_snapshots%rowtype;
  v_preview public.admin_dispute_allocation_previews_v2%rowtype;
  v_provider_gross bigint;
  v_withholding bigint;
  v_client_tax bigint;
  v_fee bigint;
  v_refund bigint;
  v_refund_delta bigint;
  v_recovery bigint := 0;
  v_max_age integer;
begin
  perform public.assert_admin_permission('disputes.allocate', true);
  perform public.assert_admin_permission('finance.execute', true);
  if p_decision_code not in ('provider_full', 'client_full_refund', 'partial', 'reject_dispute') then
    raise exception 'Unsupported dispute decision' using errcode = '22023';
  end if;
  select * into v_dispute from public.service_disputes_v2 where id = p_dispute_id;
  if not found then raise exception 'Service dispute not found' using errcode = 'P0002'; end if;
  select * into v_workflow from public.workflow_instances where id = v_dispute.workflow_instance_id;
  if v_workflow.current_state not in ('evidence_collection', 'admin_review') then
    raise exception 'Service dispute is not ready for decision' using errcode = '23514';
  end if;
  select * into v_payment from public.checkout_v2_payments where id = v_dispute.payment_id;
  select * into v_terms from public.financial_terms_snapshots where id = v_payment.terms_snapshot_id;
  select * into v_previous from public.financial_allocation_snapshots
    where terms_snapshot_id = v_terms.id order by revision desc limit 1;

  if p_decision_code in ('provider_full', 'reject_dispute') then
    if p_decision_code = 'reject_dispute' and v_previous.id is not null then
      v_provider_gross := v_previous.provider_awarded_gross_amount_cents;
      v_withholding := v_previous.provider_statutory_withholding_amount_cents;
      v_client_tax := v_previous.client_tax_allocated_amount_cents;
    else
      v_provider_gross := v_terms.provider_initial_gross_amount_cents;
      v_withholding := v_terms.provider_initial_statutory_withholding_cents;
      v_client_tax := v_terms.client_tax_initial_amount_cents;
    end if;
  elsif p_decision_code = 'client_full_refund' then
    v_provider_gross := 0; v_withholding := 0; v_client_tax := 0;
  else
    if p_provider_awarded_gross_amount_cents is null
       or p_provider_statutory_withholding_amount_cents is null
       or p_client_tax_allocated_amount_cents is null then
      raise exception 'Partial allocation requires every amount' using errcode = '22023';
    end if;
    v_provider_gross := p_provider_awarded_gross_amount_cents;
    v_withholding := p_provider_statutory_withholding_amount_cents;
    v_client_tax := p_client_tax_allocated_amount_cents;
  end if;
  if v_provider_gross < 0 or v_provider_gross > v_terms.provider_initial_gross_amount_cents
     or v_withholding < 0 or v_withholding > v_provider_gross
     or v_client_tax < 0 or v_client_tax > v_terms.client_tax_initial_amount_cents then
    raise exception 'Invalid final allocation' using errcode = '23514';
  end if;
  v_fee := round(v_provider_gross::numeric * v_terms.platform_fee_rate_bps::numeric / 10000)::bigint;
  v_refund := v_terms.client_total_amount_cents - v_provider_gross - v_fee - v_client_tax;
  if v_previous.id is not null and (
    v_provider_gross > v_previous.provider_awarded_gross_amount_cents
    or v_fee > v_previous.platform_fee_final_amount_cents
    or v_client_tax > v_previous.client_tax_allocated_amount_cents
    or v_refund < v_previous.client_refund_amount_cents
  ) then raise exception 'A remediation allocation cannot increase a prior award' using errcode = '23514'; end if;
  v_refund_delta := v_refund - coalesce(v_previous.client_refund_amount_cents, 0);
  if exists (select 1 from public.provider_transfers_v2 t
    where t.payment_id = v_payment.id and t.succeeded_at is not null) then
    v_recovery := greatest(0, coalesce(v_previous.provider_transfer_amount_cents,
      v_terms.provider_initial_transfer_amount_cents) - (v_provider_gross - v_withholding));
  end if;
  select financial_reauthentication_max_age_seconds into v_max_age
    from public.admin_security_policy_versions
    where effective_from <= clock_timestamp()
      and (effective_until is null or effective_until > clock_timestamp())
    order by effective_from desc limit 1;

  insert into public.admin_dispute_allocation_previews_v2 (
    dispute_id, admin_id, decision_code, workflow_revision,
    previous_allocation_snapshot_id, currency, client_total_amount_cents,
    provider_initial_gross_amount_cents, provider_awarded_gross_amount_cents,
    provider_statutory_withholding_amount_cents, provider_transfer_amount_cents,
    platform_fee_rate_bps, platform_fee_final_amount_cents,
    client_tax_allocated_amount_cents, client_refund_amount_cents,
    refund_delta_amount_cents, provider_recovery_target_amount_cents, expires_at
  ) values (
    v_dispute.id, v_admin, p_decision_code, v_workflow.revision,
    v_previous.id, v_terms.currency, v_terms.client_total_amount_cents,
    v_terms.provider_initial_gross_amount_cents, v_provider_gross, v_withholding,
    v_provider_gross - v_withholding, v_terms.platform_fee_rate_bps, v_fee,
    v_client_tax, v_refund, v_refund_delta, v_recovery,
    clock_timestamp() + make_interval(secs => coalesce(v_max_age, 300))
  ) returning * into v_preview;

  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    after_state, mfa_authenticated_at, deduplication_key
  ) values (
    v_admin, 'dispute_allocation_previewed', 'service_dispute', v_dispute.id::text,
    'dispute.allocation.preview', 'success', to_jsonb(v_preview),
    public.admin_current_mfa_authenticated_at(), 'admin-dispute-preview:' || v_preview.id::text
  );
  return to_jsonb(v_preview);
end
$$;

create or replace function public.execute_admin_service_dispute_decision_v2(
  p_preview_id uuid,
  p_admin_id uuid,
  p_reason text,
  p_evidence_manifest jsonb,
  p_mfa_authenticated_at timestamptz,
  p_expected_connect_revision bigint,
  p_operation_id uuid
)
returns table (decision_id uuid, resolution_id uuid, refund_id uuid,
  reversal_id uuid, provider_transfer_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_preview public.admin_dispute_allocation_previews_v2%rowtype;
  v_dispute public.service_disputes_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_previous uuid;
  v_result record;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if not public.admin_account_has_permission(p_admin_id, 'disputes.allocate')
     or not public.admin_account_has_permission(p_admin_id, 'finance.execute') then
    raise exception 'Disputes and finance permissions are both required' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 or length(trim(p_reason)) > 4000 then
    raise exception 'A detailed justification is required' using errcode = '22023';
  end if;
  select * into v_preview from public.admin_dispute_allocation_previews_v2
    where id = p_preview_id for update;
  if not found then raise exception 'Allocation preview not found' using errcode = 'P0002'; end if;
  if v_preview.admin_id <> p_admin_id then raise exception 'Preview belongs to another administrator' using errcode = '42501'; end if;
  if v_preview.consumed_at is not null then
    if v_preview.operation_id <> p_operation_id then raise exception 'Preview is already consumed' using errcode = '23505'; end if;
    return query select d.id, d.resolution_id,
      (select r.id from public.refunds_v2 r where r.resolution_id = d.resolution_id),
      (select r.id from public.transfer_reversals_v2 r where r.resolution_id = d.resolution_id),
      (select t.id from public.provider_transfers_v2 t where t.payment_id = s.payment_id)
      from public.service_dispute_decisions_v2 d
      join public.service_disputes_v2 s on s.id = d.dispute_id
      where d.dispute_id = v_preview.dispute_id;
    return;
  end if;
  if v_preview.expires_at < clock_timestamp() then raise exception 'Allocation preview expired' using errcode = '22023'; end if;
  select * into v_dispute from public.service_disputes_v2 where id = v_preview.dispute_id for update;
  select * into v_workflow from public.workflow_instances where id = v_dispute.workflow_instance_id for update;
  select a.id into v_previous from public.financial_allocation_snapshots a
    join public.checkout_v2_payments p on p.terms_snapshot_id = a.terms_snapshot_id
    where p.id = v_dispute.payment_id order by a.revision desc limit 1;
  if v_workflow.revision <> v_preview.workflow_revision
     or v_previous is distinct from v_preview.previous_allocation_snapshot_id then
    raise exception 'Case changed after preview; create a new preview' using errcode = '40001';
  end if;
  select * into v_result from public.decide_service_dispute_v2(
    v_preview.dispute_id, p_admin_id, v_preview.provider_awarded_gross_amount_cents,
    v_preview.provider_statutory_withholding_amount_cents,
    v_preview.client_tax_allocated_amount_cents, trim(p_reason),
    coalesce(p_evidence_manifest, '{}'::jsonb) || jsonb_build_object(
      'decision_code', v_preview.decision_code, 'allocation_preview_id', v_preview.id),
    p_mfa_authenticated_at, 'financial_admin_mfa_v1', p_expected_connect_revision,
    'admin-dispute-decision:' || p_operation_id::text
  );
  perform set_config('app.admin_dispute_preview_consume', 'on', true);
  update public.admin_dispute_allocation_previews_v2 set
    consumed_at = clock_timestamp(), operation_id = p_operation_id where id = v_preview.id;
  perform set_config('app.admin_dispute_preview_consume', 'off', true);
  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    reason, before_state, after_state, evidence, mfa_authenticated_at, deduplication_key
  ) values (
    p_admin_id, 'service_dispute_decided', 'service_dispute', v_dispute.id::text,
    'dispute.allocation.commit', 'success', trim(p_reason),
    jsonb_build_object('workflow_revision', v_preview.workflow_revision),
    to_jsonb(v_preview) || jsonb_build_object('resolution_id', v_result.resolution_id),
    coalesce(p_evidence_manifest, '{}'::jsonb), p_mfa_authenticated_at,
    'admin-dispute-decision:' || p_operation_id::text
  ) on conflict (deduplication_key) do nothing;
  return query select v_result.decision_id, v_result.resolution_id,
    v_result.refund_id, v_result.reversal_id, v_result.provider_transfer_id;
end
$$;

create or replace function public.record_admin_dispute_execution_audit_v2(
  p_admin_id uuid, p_dispute_id uuid, p_operation_id uuid, p_outcome text,
  p_operations jsonb, p_mfa_authenticated_at timestamptz
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if p_outcome not in ('success', 'failed') then raise exception 'Invalid audit outcome' using errcode = '22023'; end if;
  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    after_state, mfa_authenticated_at, deduplication_key
  ) values (
    p_admin_id, 'service_dispute_execution', 'service_dispute', p_dispute_id::text,
    'dispute.allocation.execute', p_outcome, coalesce(p_operations, '{}'::jsonb),
    p_mfa_authenticated_at, 'admin-dispute-execution:' || p_operation_id::text || ':' || p_outcome
  ) on conflict (deduplication_key) do nothing;
end
$$;

create or replace function public.admin_list_dispute_cases(
  p_queue text default 'disputes', p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_items jsonb; v_total integer; v_limit integer := least(greatest(p_limit,1),100);
begin
  perform public.assert_admin_permission('disputes.read');
  if p_queue not in ('disputes', 'cancellations') then raise exception 'Invalid queue' using errcode = '22023'; end if;
  if p_queue = 'disputes' then
    select count(*) into v_total from public.service_disputes_v2 d
      join public.workflow_instances w on w.id = d.workflow_instance_id
      where w.current_state <> 'resolved';
    select coalesce(jsonb_agg(item order by item->>'created_at' desc), '[]'::jsonb) into v_items from (
      select jsonb_build_object('case_type','dispute','id',d.id,'payment_id',d.payment_id,
        'mission_id',p.proposal_id,'issue_code',d.issue_code,'reason',d.reason,
        'state',w.current_state,'created_at',d.created_at,'updated_at',d.updated_at,
        'client_label',coalesce(nullif(trim(concat_ws(' ',cu.first_name,cu.last_name)),''),cu.email),
        'provider_label',coalesce(nullif(trim(concat_ws(' ',pu.first_name,pu.last_name)),''),pu.business_name,pu.email),
        'currency',p.currency,'client_total_amount_cents',p.amount_total_cents) item
      from public.service_disputes_v2 d join public.workflow_instances w on w.id=d.workflow_instance_id
      join public.checkout_v2_payments p on p.id=d.payment_id
      join public.users cu on cu.id=p.client_id join public.users pu on pu.id=p.provider_id
      where w.current_state <> 'resolved' order by d.updated_at desc limit v_limit offset greatest(p_offset,0)
    ) q;
  else
    select count(*) into v_total from public.cancellation_cases_v2 c
      join public.workflow_instances w on w.id=c.workflow_instance_id
      where w.current_state in ('routed_to_dispute','financial_resolution_pending')
        or (c.response_due_at <= clock_timestamp() and w.current_state in (
          'client_full_refund_requested','provider_partial_allocation_proposed','mutual_allocation_proposed'));
    select coalesce(jsonb_agg(item order by item->>'created_at' desc), '[]'::jsonb) into v_items from (
      select jsonb_build_object('case_type','cancellation','id',c.id,'payment_id',c.payment_id,
        'mission_id',p.proposal_id,'cancellation_type',c.cancellation_type,'reason',c.reason,
        'state',w.current_state,'created_at',c.created_at,'updated_at',c.updated_at,
        'linked_dispute_id',d.id,
        'client_label',coalesce(nullif(trim(concat_ws(' ',cu.first_name,cu.last_name)),''),cu.email),
        'provider_label',coalesce(nullif(trim(concat_ws(' ',pu.first_name,pu.last_name)),''),pu.business_name,pu.email),
        'currency',p.currency,'client_total_amount_cents',p.amount_total_cents) item
      from public.cancellation_cases_v2 c join public.workflow_instances w on w.id=c.workflow_instance_id
      join public.checkout_v2_payments p on p.id=c.payment_id
      join public.users cu on cu.id=p.client_id join public.users pu on pu.id=p.provider_id
      left join public.service_disputes_v2 d on d.cancellation_id=c.id
      where w.current_state in ('routed_to_dispute','financial_resolution_pending')
        or (c.response_due_at <= clock_timestamp() and w.current_state in (
          'client_full_refund_requested','provider_partial_allocation_proposed','mutual_allocation_proposed'))
      order by c.updated_at desc limit v_limit offset greatest(p_offset,0)
    ) q;
  end if;
  perform public.record_admin_read_audit('disputes.queue', p_queue, null,
    jsonb_build_object('result_count',jsonb_array_length(v_items),'offset',greatest(p_offset,0)));
  return jsonb_build_object('items',v_items,'total',v_total,'limit',v_limit,'offset',greatest(p_offset,0));
end
$$;

create or replace function public.admin_get_dispute_case(p_dispute_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_dispute public.service_disputes_v2%rowtype; v_payment public.checkout_v2_payments%rowtype;
  v_mission jsonb; v_workflow public.workflow_instances%rowtype; v_can_allocate boolean;
begin
  perform public.assert_admin_permission('disputes.read');
  select * into v_dispute from public.service_disputes_v2 where id=p_dispute_id;
  if not found then raise exception 'Service dispute not found' using errcode='P0002'; end if;
  select * into v_payment from public.checkout_v2_payments where id=v_dispute.payment_id;
  select * into v_workflow from public.workflow_instances where id=v_dispute.workflow_instance_id;
  v_mission := public.admin_get_mission_detail(v_payment.proposal_id);
  v_can_allocate := public.has_admin_permission('disputes.allocate')
    and public.has_admin_permission('finance.execute');
  perform public.record_admin_read_audit('dispute.detail','service_dispute',p_dispute_id::text,
    jsonb_build_object('state',v_workflow.current_state));
  return jsonb_build_object(
    'dispute',to_jsonb(v_dispute),'workflow',to_jsonb(v_workflow),'mission_detail',v_mission,
    'can_allocate',v_can_allocate,
    'evidence',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at)
      from public.service_dispute_evidence_v2 e where e.dispute_id=p_dispute_id),'[]'::jsonb),
    'timeline',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id)
      from public.workflow_transition_events e where e.instance_id=v_dispute.workflow_instance_id),'[]'::jsonb),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sender_id',m.sender_id,
      'content',m.content,'attachment_url',m.attachment_url,'created_at',m.created_at) order by m.created_at)
      from public.messages m join public.chats c on c.id=m.chat_id
      where c.mission_id=v_payment.proposal_id),'[]'::jsonb),
    'allocation_history',coalesce((select jsonb_agg(to_jsonb(a) order by a.revision)
      from public.financial_allocation_snapshots a where a.terms_snapshot_id=v_payment.terms_snapshot_id),'[]'::jsonb),
    'resolution',(select to_jsonb(r) from public.financial_resolutions_v2 r where r.service_dispute_id=p_dispute_id),
    'decision',(select to_jsonb(d) from public.service_dispute_decisions_v2 d where d.dispute_id=p_dispute_id),
    'refund',(select to_jsonb(r) from public.refunds_v2 r join public.financial_resolutions_v2 f on f.id=r.resolution_id where f.service_dispute_id=p_dispute_id),
    'reversal',(select to_jsonb(r) from public.transfer_reversals_v2 r join public.financial_resolutions_v2 f on f.id=r.resolution_id where f.service_dispute_id=p_dispute_id)
  );
end
$$;

create or replace function public.admin_get_cancellation_case(p_cancellation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_case public.cancellation_cases_v2%rowtype; v_payment public.checkout_v2_payments%rowtype;
  v_workflow public.workflow_instances%rowtype;
begin
  perform public.assert_admin_permission('disputes.read');
  select * into v_case from public.cancellation_cases_v2 where id=p_cancellation_id;
  if not found then raise exception 'Cancellation case not found' using errcode='P0002'; end if;
  select * into v_payment from public.checkout_v2_payments where id=v_case.payment_id;
  select * into v_workflow from public.workflow_instances where id=v_case.workflow_instance_id;
  perform public.record_admin_read_audit('cancellation.detail','cancellation',p_cancellation_id::text,
    jsonb_build_object('state',v_workflow.current_state));
  return jsonb_build_object('cancellation',to_jsonb(v_case),'workflow',to_jsonb(v_workflow),
    'mission_detail',public.admin_get_mission_detail(v_payment.proposal_id),
    'timeline',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id)
      from public.workflow_transition_events e where e.instance_id=v_case.workflow_instance_id),'[]'::jsonb),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sender_id',m.sender_id,
      'content',m.content,'attachment_url',m.attachment_url,'created_at',m.created_at) order by m.created_at)
      from public.messages m join public.chats c on c.id=m.chat_id
      where c.mission_id=v_payment.proposal_id),'[]'::jsonb),
    'allocation_proposals',coalesce((select jsonb_agg(to_jsonb(a) order by a.revision)
      from public.cancellation_allocation_proposals_v2 a where a.cancellation_id=p_cancellation_id),'[]'::jsonb),
    'linked_dispute_id',(select d.id from public.service_disputes_v2 d where d.cancellation_id=p_cancellation_id),
    'resolution',(select to_jsonb(r) from public.financial_resolutions_v2 r where r.cancellation_id=p_cancellation_id));
end
$$;

-- Private evidence storage. Paths are <dispute uuid>/<user uuid>/<filename>.
create or replace function public.can_access_dispute_evidence_v2(
  p_dispute_id uuid, p_require_decide boolean default false
)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and (
    (case when p_require_decide then public.has_admin_permission('disputes.decide')
      else public.has_admin_permission('disputes.read') end)
    or exists (select 1 from public.service_disputes_v2 d
      join public.checkout_v2_payments p on p.id=d.payment_id
      where d.id=p_dispute_id and auth.uid() in (p.client_id,p.provider_id))
  )
$$;

create or replace function public.can_admin_read_dispute_chat_attachment(p_chat_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.has_admin_permission('disputes.read') and exists (
    select 1 from public.chats c join public.checkout_v2_payments p on p.proposal_id=c.mission_id
    join public.service_disputes_v2 d on d.payment_id=p.id where c.id=p_chat_id
  )
$$;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('service-dispute-evidence','service-dispute-evidence',false,10485760,
  array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create policy "dispute_evidence_select_participant_or_admin" on storage.objects for select to authenticated
using (bucket_id='service-dispute-evidence' and (
  public.can_access_dispute_evidence_v2(split_part(name,'/',1)::uuid,false)));
create policy "dispute_evidence_insert_participant_or_admin" on storage.objects for insert to authenticated
with check (bucket_id='service-dispute-evidence' and owner_id=auth.uid()::text
  and cardinality(storage.foldername(name))=2
  and (storage.foldername(name))[2]=auth.uid()::text
  and public.can_access_dispute_evidence_v2(split_part(name,'/',1)::uuid,true));
create policy "chat_attachments_select_dispute_admin" on storage.objects for select to authenticated
using (bucket_id='chat_attachments'
  and public.can_admin_read_dispute_chat_attachment(split_part(name,'/',1)::uuid));

create or replace function public.add_service_dispute_evidence_v2(
  p_dispute_id uuid, p_actor_type text, p_actor_user_id uuid, p_statement text,
  p_attachments jsonb, p_deduplication_key text
)
returns public.service_dispute_evidence_v2 language plpgsql security definer set search_path=public,pg_temp as $$
declare v_dispute public.service_disputes_v2%rowtype; v_payment public.checkout_v2_payments%rowtype;
  v_evidence public.service_dispute_evidence_v2%rowtype; v_attachment jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  select * into v_dispute from public.service_disputes_v2 where id=p_dispute_id;
  select * into v_payment from public.checkout_v2_payments where id=v_dispute.payment_id;
  if not found or (p_actor_type='client' and v_payment.client_id<>p_actor_user_id)
    or (p_actor_type='provider' and v_payment.provider_id<>p_actor_user_id)
    or (p_actor_type='admin' and not public.admin_account_has_permission(p_actor_user_id,'disputes.decide'))
    or p_actor_type not in ('client','provider','admin') then
    raise exception 'Evidence actor is not authorized' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(p_attachments,'[]'::jsonb))<>'array' then
    raise exception 'Attachments must be an array' using errcode='22023';
  end if;
  for v_attachment in select value from jsonb_array_elements(coalesce(p_attachments,'[]'::jsonb)) loop
    if v_attachment->>'bucket' <> 'service-dispute-evidence'
       or split_part(v_attachment->>'path','/',1) <> p_dispute_id::text
       or split_part(v_attachment->>'path','/',2) <> p_actor_user_id::text
       or not exists (select 1 from storage.objects o where o.bucket_id='service-dispute-evidence'
         and o.name=v_attachment->>'path' and o.owner_id=p_actor_user_id::text) then
      raise exception 'Invalid or missing private evidence attachment' using errcode='22023';
    end if;
  end loop;
  insert into public.service_dispute_evidence_v2(dispute_id,submitted_by_actor_type,
    submitted_by,statement,attachments,deduplication_key)
  values(p_dispute_id,p_actor_type,p_actor_user_id,p_statement,
    coalesce(p_attachments,'[]'::jsonb),p_deduplication_key)
  on conflict(deduplication_key) do update set deduplication_key=excluded.deduplication_key
  returning * into v_evidence;
  return v_evidence;
end
$$;

revoke all on function public.protect_admin_dispute_preview_v2() from public,anon,authenticated;
revoke all on function public.can_access_dispute_evidence_v2(uuid,boolean) from public,anon;
revoke all on function public.can_admin_read_dispute_chat_attachment(uuid) from public,anon;
revoke all on function public.admin_preview_service_dispute_allocation_v2(uuid,text,bigint,bigint,bigint) from public,anon;
revoke all on function public.execute_admin_service_dispute_decision_v2(uuid,uuid,text,jsonb,timestamptz,bigint,uuid) from public,anon,authenticated;
revoke all on function public.record_admin_dispute_execution_audit_v2(uuid,uuid,uuid,text,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.admin_list_dispute_cases(text,integer,integer) from public,anon;
revoke all on function public.admin_get_dispute_case(uuid) from public,anon;
revoke all on function public.admin_get_cancellation_case(uuid) from public,anon;
grant execute on function public.admin_preview_service_dispute_allocation_v2(uuid,text,bigint,bigint,bigint) to authenticated;
grant execute on function public.can_access_dispute_evidence_v2(uuid,boolean) to authenticated;
grant execute on function public.can_admin_read_dispute_chat_attachment(uuid) to authenticated;
grant execute on function public.admin_list_dispute_cases(text,integer,integer) to authenticated;
grant execute on function public.admin_get_dispute_case(uuid) to authenticated;
grant execute on function public.admin_get_cancellation_case(uuid) to authenticated;
grant execute on function public.execute_admin_service_dispute_decision_v2(uuid,uuid,text,jsonb,timestamptz,bigint,uuid) to service_role;
grant execute on function public.record_admin_dispute_execution_audit_v2(uuid,uuid,uuid,text,jsonb,timestamptz) to service_role;
