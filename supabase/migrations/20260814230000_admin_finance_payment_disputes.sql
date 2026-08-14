-- Secure administration of marketplace_v2 finance and Stripe payment disputes.
-- This migration exposes read models and controlled retries only. It does not
-- enable marketplace_v2 or create arbitrary refunds, reversals, or transfers.

begin;

create table public.admin_financial_operation_previews_v2 (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admin_accounts(user_id) on delete restrict,
  operation_type text not null check (operation_type in (
    'refund', 'transfer_reversal', 'provider_retransfer'
  )),
  operation_id uuid not null,
  payment_id uuid not null references public.checkout_v2_payments(id) on delete restrict,
  workflow_instance_id uuid not null references public.workflow_instances(id) on delete restrict,
  workflow_revision bigint not null check (workflow_revision > 0),
  workflow_state text not null,
  payment_dispute_id uuid references public.payment_disputes_v2(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  stripe_object_id text not null,
  stable_idempotency_key text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  execution_operation_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  constraint admin_financial_preview_consumption check (
    (consumed_at is null and execution_operation_id is null)
    or (consumed_at is not null and execution_operation_id is not null)
  ),
  constraint admin_financial_preview_risk_source check (
    operation_type <> 'provider_retransfer' or payment_dispute_id is not null
  )
);

create index admin_financial_operation_previews_operation_idx
  on public.admin_financial_operation_previews_v2(operation_type, operation_id, created_at desc);

alter table public.admin_financial_operation_previews_v2 enable row level security;
revoke all on public.admin_financial_operation_previews_v2 from public, anon, authenticated;
grant all on public.admin_financial_operation_previews_v2 to service_role;

create or replace function public.protect_admin_financial_operation_preview_v2()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Financial operation previews are immutable' using errcode = '42501';
  end if;
  if current_setting('app.admin_financial_preview_consume', true) is distinct from 'on'
     or new.id is distinct from old.id
     or new.admin_id is distinct from old.admin_id
     or new.operation_type is distinct from old.operation_type
     or new.operation_id is distinct from old.operation_id
     or new.payment_id is distinct from old.payment_id
     or new.workflow_instance_id is distinct from old.workflow_instance_id
     or new.workflow_revision is distinct from old.workflow_revision
     or new.workflow_state is distinct from old.workflow_state
     or new.payment_dispute_id is distinct from old.payment_dispute_id
     or new.amount_cents is distinct from old.amount_cents
     or new.currency is distinct from old.currency
     or new.stripe_object_id is distinct from old.stripe_object_id
     or new.stable_idempotency_key is distinct from old.stable_idempotency_key
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at
     or old.consumed_at is not null
     or new.consumed_at is null
     or new.execution_operation_id is null then
    raise exception 'Invalid financial operation preview mutation' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger protect_admin_financial_operation_preview_v2
before update or delete on public.admin_financial_operation_previews_v2
for each row execute function public.protect_admin_financial_operation_preview_v2();

create or replace function public.admin_financial_search(
  p_query text,
  p_limit integer default 50
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_items jsonb;
begin
  perform public.assert_admin_permission('finance.read');
  if length(v_query) < 2 or length(v_query) > 200 then
    raise exception 'Search query length must be between 2 and 200 characters' using errcode = '22023';
  end if;

  with payment_matches as (
    select distinct p.id as payment_id
    from public.checkout_v2_payments p
    join public.users client on client.id = p.client_id
    join public.users provider on provider.id = p.provider_id
    left join public.refunds_v2 refund on refund.payment_id = p.id
    left join public.provider_transfers_v2 transfer on transfer.payment_id = p.id
    left join public.transfer_reversals_v2 reversal on reversal.payment_id = p.id
    where strpos(lower(p.id::text), v_query) > 0
      or strpos(lower(p.request_id::text), v_query) > 0
      or strpos(lower(p.proposal_id::text), v_query) > 0
      or strpos(lower(p.client_id::text), v_query) > 0
      or strpos(lower(p.provider_id::text), v_query) > 0
      or strpos(lower(coalesce(client.email, '')), v_query) > 0
      or strpos(lower(coalesce(provider.email, '')), v_query) > 0
      or strpos(lower(p.stripe_session_id), v_query) > 0
      or strpos(lower(p.stripe_payment_intent_id), v_query) > 0
      or strpos(lower(p.stripe_charge_id), v_query) > 0
      or strpos(lower(coalesce(transfer.stripe_transfer_id, '')), v_query) > 0
      or strpos(lower(coalesce(refund.stripe_refund_id, '')), v_query) > 0
      or strpos(lower(coalesce(reversal.stripe_reversal_id, '')), v_query) > 0
      or strpos(lower(coalesce(reversal.stripe_retransfer_id, '')), v_query) > 0
  ), results as (
    select 'payment'::text as entity_type, p.id as entity_id, p.id as payment_id,
      p.proposal_id as mission_id, p.request_id, p.client_id, p.provider_id,
      p.amount_total_cents as amount_cents, p.currency,
      p.stripe_payment_intent_id as primary_stripe_id,
      p.paid_at as occurred_at,
      '/finance/paiements/' || p.id::text as route,
      concat_ws(' · ', client.email, provider.email) as subtitle,
      case when lower(p.id::text) = v_query
        or lower(p.stripe_payment_intent_id) = v_query
        or lower(p.stripe_charge_id) = v_query
        or lower(p.stripe_session_id) = v_query then 0 else 1 end as rank
    from payment_matches match
    join public.checkout_v2_payments p on p.id = match.payment_id
    join public.users client on client.id = p.client_id
    join public.users provider on provider.id = p.provider_id
    union all
    select 'payout', payout.id, null::uuid, null::uuid, null::uuid,
      null::uuid, payout.provider_id, payout.bank_payout_amount_cents,
      payout.currency, payout.stripe_payout_id, payout.created_at,
      '/finance?recherche=' || coalesce(payout.stripe_payout_id, payout.id::text),
      concat_ws(' · ', provider.email, payout.payout_method,
        coalesce(payout.stripe_status, 'reserved')), 0
    from public.provider_payouts_v2 payout
    join public.users provider on provider.id = payout.provider_id
    where strpos(lower(payout.id::text), v_query) > 0
      or strpos(lower(payout.provider_id::text), v_query) > 0
      or strpos(lower(coalesce(provider.email, '')), v_query) > 0
      or strpos(lower(coalesce(payout.stripe_payout_id, '')), v_query) > 0
  )
  select coalesce(jsonb_agg(to_jsonb(item) - 'rank' order by item.rank, item.occurred_at desc), '[]'::jsonb)
  into v_items from (select * from results order by rank, occurred_at desc limit v_limit) item;

  perform public.record_admin_read_audit('finance.search', 'financial_search', null,
    jsonb_build_object('query_length', length(v_query), 'result_count', jsonb_array_length(v_items)));
  return jsonb_build_object('items', v_items, 'total', jsonb_array_length(v_items));
end
$$;

create or replace function public.admin_get_financial_payment_detail(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_payment public.checkout_v2_payments%rowtype;
  v_result jsonb;
begin
  perform public.assert_admin_permission('finance.read');
  select * into v_payment from public.checkout_v2_payments where id = p_payment_id;
  if not found then raise exception 'V2 payment not found' using errcode = 'P0002'; end if;

  with relevant_batches as (
    select release.ledger_batch_id as id from public.fund_releases_v2 release
      where release.payment_id = p_payment_id and release.ledger_batch_id is not null
    union select transfer.ledger_batch_id from public.provider_transfers_v2 transfer
      where transfer.payment_id = p_payment_id and transfer.ledger_batch_id is not null
    union select resolution.ledger_batch_id from public.financial_resolutions_v2 resolution
      where resolution.payment_id = p_payment_id
    union select refund.ledger_batch_id from public.refunds_v2 refund
      where refund.payment_id = p_payment_id and refund.ledger_batch_id is not null
    union select reversal.ledger_batch_id from public.transfer_reversals_v2 reversal
      where reversal.payment_id = p_payment_id and reversal.ledger_batch_id is not null
    union select reversal.retransfer_ledger_batch_id from public.transfer_reversals_v2 reversal
      where reversal.payment_id = p_payment_id and reversal.retransfer_ledger_batch_id is not null
    union select dispute.opened_ledger_batch_id from public.payment_disputes_v2 dispute
      where dispute.payment_id = p_payment_id and dispute.opened_ledger_batch_id is not null
    union select dispute.won_ledger_batch_id from public.payment_disputes_v2 dispute
      where dispute.payment_id = p_payment_id and dispute.won_ledger_batch_id is not null
    union select batch.id from public.financial_ledger_batches batch
      where batch.external_reference_id in (
        v_payment.stripe_payment_intent_id, v_payment.stripe_charge_id, v_payment.stripe_session_id
      )
  ), ledger as (
    select batch.*, coalesce((
      select jsonb_agg(jsonb_build_object(
        'line_number', entry.line_number, 'direction', entry.direction,
        'amount_cents', entry.amount_cents, 'memo', entry.memo,
        'account_code', account.account_code, 'account_class', account.account_class,
        'owner_type', account.owner_type, 'owner_user_id', account.owner_user_id
      ) order by entry.line_number)
      from public.financial_ledger_entries entry
      join public.financial_ledger_accounts account on account.id = entry.account_id
      where entry.batch_id = batch.id
    ), '[]'::jsonb) as entries,
    coalesce((select sum(entry.amount_cents) from public.financial_ledger_entries entry
      where entry.batch_id = batch.id and entry.direction = 'debit'), 0) as debit_total_cents,
    coalesce((select sum(entry.amount_cents) from public.financial_ledger_entries entry
      where entry.batch_id = batch.id and entry.direction = 'credit'), 0) as credit_total_cents
    from public.financial_ledger_batches batch join relevant_batches relevant on relevant.id = batch.id
  )
  select jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'client', (select jsonb_build_object('id', u.id, 'email', u.email,
      'first_name', u.first_name, 'last_name', u.last_name) from public.users u where u.id = v_payment.client_id),
    'provider', (select jsonb_build_object('id', u.id, 'email', u.email,
      'first_name', u.first_name, 'last_name', u.last_name) from public.users u where u.id = v_payment.provider_id),
    'mission', (select to_jsonb(m) from public.missions m where m.id = v_payment.proposal_id),
    'request', (select to_jsonb(b) from public.bookings b where b.id = v_payment.request_id),
    'terms_snapshot', (select to_jsonb(t) from public.financial_terms_snapshots t where t.id = v_payment.terms_snapshot_id),
    'allocation_snapshots', coalesce((select jsonb_agg(to_jsonb(a) order by a.revision)
      from public.financial_allocation_snapshots a where a.terms_snapshot_id = v_payment.terms_snapshot_id), '[]'::jsonb),
    'payment_workflow', (select to_jsonb(w) from public.workflow_instances w where w.id = v_payment.workflow_instance_id),
    'release', (select to_jsonb(r) from public.fund_releases_v2 r where r.payment_id = p_payment_id),
    'transfer', (select to_jsonb(t) || jsonb_build_object('workflow_state', w.current_state)
      from public.provider_transfers_v2 t join public.workflow_instances w on w.id = t.workflow_instance_id
      where t.payment_id = p_payment_id),
    'resolutions', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.financial_resolutions_v2 r where r.payment_id = p_payment_id), '[]'::jsonb),
    'refunds', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object(
        'workflow_state', w.current_state, 'workflow_revision', w.revision,
        'attempts', coalesce((select jsonb_agg(to_jsonb(a) order by a.attempt_number)
          from public.financial_remediation_attempts_v2 a where a.refund_id = r.id), '[]'::jsonb)
      ) order by r.created_at)
      from public.refunds_v2 r join public.workflow_instances w on w.id = r.workflow_instance_id
      where r.payment_id = p_payment_id), '[]'::jsonb),
    'reversals', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object(
        'workflow_state', w.current_state, 'workflow_revision', w.revision,
        'attempts', coalesce((select jsonb_agg(to_jsonb(a) order by a.attempt_number)
          from public.financial_remediation_attempts_v2 a where a.transfer_reversal_id = r.id), '[]'::jsonb)
      ) order by r.created_at)
      from public.transfer_reversals_v2 r join public.workflow_instances w on w.id = r.workflow_instance_id
      where r.payment_id = p_payment_id), '[]'::jsonb),
    'payment_disputes', coalesce((select jsonb_agg(to_jsonb(d) || jsonb_build_object(
        'workflow_state', w.current_state, 'workflow_revision', w.revision
      ) order by d.opened_at desc)
      from public.payment_disputes_v2 d join public.workflow_instances w on w.id = d.workflow_instance_id
      where d.payment_id = p_payment_id), '[]'::jsonb),
    'deficits', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at)
      from public.financial_recovery_deficits_v2 d where d.payment_id = p_payment_id), '[]'::jsonb),
    'provider_payouts', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
        'workflow_state', w.current_state) order by p.created_at desc)
      from public.provider_payouts_v2 p join public.workflow_instances w on w.id = p.workflow_instance_id
      where p.provider_id = v_payment.provider_id), '[]'::jsonb),
    'ledger_batches', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from ledger l), '[]'::jsonb),
    'financial_audit', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at)
      from public.financial_audit_log a where a.entity_id in (
        p_payment_id::text,
        v_payment.stripe_payment_intent_id,
        v_payment.stripe_charge_id,
        v_payment.stripe_session_id
      ) or (a.evidence ->> 'payment_id') = p_payment_id::text), '[]'::jsonb)
  ) into v_result;

  perform public.record_admin_read_audit('finance.payment.read', 'checkout_v2_payment',
    p_payment_id::text, jsonb_build_object('financial_flow_version', 'marketplace_v2'));
  return v_result;
