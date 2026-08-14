-- Read-only administration operations for overview, users and missions.
-- Financial records are selected only for administrators holding finance.read;
-- this migration creates no financial mutation path and changes no feature flag.

begin;

create or replace function public.record_admin_read_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_evidence jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_id text := nullif(auth.jwt() ->> 'session_id', '');
  v_bucket text := to_char(date_trunc('minute', clock_timestamp()), 'YYYYMMDDHH24MI');
  v_key text;
begin
  perform public.assert_admin_permission('admin.access');
  if p_action is null or length(trim(p_action)) not between 3 and 100
     or p_entity_type is null or length(trim(p_entity_type)) not between 3 and 100
     or coalesce(jsonb_typeof(p_evidence), 'object') <> 'object' then
    raise exception 'Invalid administration read audit input' using errcode = '22023';
  end if;

  v_key := concat_ws(':', 'admin-read', auth.uid()::text,
    coalesce(v_session_id, 'no-session'), p_action,
    coalesce(p_entity_id, 'collection'), v_bucket);

  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    evidence, session_id, mfa_authenticated_at, deduplication_key
  ) values (
    auth.uid(), 'administration_read', p_entity_type, p_entity_id,
    p_action, 'success', coalesce(p_evidence, '{}'::jsonb), v_session_id,
    public.admin_current_mfa_authenticated_at(), v_key
  ) on conflict (deduplication_key) do nothing;
end
$$;

create or replace function public.admin_get_operations_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_items jsonb;
  v_verifications jsonb := jsonb_build_object('available', false, 'count', null, 'items', '[]'::jsonb);
  v_disputes jsonb := jsonb_build_object('available', false, 'count', null, 'items', '[]'::jsonb);
  v_financial_incidents jsonb := jsonb_build_object('available', false, 'count', null, 'items', '[]'::jsonb);
  v_chargebacks jsonb := jsonb_build_object('available', false, 'count', null, 'items', '[]'::jsonb);
  v_mission_anomalies jsonb := jsonb_build_object('available', false, 'count', null, 'items', '[]'::jsonb);
  v_connect_actions jsonb := jsonb_build_object('available', false, 'count', null, 'items', '[]'::jsonb);