end
$$;

create or replace function public.admin_list_payment_disputes(
  p_queue text default 'open', p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total integer;
  v_items jsonb;
begin
  perform public.assert_admin_permission('risk.read');
  if p_queue not in ('open', 'won', 'lost_review', 'resolved', 'all') then
    raise exception 'Unsupported payment dispute queue' using errcode = '22023';
  end if;
  select coalesce(max(item.total_count), 0)::integer,
    coalesce(jsonb_agg(to_jsonb(item) - 'total_count' order by item.opened_at desc), '[]'::jsonb)
  into v_total, v_items from (
    select dispute.*, workflow.current_state as workflow_state,
      payment.proposal_id as mission_id, payment.request_id,
      client.email as client_email, provider.email as provider_email,
      count(*) over () as total_count
    from public.payment_disputes_v2 dispute
    join public.workflow_instances workflow on workflow.id = dispute.workflow_instance_id
    join public.checkout_v2_payments payment on payment.id = dispute.payment_id
    join public.users client on client.id = payment.client_id
    join public.users provider on provider.id = payment.provider_id
    where p_queue = 'all'
      or (p_queue = 'open' and dispute.resolved_at is null
        and workflow.current_state not in ('liability_admin_review'))
      or (p_queue = 'won' and dispute.stripe_status = 'won' and dispute.resolved_at is null)
      or (p_queue = 'lost_review' and workflow.current_state = 'liability_admin_review')
      or (p_queue = 'resolved' and dispute.resolved_at is not null)
    order by dispute.opened_at desc
    limit v_limit offset v_offset
  ) item;
  perform public.record_admin_read_audit('risk.payment_disputes.list', 'payment_dispute_collection', null,
    jsonb_build_object('queue', p_queue, 'result_count', jsonb_array_length(v_items)));
  return jsonb_build_object('items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
end
$$;

create or replace function public.admin_get_payment_dispute_detail(p_dispute_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_dispute public.payment_disputes_v2%rowtype;
  v_result jsonb;
begin
  perform public.assert_admin_permission('risk.read');
  select * into v_dispute from public.payment_disputes_v2 where id = p_dispute_id;
  if not found then raise exception 'Payment dispute not found' using errcode = 'P0002'; end if;
  select jsonb_build_object(
    'dispute', to_jsonb(v_dispute),
    'workflow', (select to_jsonb(w) from public.workflow_instances w where w.id = v_dispute.workflow_instance_id),
    'payment', (select to_jsonb(p) from public.checkout_v2_payments p where p.id = v_dispute.payment_id),
    'mission', (select to_jsonb(m) from public.missions m join public.checkout_v2_payments p
      on p.proposal_id = m.id where p.id = v_dispute.payment_id),
    'parties', (select jsonb_build_object(
      'client', jsonb_build_object('id', c.id, 'email', c.email, 'first_name', c.first_name, 'last_name', c.last_name),
      'provider', jsonb_build_object('id', pr.id, 'email', pr.email, 'first_name', pr.first_name, 'last_name', pr.last_name)
    ) from public.checkout_v2_payments p join public.users c on c.id = p.client_id
      join public.users pr on pr.id = p.provider_id where p.id = v_dispute.payment_id),
    'reversal', (select to_jsonb(r) || jsonb_build_object(
        'workflow_state', w.current_state, 'workflow_revision', w.revision,
        'attempts', coalesce((select jsonb_agg(to_jsonb(a) order by a.attempt_number)
          from public.financial_remediation_attempts_v2 a where a.transfer_reversal_id = r.id), '[]'::jsonb)
      ) from public.transfer_reversals_v2 r join public.workflow_instances w on w.id = r.workflow_instance_id
      where r.payment_dispute_id = p_dispute_id),
    'deficit', (select to_jsonb(d) from public.financial_recovery_deficits_v2 d
      join public.transfer_reversals_v2 r on r.id = d.transfer_reversal_id
      where r.payment_dispute_id = p_dispute_id),
    'resolution', (select to_jsonb(r) from public.financial_resolutions_v2 r
      where r.payment_dispute_id = p_dispute_id),
    'stripe_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.stripe_created_at)
      from public.stripe_financial_v2_webhook_events e where e.stripe_object_id = v_dispute.stripe_dispute_id), '[]'::jsonb),
    'risk_signals', v_dispute.risk_details,
    'radar_alerts', coalesce(v_dispute.risk_details -> 'radar', '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(to_jsonb(event) order by event.created_at)
      from public.workflow_transition_events event where event.instance_id = v_dispute.workflow_instance_id), '[]'::jsonb),
    'financial_audit', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at)
      from public.financial_audit_log a where a.entity_id in (
        p_dispute_id::text, v_dispute.stripe_dispute_id, v_dispute.payment_id::text
      )), '[]'::jsonb)
  ) into v_result;
  perform public.record_admin_read_audit('risk.payment_dispute.read', 'payment_dispute_v2',
    p_dispute_id::text, jsonb_build_object('stripe_status', v_dispute.stripe_status));
  return v_result;
end
$$;

create or replace function public.admin_preview_financial_operation_v2(
  p_operation_type text,
  p_operation_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := auth.uid();
  v_preview public.admin_financial_operation_previews_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_payment_id uuid;
  v_payment_dispute_id uuid;
  v_workflow_id uuid;
  v_amount bigint;
  v_currency text;
  v_stripe_object text;
  v_idempotency text;
  v_max_age integer;
begin
  perform public.assert_admin_permission('finance.execute', true);
  if p_operation_type = 'refund' then
    select r.payment_id, r.workflow_instance_id, r.amount_cents, r.currency,
      r.stripe_payment_intent_id, r.idempotency_key
    into v_payment_id, v_workflow_id, v_amount, v_currency, v_stripe_object, v_idempotency
    from public.refunds_v2 r where r.id = p_operation_id;
  elsif p_operation_type in ('transfer_reversal', 'provider_retransfer') then
    select r.payment_id, r.workflow_instance_id,
      case when p_operation_type = 'provider_retransfer' then r.recovered_amount_cents else r.requested_amount_cents end,
      r.currency, r.stripe_transfer_id,
      case when p_operation_type = 'provider_retransfer' then r.retransfer_idempotency_key else r.idempotency_key end,
      r.payment_dispute_id
    into v_payment_id, v_workflow_id, v_amount, v_currency, v_stripe_object, v_idempotency,
      v_payment_dispute_id
    from public.transfer_reversals_v2 r where r.id = p_operation_id;
  else
    raise exception 'Unsupported financial operation type' using errcode = '22023';
  end if;
  if v_payment_id is null then raise exception 'Financial operation not found' using errcode = 'P0002'; end if;
  if v_payment_dispute_id is not null then perform public.assert_admin_permission('risk.manage', true); end if;
  select * into v_workflow from public.workflow_instances where id = v_workflow_id;
  if p_operation_type = 'refund' and v_workflow.current_state not in (
      'authorized', 'recovery_attempted', 'submitted', 'failed_retryable') then
    raise exception 'Refund is not retryable or pending' using errcode = '23514';
  elsif p_operation_type = 'transfer_reversal' and v_workflow.current_state not in (
      'requested_provisional', 'requested_final', 'submitted') then
    raise exception 'Transfer reversal is not retryable or pending' using errcode = '23514';
  elsif p_operation_type = 'provider_retransfer' and (
      v_payment_dispute_id is null
      or v_workflow.current_state not in ('fully_recovered', 'partially_recovered')
      or not exists (select 1 from public.payment_disputes_v2 dispute
        where dispute.id = v_payment_dispute_id and dispute.stripe_status = 'won')) then
    raise exception 'Provider retransfer is not authorized by a won payment dispute' using errcode = '23514';
  end if;
  if v_amount is null or v_amount <= 0 or v_idempotency is null then
    raise exception 'Financial operation is incomplete' using errcode = '23514';
  end if;
  select financial_reauthentication_max_age_seconds into v_max_age
    from public.admin_security_policy_versions
    where effective_from <= clock_timestamp()
      and (effective_until is null or effective_until > clock_timestamp())
    order by effective_from desc limit 1;
  insert into public.admin_financial_operation_previews_v2 (
    admin_id, operation_type, operation_id, payment_id, workflow_instance_id,
    workflow_revision, workflow_state, payment_dispute_id, amount_cents,
    currency, stripe_object_id, stable_idempotency_key, expires_at
  ) values (
    v_admin, p_operation_type, p_operation_id, v_payment_id, v_workflow_id,
    v_workflow.revision, v_workflow.current_state, v_payment_dispute_id, v_amount,
    v_currency, v_stripe_object, v_idempotency,
    clock_timestamp() + make_interval(secs => coalesce(v_max_age, 300))
  ) returning * into v_preview;
  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    after_state, mfa_authenticated_at, deduplication_key
  ) values (
    v_admin, 'financial_operation_previewed', p_operation_type,
    p_operation_id::text, 'finance.operation.preview', 'success', to_jsonb(v_preview),
    public.admin_current_mfa_authenticated_at(), 'admin-finance-preview:' || v_preview.id::text
  );
  return to_jsonb(v_preview);