begin
  perform public.assert_admin_permission('admin.access');

  if public.has_admin_permission('verification.read') then
    select coalesce(max(item.total_count), 0)::integer,
      coalesce(jsonb_agg((to_jsonb(item) - 'total_count') order by item.submitted_at asc), '[]'::jsonb)
    into v_count, v_items
    from (
      select u.id as user_id,
        coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
          u.business_name, u.email, 'Prestataire') as label,
        u.email, u.verification_submitted_at as submitted_at,
        count(*) over () as total_count
      from public.users u
      where u.role = 'pro' and u.verification_status = 'pending'
      order by u.verification_submitted_at asc nulls first, u.id
      limit 10
    ) item;
    v_verifications := jsonb_build_object('available', true, 'count', v_count, 'items', v_items);
  end if;

  if public.has_admin_permission('disputes.read') then
    select coalesce(max(item.total_count), 0)::integer,
      coalesce(jsonb_agg((to_jsonb(item) - 'total_count') order by item.created_at asc), '[]'::jsonb)
    into v_count, v_items
    from (
      select d.id as dispute_id, p.proposal_id as mission_id, d.issue_code,
        d.reason, d.created_at, count(*) over () as total_count
      from public.service_disputes_v2 d
      join public.checkout_v2_payments p on p.id = d.payment_id
      where d.resolved_at is null
      order by d.created_at asc, d.id
      limit 10
    ) item;
    v_disputes := jsonb_build_object('available', true, 'count', v_count, 'items', v_items);
  end if;

  if public.has_admin_permission('finance.read') then
    select coalesce(max(item.total_count), 0)::integer,
      coalesce(jsonb_agg((to_jsonb(item) - 'total_count') order by item.occurred_at asc), '[]'::jsonb)
    into v_count, v_items
    from (
      select incident.*, count(*) over () as total_count
      from (
        select 'recovery_deficit'::text as incident_type, d.id::text as incident_id,
          d.payment_id, d.amount_cents, d.currency, d.reason as detail,
          d.created_at as occurred_at
        from public.financial_recovery_deficits_v2 d
        where d.status = 'admin_review'
        union all
        select 'remediation_manual_review', a.id::text,
          coalesce(r.payment_id, t.payment_id), null::bigint, null::text,
          coalesce(a.error_message, a.error_code, a.operation_type), a.created_at
        from public.financial_remediation_attempts_v2 a
        left join public.refunds_v2 r on r.id = a.refund_id
        left join public.transfer_reversals_v2 t on t.id = a.transfer_reversal_id
        where a.outcome = 'manual_review'
        union all
        select 'transfer_manual_review', a.id::text, t.payment_id, t.amount_cents,
          t.currency, coalesce(a.error_message, a.error_code), a.created_at
        from public.provider_transfer_v2_attempts a
        join public.provider_transfers_v2 t on t.id = a.transfer_id
        where a.outcome = 'manual_review'
        union all
        select 'payout_failure', p.id::text, null::uuid,
          p.provider_balance_debit_amount_cents, p.currency,
          coalesce(p.failure_message, p.failure_code), coalesce(p.failed_at, p.updated_at)
        from public.provider_payouts_v2 p
        where p.failed_at is not null
      ) incident
      order by incident.occurred_at asc, incident.incident_id
      limit 10
    ) item;
    v_financial_incidents := jsonb_build_object('available', true, 'count', v_count, 'items', v_items);
  end if;

  if public.has_admin_permission('risk.read') then
    select coalesce(max(item.total_count), 0)::integer,
      coalesce(jsonb_agg((to_jsonb(item) - 'total_count') order by item.opened_at asc), '[]'::jsonb)
    into v_count, v_items
    from (
      select d.id as dispute_id, p.proposal_id as mission_id,
        d.stripe_dispute_id, d.stripe_status, d.reason_code,
        d.amount_debited_cents, d.currency, d.opened_at,
        count(*) over () as total_count
      from public.payment_disputes_v2 d
      join public.checkout_v2_payments p on p.id = d.payment_id
      where d.resolved_at is null
      order by d.opened_at asc, d.id
      limit 10
    ) item;
    v_chargebacks := jsonb_build_object('available', true, 'count', v_count, 'items', v_items);
  end if;

  if public.has_admin_permission('missions.read') then
    select coalesce(max(item.total_count), 0)::integer,
      coalesce(jsonb_agg((to_jsonb(item) - 'total_count') order by item.occurred_at asc), '[]'::jsonb)
    into v_count, v_items
    from (
      select anomaly.*, count(*) over () as total_count
      from (
        select 'problem_reported'::text as anomaly_type, e.proposal_id as mission_id,
          e.problem_code as detail, e.problem_reported_at as occurred_at
        from public.service_executions_v2 e
        where e.problem_reported_at is not null
          and not exists (select 1 from public.service_disputes_v2 d
            where d.payment_id = e.payment_id and d.resolved_at is not null)
        union all
        select 'release_blocked', p.proposal_id,
          array_to_string(r.blocker_codes, ', '), r.blocked_at
        from public.fund_releases_v2 r
        join public.checkout_v2_payments p on p.id = r.payment_id
        where r.blocked_at is not null and r.released_at is null
        union all
        select 'transfer_manual_review', p.proposal_id,
          coalesce(a.error_message, a.error_code), a.created_at
        from public.provider_transfer_v2_attempts a
        join public.provider_transfers_v2 t on t.id = a.transfer_id
        join public.checkout_v2_payments p on p.id = t.payment_id
        where a.outcome = 'manual_review'
        union all
        select 'payment_deadline_elapsed', s.selected_proposal_id,
          'Payment deadline elapsed while the exclusive lock is still active.', s.payment_deadline_at
        from public.checkout_v2_selections s
        where s.lock_released_at is null and s.payment_deadline_at < clock_timestamp()
          and not exists (select 1 from public.checkout_v2_payments p where p.selection_id = s.id)
      ) anomaly
      order by anomaly.occurred_at asc, anomaly.mission_id
      limit 10
    ) item;
    v_mission_anomalies := jsonb_build_object('available', true, 'count', v_count, 'items', v_items);
  end if;

  if public.has_admin_permission('users.read') then
    select coalesce(max(item.total_count), 0)::integer,
      coalesce(jsonb_agg((to_jsonb(item) - 'total_count') order by item.updated_at asc), '[]'::jsonb)
    into v_count, v_items
    from (
      select c.provider_id,
        coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
          u.business_name, u.email, 'Prestataire') as label,
        c.stripe_account_id, c.creation_state, c.stripe_transfers_status,
        c.payouts_status, c.updated_at, count(*) over () as total_count
      from public.provider_connect_accounts c
      join public.users u on u.id = c.provider_id
      where c.creation_state in ('creating', 'sync_failed')
         or c.closed or not c.connection_enabled
         or c.stripe_transfers_status <> 'active'
         or c.payouts_status <> 'active'
      order by c.updated_at asc, c.provider_id
      limit 10
    ) item;
    v_connect_actions := jsonb_build_object('available', true, 'count', v_count, 'items', v_items);
  end if;

  perform public.record_admin_read_audit(
    'overview.read', 'admin_overview', null,
    jsonb_build_object('visible_queue_count',
      (case when (v_verifications ->> 'available')::boolean then 1 else 0 end)
      + (case when (v_disputes ->> 'available')::boolean then 1 else 0 end)
      + (case when (v_financial_incidents ->> 'available')::boolean then 1 else 0 end)
      + (case when (v_chargebacks ->> 'available')::boolean then 1 else 0 end)
      + (case when (v_mission_anomalies ->> 'available')::boolean then 1 else 0 end)
      + (case when (v_connect_actions ->> 'available')::boolean then 1 else 0 end))
  );

  return jsonb_build_object(
    'generated_at', clock_timestamp(),
    'queues', jsonb_build_object(
      'verifications', v_verifications,
      'service_disputes', v_disputes,
      'financial_incidents', v_financial_incidents,
      'chargebacks', v_chargebacks,
      'mission_anomalies', v_mission_anomalies,
      'connect_actions', v_connect_actions
    )
  );