end
$$;

create or replace function public.consume_admin_financial_operation_preview_v2(
  p_preview_id uuid,
  p_admin_id uuid,
  p_reason text,
  p_mfa_authenticated_at timestamptz,
  p_execution_operation_id uuid
)
returns table (
  operation_type text, operation_id uuid, payment_id uuid,
  payment_dispute_id uuid, amount_cents bigint, currency text
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_preview public.admin_financial_operation_previews_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if not public.admin_account_has_permission(p_admin_id, 'finance.execute') then
    raise exception 'Finance execution permission required' using errcode = '42501';
  end if;
  perform public.assert_recent_financial_admin_mfa_v2(
    p_admin_id, p_mfa_authenticated_at, 'financial_admin_mfa_v1'
  );
  if p_reason is null or length(trim(p_reason)) not between 10 and 4000 then
    raise exception 'A detailed justification is required' using errcode = '22023';
  end if;
  select * into v_preview from public.admin_financial_operation_previews_v2
    where id = p_preview_id for update;
  if not found then raise exception 'Financial operation preview not found' using errcode = 'P0002'; end if;
  if v_preview.admin_id <> p_admin_id then raise exception 'Preview belongs to another administrator' using errcode = '42501'; end if;
  if v_preview.payment_dispute_id is not null
     and not public.admin_account_has_permission(p_admin_id, 'risk.manage') then
    raise exception 'Risk management permission required' using errcode = '42501';
  end if;
  if v_preview.consumed_at is not null then
    if v_preview.execution_operation_id <> p_execution_operation_id then
      raise exception 'Preview already consumed by another operation' using errcode = '23505';
    end if;
    return query select v_preview.operation_type, v_preview.operation_id,
      v_preview.payment_id, v_preview.payment_dispute_id,
      v_preview.amount_cents, v_preview.currency;
    return;
  end if;
  if v_preview.expires_at < clock_timestamp() then raise exception 'Financial operation preview expired' using errcode = '22023'; end if;
  select * into v_workflow from public.workflow_instances
    where id = v_preview.workflow_instance_id for update;
  if v_workflow.revision <> v_preview.workflow_revision
     or v_workflow.current_state <> v_preview.workflow_state then
    raise exception 'Financial operation changed after preview' using errcode = '40001';
  end if;
  perform set_config('app.admin_financial_preview_consume', 'on', true);
  update public.admin_financial_operation_previews_v2
    set consumed_at = clock_timestamp(), execution_operation_id = p_execution_operation_id
    where id = v_preview.id;
  perform set_config('app.admin_financial_preview_consume', 'off', true);
  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    reason, before_state, after_state, mfa_authenticated_at, deduplication_key
  ) values (
    p_admin_id, 'financial_operation_confirmed', v_preview.operation_type,
    v_preview.operation_id::text, 'finance.operation.execute', 'success', trim(p_reason),
    jsonb_build_object('workflow_state', v_preview.workflow_state,
      'workflow_revision', v_preview.workflow_revision),
    jsonb_build_object('amount_cents', v_preview.amount_cents,
      'currency', v_preview.currency, 'preview_id', v_preview.id),
    p_mfa_authenticated_at, 'admin-finance-execute:' || p_execution_operation_id::text
  );
  return query select v_preview.operation_type, v_preview.operation_id,
    v_preview.payment_id, v_preview.payment_dispute_id,
    v_preview.amount_cents, v_preview.currency;