end
$$;

create or replace function public.admin_global_search(
  p_query text,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_can_users boolean := public.has_admin_permission('users.read');
  v_can_missions boolean := public.has_admin_permission('missions.read');
  v_can_finance boolean := public.has_admin_permission('finance.read');
  v_results jsonb;
begin
  perform public.assert_admin_permission('admin.access');
  if length(v_query) < 2 or length(v_query) > 200 then
    raise exception 'Search query length must be between 2 and 200 characters' using errcode = '22023';
  end if;
  if not v_can_users and not v_can_missions then
    raise exception 'Search permission required' using errcode = '42501';
  end if;

  with matches as (
    select 'user'::text as result_type, u.id as result_id,
      coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
        u.business_name, u.email, 'Utilisateur') as title,
      concat_ws(' · ', u.email, u.role,
        case when u.verification_status is not null then 'vérification ' || u.verification_status end) as subtitle,
      '/utilisateurs/' || u.id::text as route,
      case when lower(u.id::text) = v_query or lower(coalesce(u.email, '')) = v_query then 0
        when lower(coalesce(u.email, '')) like v_query || '%' then 1 else 2 end as rank
    from public.users u
    left join public.provider_connect_accounts c on c.provider_id = u.id
    where v_can_users and (
      strpos(lower(u.id::text), v_query) > 0
      or strpos(lower(coalesce(u.email, '')), v_query) > 0
      or strpos(lower(coalesce(u.username, '')), v_query) > 0
      or strpos(lower(coalesce(u.first_name, '')), v_query) > 0
      or strpos(lower(coalesce(u.last_name, '')), v_query) > 0
      or strpos(lower(coalesce(u.business_name, '')), v_query) > 0
      or strpos(lower(coalesce(u.stripe_account_id, '')), v_query) > 0
      or strpos(lower(coalesce(c.stripe_account_id, '')), v_query) > 0
    )
    union all
    select 'mission', m.id,
      coalesce(m.service, 'Mission') || ' · ' || left(m.id::text, 8),
      concat_ws(' · ', m.status, m.financial_flow_version,
        case when m.booking_id is not null then 'demande ' || left(m.booking_id::text, 8) end),
      '/missions/' || m.id::text,
      case when lower(m.id::text) = v_query or lower(coalesce(m.booking_id::text, '')) = v_query then 0
        when lower(m.id::text) like v_query || '%' then 1 else 2 end
    from public.missions m
    left join public.checkout_v2_payments p on p.proposal_id = m.id
    left join lateral (
      select lp.stripe_payment_id, lp.stripe_session_id
      from public.payments lp where lp.mission_id = m.id
      order by lp.created_at desc limit 1
    ) legacy_payment on true
    where v_can_missions and (
      strpos(lower(m.id::text), v_query) > 0
      or strpos(lower(coalesce(m.booking_id::text, '')), v_query) > 0
      or strpos(lower(coalesce(m.service, '')), v_query) > 0
      or (v_can_finance and (
        strpos(lower(coalesce(p.stripe_payment_intent_id, '')), v_query) > 0
        or strpos(lower(coalesce(p.stripe_charge_id, '')), v_query) > 0
        or strpos(lower(coalesce(p.stripe_session_id, '')), v_query) > 0
        or strpos(lower(coalesce(legacy_payment.stripe_payment_id, '')), v_query) > 0
        or strpos(lower(coalesce(legacy_payment.stripe_session_id, '')), v_query) > 0
      ))
    )
  )
  select coalesce(jsonb_agg(to_jsonb(result) - 'rank' order by result.rank, result.title), '[]'::jsonb)
  into v_results
  from (select * from matches order by rank, title limit v_limit) result;

  perform public.record_admin_read_audit(
    'global_search.read', 'admin_search', null,
    jsonb_build_object('query_length', length(v_query), 'result_count', jsonb_array_length(v_results))
  );
  return jsonb_build_object('results', v_results, 'result_count', jsonb_array_length(v_results));