end
$$;

create or replace function public.record_admin_financial_execution_audit_v2(
  p_admin_id uuid,
  p_operation_type text,
  p_operation_id uuid,
  p_execution_operation_id uuid,
  p_outcome text,
  p_result jsonb,
  p_mfa_authenticated_at timestamptz
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if p_outcome not in ('success', 'pending', 'failed', 'manual_review')
     or coalesce(jsonb_typeof(p_result), 'object') <> 'object' then
    raise exception 'Invalid financial execution audit' using errcode = '22023';
  end if;
  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    after_state, mfa_authenticated_at, deduplication_key
  ) values (
    p_admin_id, 'financial_operation_execution', p_operation_type,
    p_operation_id::text, 'finance.operation.execute',
    case when p_outcome = 'failed' then 'failed' else 'success' end,
    coalesce(p_result, '{}'::jsonb), p_mfa_authenticated_at,
    'admin-finance-result:' || p_execution_operation_id::text
  ) on conflict (deduplication_key) do nothing;
end
$$;

revoke all on function public.admin_financial_search(text, integer) from public, anon;
revoke all on function public.admin_get_financial_payment_detail(uuid) from public, anon;
revoke all on function public.admin_list_payment_disputes(text, integer, integer) from public, anon;
revoke all on function public.admin_get_payment_dispute_detail(uuid) from public, anon;
revoke all on function public.admin_preview_financial_operation_v2(text, uuid) from public, anon;
grant execute on function public.admin_financial_search(text, integer) to authenticated;
grant execute on function public.admin_get_financial_payment_detail(uuid) to authenticated;
grant execute on function public.admin_list_payment_disputes(text, integer, integer) to authenticated;
grant execute on function public.admin_get_payment_dispute_detail(uuid) to authenticated;
grant execute on function public.admin_preview_financial_operation_v2(text, uuid) to authenticated;

revoke all on function public.consume_admin_financial_operation_preview_v2(
  uuid, uuid, text, timestamptz, uuid
) from public, anon, authenticated;
revoke all on function public.record_admin_financial_execution_audit_v2(
  uuid, text, uuid, uuid, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.consume_admin_financial_operation_preview_v2(
  uuid, uuid, text, timestamptz, uuid
) to service_role;
grant execute on function public.record_admin_financial_execution_audit_v2(
  uuid, text, uuid, uuid, text, jsonb, timestamptz
) to service_role;

commit;