end
$$;

create or replace function public.admin_list_users(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total integer;
  v_items jsonb;
begin
  perform public.assert_admin_permission('users.read');
  if length(v_query) > 200 then raise exception 'Search query is too long' using errcode = '22023'; end if;

  select coalesce(max(item.total_count), 0)::integer,
    coalesce(jsonb_agg((to_jsonb(item) - 'total_count') order by item.created_at desc), '[]'::jsonb)
  into v_total, v_items
  from (
    select u.id, u.email, u.first_name, u.last_name, u.business_name,
      u.role, u.active_role, u.verification_status, u.onboarding_completed,
      u.created_at, a.status as eligibility_status,
      c.creation_state as connect_creation_state,
      c.stripe_transfers_status, c.payouts_status,
      count(*) over () as total_count
    from public.users u
    left join lateral (
      select assessment.status from public.provider_eligibility_assessments assessment
      where assessment.provider_id = u.id
      order by assessment.revision desc, assessment.created_at desc limit 1
    ) a on true
    left join public.provider_connect_accounts c on c.provider_id = u.id
    where v_query = ''
      or strpos(lower(u.id::text), v_query) > 0
      or strpos(lower(coalesce(u.email, '')), v_query) > 0
      or strpos(lower(coalesce(u.username, '')), v_query) > 0
      or strpos(lower(coalesce(u.first_name, '')), v_query) > 0
      or strpos(lower(coalesce(u.last_name, '')), v_query) > 0
      or strpos(lower(coalesce(u.business_name, '')), v_query) > 0
    order by u.created_at desc, u.id
    limit v_limit offset v_offset
  ) item;

  perform public.record_admin_read_audit(
    'users.list', 'user_collection', null,
    jsonb_build_object('query_length', length(v_query), 'result_count', jsonb_array_length(v_items),
      'offset', v_offset)
  );
  return jsonb_build_object('items', v_items, 'total', v_total,
    'limit', v_limit, 'offset', v_offset);
end
$$;

create or replace function public.admin_get_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile jsonb;
  v_declaration jsonb;
  v_assessment jsonb;
  v_connect jsonb;
  v_verification_history jsonb;
  v_activity jsonb;
begin
  perform public.assert_admin_permission('users.read');

  select jsonb_build_object(
    'id', u.id, 'email', u.email, 'username', u.username,
    'first_name', u.first_name, 'last_name', u.last_name,
    'business_name', u.business_name, 'business_type', u.business_type,
    'role', u.role, 'active_role', u.active_role,
    'profile_status', case when u.onboarding_completed then 'complete' else 'incomplete' end,
    'onboarding_completed', u.onboarding_completed, 'accepting_clients', u.accepting_clients,
    'phone_number', u.phone_number, 'city', u.city, 'country', u.country,
    'professional_email', u.professional_email, 'company_number', u.company_number,
    'vat_number', u.vat_number, 'no_vat', u.no_vat,
    'verification_status', u.verification_status,
    'verification_submitted_at', u.verification_submitted_at,
    'verified_at', u.verified_at,
    'verification_rejection_reason', u.verification_rejection_reason,
    'created_at', u.created_at, 'updated_at', u.updated_at
  ) into v_profile from public.users u where u.id = p_user_id;
  if v_profile is null then raise exception 'User not found' using errcode = 'P0002'; end if;

  select jsonb_build_object(
    'id', d.id, 'revision', d.revision,
    'residence_country_code', d.residence_country_code,
    'tax_residence_country_codes', d.tax_residence_country_codes,
    'service_country_code', d.service_country_code,
    'provider_status_code', d.provider_status_code,
    'trader_classification', d.trader_classification,
    'business_registration_number', d.business_registration_number,
    'vat_number', d.vat_number, 'created_at', d.created_at
  ) into v_declaration
  from public.provider_eligibility_declarations d
  where d.provider_id = p_user_id order by d.revision desc, d.created_at desc limit 1;

  select jsonb_build_object(
    'id', a.id, 'policy_version', a.policy_version,
    'service_country_code', a.service_country_code,
    'service_category_code', a.service_category_code,
    'revision', a.revision, 'status', a.status,
    'valid_until', a.valid_until, 'reason', a.reason,
    'created_at', a.created_at
  ) into v_assessment
  from public.provider_eligibility_assessments a
  where a.provider_id = p_user_id order by a.revision desc, a.created_at desc limit 1;

  select jsonb_build_object(
    'stripe_account_id', c.stripe_account_id,
    'account_api_version', c.account_api_version,
    'creation_state', c.creation_state,
    'stripe_transfers_status', c.stripe_transfers_status,
    'payouts_status', c.payouts_status,
    'requirements', c.requirements,
    'future_requirements', c.future_requirements,
    'livemode', c.livemode, 'closed', c.closed,
    'connection_enabled', c.connection_enabled,
    'last_synced_at', c.last_synced_at, 'updated_at', c.updated_at
  ) into v_connect from public.provider_connect_accounts c where c.provider_id = p_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'previous_status', r.previous_status, 'decision', r.decision,
    'reason', r.reason, 'reviewer_id', r.reviewer_id, 'reviewed_at', r.reviewed_at
  ) order by r.reviewed_at desc), '[]'::jsonb)
  into v_verification_history
  from (select * from public.professional_verification_reviews
    where professional_id = p_user_id order by reviewed_at desc limit 25) r;

  select jsonb_build_object(
    'requests_created', (select count(*) from public.bookings b where b.client_id = p_user_id),
    'proposals_created', (select count(*) from public.missions m where m.pro_id = p_user_id),
    'missions_as_client', (select count(*) from public.missions m where m.client_id = p_user_id),
    'recent_missions', coalesce((select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (select m.id, m.booking_id, m.service, m.status, m.financial_flow_version,
        m.created_at from public.missions m
        where m.client_id = p_user_id or m.pro_id = p_user_id
        order by m.created_at desc limit 20) recent), '[]'::jsonb)
  ) into v_activity;

  perform public.record_admin_read_audit(
    'user.detail', 'user', p_user_id::text,
    jsonb_build_object('connect_present', v_connect is not null,
      'eligibility_present', v_assessment is not null)
  );
  return jsonb_build_object('profile', v_profile,
    'eligibility_declaration', v_declaration,
    'eligibility_assessment', v_assessment,
    'connect_account', v_connect,
    'verification_history', v_verification_history,
    'activity', v_activity);
end
$$;

create or replace function public.admin_list_missions(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total integer;
  v_items jsonb;
begin
  perform public.assert_admin_permission('missions.read');
  if length(v_query) > 200 then raise exception 'Search query is too long' using errcode = '22023'; end if;

  select coalesce(max(item.total_count), 0)::integer,
    coalesce(jsonb_agg((to_jsonb(item) - 'total_count') order by item.created_at desc), '[]'::jsonb)
  into v_total, v_items
  from (
    select m.id, m.booking_id, m.service, m.status, m.financial_flow_version,
      m.client_id, m.pro_id as provider_id, m.date as scheduled_at, m.created_at,
      coalesce(nullif(trim(concat_ws(' ', client.first_name, client.last_name)), ''), client.email) as client_label,
      coalesce(nullif(trim(concat_ws(' ', provider.first_name, provider.last_name)), ''), provider.business_name, provider.email) as provider_label,
      case when p.id is not null then 'paid'
        when s.id is not null and s.lock_released_at is null then 'payment_pending'
        else null end as payment_state,
      count(*) over () as total_count
    from public.missions m
    left join public.users client on client.id = m.client_id
    left join public.users provider on provider.id = m.pro_id
    left join public.checkout_v2_payments p on p.proposal_id = m.id
    left join lateral (
      select selection.id, selection.lock_released_at
      from public.checkout_v2_selections selection
      where selection.selected_proposal_id = m.id
      order by (selection.lock_released_at is null) desc, selection.created_at desc
      limit 1
    ) s on true
    where v_query = ''
      or strpos(lower(m.id::text), v_query) > 0
      or strpos(lower(coalesce(m.booking_id::text, '')), v_query) > 0
      or strpos(lower(coalesce(m.service, '')), v_query) > 0
      or strpos(lower(coalesce(client.email, '')), v_query) > 0
      or strpos(lower(coalesce(provider.email, '')), v_query) > 0
    order by m.created_at desc, m.id
    limit v_limit offset v_offset
  ) item;

  perform public.record_admin_read_audit(
    'missions.list', 'mission_collection', null,
    jsonb_build_object('query_length', length(v_query), 'result_count', jsonb_array_length(v_items),
      'offset', v_offset)
  );
  return jsonb_build_object('items', v_items, 'total', v_total,
    'limit', v_limit, 'offset', v_offset);
end
$$;

create or replace function public.admin_get_mission_detail(p_mission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_request jsonb;
  v_client jsonb;
  v_provider jsonb;
  v_proposals jsonb;
  v_contract jsonb;
  v_workflows jsonb;
  v_history jsonb;
  v_financial jsonb := null;
  v_can_finance boolean := public.has_admin_permission('finance.read');
begin
  perform public.assert_admin_permission('missions.read');
  select * into v_mission from public.missions where id = p_mission_id;
  if not found then raise exception 'Mission not found' using errcode = 'P0002'; end if;

  select jsonb_build_object('id', b.id, 'service', b.service, 'date', b.date,
    'time_slot', b.time_slot, 'address', b.address, 'notes', b.notes,
    'status', b.status, 'client_id', b.client_id, 'provider_id', b.pro_id,
    'created_at', b.created_at, 'updated_at', b.updated_at)
  into v_request from public.bookings b where b.id = v_mission.booking_id;

  select jsonb_build_object('id', u.id, 'email', u.email, 'first_name', u.first_name,
    'last_name', u.last_name, 'username', u.username, 'role', u.role,
    'verification_status', u.verification_status)
  into v_client from public.users u where u.id = v_mission.client_id;
  select jsonb_build_object('id', u.id, 'email', u.email, 'first_name', u.first_name,
    'last_name', u.last_name, 'business_name', u.business_name, 'role', u.role,
    'verification_status', u.verification_status)
  into v_provider from public.users u where u.id = v_mission.pro_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'provider_id', m.pro_id, 'status', m.status,
    'financial_flow_version', m.financial_flow_version,
    'scheduled_at', m.date, 'duration_minutes', m.duration,
    'description', m.description, 'created_at', m.created_at,
    'selected', m.id = p_mission_id,
    'provider_label', coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
      u.business_name, u.email)
  ) order by m.created_at, m.id), '[]'::jsonb)
  into v_proposals
  from public.missions m left join public.users u on u.id = m.pro_id
  where (v_mission.booking_id is not null and m.booking_id = v_mission.booking_id)
     or (v_mission.booking_id is null and m.id = v_mission.id);

  select jsonb_build_object(
    'id', t.id, 'financial_flow_version', t.financial_flow_version,
    'proposal_version', t.proposal_version, 'currency', t.currency,
    'scheduled_start_at', t.scheduled_start_at,
    'scheduled_end_at', t.scheduled_end_at,
    'completion_not_before_at', t.completion_not_before_at,
    'jurisdiction_code', t.jurisdiction_code,
    'contract_version', t.contract_version,
    'eligibility_policy_version', t.eligibility_policy_version,
    'cancellation_policy_version', t.cancellation_policy_version,
    'created_at', t.created_at
  ) into v_contract
  from public.financial_terms_snapshots t
  where t.proposal_id = p_mission_id order by t.proposal_version desc limit 1;

  with related_workflows as (
    select s.request_workflow_instance_id as id from public.checkout_v2_selections s
      where s.selected_proposal_id = p_mission_id
    union select s.proposal_workflow_instance_id from public.checkout_v2_selections s
      where s.selected_proposal_id = p_mission_id
    union select s.selection_workflow_instance_id from public.checkout_v2_selections s
      where s.selected_proposal_id = p_mission_id
    union select a.workflow_instance_id from public.checkout_v2_attempts a
      join public.checkout_v2_selections s on s.id = a.selection_id where s.selected_proposal_id = p_mission_id
    union select p.workflow_instance_id from public.checkout_v2_payments p where p.proposal_id = p_mission_id
    union select e.workflow_instance_id from public.service_executions_v2 e where e.proposal_id = p_mission_id
    union select r.workflow_instance_id from public.fund_releases_v2 r
      join public.checkout_v2_payments p on p.id = r.payment_id where p.proposal_id = p_mission_id
    union select t.workflow_instance_id from public.provider_transfers_v2 t
      join public.checkout_v2_payments p on p.id = t.payment_id where p.proposal_id = p_mission_id
    union select c.workflow_instance_id from public.cancellation_cases_v2 c
      join public.checkout_v2_payments p on p.id = c.payment_id where p.proposal_id = p_mission_id
    union select d.workflow_instance_id from public.service_disputes_v2 d
      join public.checkout_v2_payments p on p.id = d.payment_id where p.proposal_id = p_mission_id
    union select d.workflow_instance_id from public.payment_disputes_v2 d
      join public.checkout_v2_payments p on p.id = d.payment_id where p.proposal_id = p_mission_id
    union select r.workflow_instance_id from public.refunds_v2 r
      join public.checkout_v2_payments p on p.id = r.payment_id where p.proposal_id = p_mission_id
    union select r.workflow_instance_id from public.transfer_reversals_v2 r
      join public.checkout_v2_payments p on p.id = r.payment_id where p.proposal_id = p_mission_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id, 'machine_code', w.machine_code, 'machine_version', w.machine_version,
    'subject_type', w.subject_type, 'subject_id', w.subject_id,
    'current_state', w.current_state, 'revision', w.revision,
    'created_at', w.created_at, 'updated_at', w.updated_at
  ) order by w.created_at, w.machine_code), '[]'::jsonb)
  into v_workflows from public.workflow_instances w
  where w.id in (select id from related_workflows);

  with related_workflows as (
    select (entry ->> 'id')::uuid as id from jsonb_array_elements(v_workflows) entry
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'instance_id', e.instance_id, 'machine_code', w.machine_code,
    'event_kind', e.event_kind, 'transition_code', e.transition_code,
    'from_state', e.from_state, 'to_state', e.to_state,
    'actor_type', e.actor_type, 'actor_user_id', e.actor_user_id,
    'reason', e.reason, 'revision', e.revision, 'created_at', e.created_at
  ) order by e.created_at, e.id), '[]'::jsonb)
  into v_history
  from public.workflow_transition_events e
  join public.workflow_instances w on w.id = e.instance_id
  where e.instance_id in (select id from related_workflows);

  if v_can_finance then
    select jsonb_build_object(
      'terms_snapshot', (select to_jsonb(t) from public.financial_terms_snapshots t
        where t.proposal_id = p_mission_id order by t.proposal_version desc limit 1),
      'legacy_payments', coalesce((select jsonb_agg(to_jsonb(lp) order by lp.created_at desc)
        from public.payments lp where lp.mission_id = p_mission_id), '[]'::jsonb),
      'payment', (select to_jsonb(p) from public.checkout_v2_payments p where p.proposal_id = p_mission_id),
      'release', (select to_jsonb(r) from public.fund_releases_v2 r
        join public.checkout_v2_payments p on p.id = r.payment_id where p.proposal_id = p_mission_id),
      'transfer', (select to_jsonb(t) from public.provider_transfers_v2 t
        join public.checkout_v2_payments p on p.id = t.payment_id where p.proposal_id = p_mission_id),
      'active_holds', coalesce((select jsonb_agg(to_jsonb(h) order by h.opened_at)
        from public.checkout_v2_financial_holds h
        join public.checkout_v2_payments p on p.id = h.payment_id
        where p.proposal_id = p_mission_id and h.released_at is null), '[]'::jsonb),
      'refunds', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at)
        from public.refunds_v2 r join public.checkout_v2_payments p on p.id = r.payment_id
        where p.proposal_id = p_mission_id), '[]'::jsonb),
      'service_dispute', (select to_jsonb(d) from public.service_disputes_v2 d
        join public.checkout_v2_payments p on p.id = d.payment_id where p.proposal_id = p_mission_id),
      'payment_disputes', coalesce((select jsonb_agg(to_jsonb(d) order by d.opened_at)
        from public.payment_disputes_v2 d join public.checkout_v2_payments p on p.id = d.payment_id
        where p.proposal_id = p_mission_id), '[]'::jsonb),
      'reversals', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at)
        from public.transfer_reversals_v2 r join public.checkout_v2_payments p on p.id = r.payment_id
        where p.proposal_id = p_mission_id), '[]'::jsonb),
      'recovery_deficits', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at)
        from public.financial_recovery_deficits_v2 d
        join public.checkout_v2_payments p on p.id = d.payment_id
        where p.proposal_id = p_mission_id), '[]'::jsonb)
    ) into v_financial;
  end if;

  perform public.record_admin_read_audit(
    'mission.detail', 'mission', p_mission_id::text,
    jsonb_build_object('financial_data_included', v_can_finance,
      'workflow_count', jsonb_array_length(v_workflows))
  );

  return jsonb_build_object(
    'mission', jsonb_build_object('id', v_mission.id, 'booking_id', v_mission.booking_id,
      'client_id', v_mission.client_id, 'provider_id', v_mission.pro_id,
      'service', v_mission.service, 'description', v_mission.description,
      'scheduled_at', v_mission.date, 'duration_minutes', v_mission.duration,
      'status', v_mission.status, 'financial_flow_version', v_mission.financial_flow_version,
      'created_at', v_mission.created_at, 'updated_at', v_mission.updated_at),
    'request', v_request, 'client', v_client, 'provider', v_provider,
    'proposals', v_proposals, 'contract_snapshot', v_contract,
    'workflow_instances', v_workflows, 'history', v_history,
    'financial_access', v_can_finance, 'financial', v_financial
  );
end
$$;

revoke all on function public.record_admin_read_audit(text,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.admin_get_operations_overview() from public, anon;
revoke all on function public.admin_global_search(text,integer) from public, anon;
revoke all on function public.admin_list_users(text,integer,integer) from public, anon;
revoke all on function public.admin_get_user_detail(uuid) from public, anon;
revoke all on function public.admin_list_missions(text,integer,integer) from public, anon;
revoke all on function public.admin_get_mission_detail(uuid) from public, anon;

grant execute on function public.admin_get_operations_overview() to authenticated;
grant execute on function public.admin_global_search(text,integer) to authenticated;
grant execute on function public.admin_list_users(text,integer,integer) to authenticated;
grant execute on function public.admin_get_user_detail(uuid) to authenticated;
grant execute on function public.admin_list_missions(text,integer,integer) to authenticated;
grant execute on function public.admin_get_mission_detail(uuid) to authenticated;

commit;
