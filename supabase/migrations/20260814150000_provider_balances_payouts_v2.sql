-- Provider balances and payouts for marketplace_v2.
--
-- Additive and disabled by default. Stripe remains untouched until the
-- provider_payouts_v2 feature flag is explicitly enabled.

begin;

insert into public.financial_feature_flags (flag_code, enabled, reason)
values (
  'provider_payouts_v2', false,
  'Disabled by default. Provider balances and payouts v2 require a controlled rollout and verified Stripe Instant Payout pricing.'
);

create or replace function public.financial_smallint_array_is_unique(p_values smallint[])
returns boolean language sql immutable parallel safe set search_path = public, pg_temp as $$
  select count(*) = count(distinct value) from unnest(p_values) value
$$;

create table public.provider_payout_policy_versions (
  version text primary key,
  currency text not null check (currency ~ '^[a-z]{3}$'),
  schedule_timezone text not null,
  standard_payout_isodays smallint[] not null,
  standard_payout_local_time time not null,
  minimum_payout_amount_cents bigint not null default 0
    check (minimum_payout_amount_cents >= 0),
  instant_quote_ttl_seconds integer not null
    check (instant_quote_ttl_seconds between 60 and 900),
  stripe_instant_cost_rate_bps integer not null
    check (stripe_instant_cost_rate_bps between 0 and 10000),
  instant_payout_margin_bps integer not null default 0
    check (instant_payout_margin_bps = 0),
  standard_fee_bearer text not null default 'platform'
    check (standard_fee_bearer = 'platform'),
  instant_fee_bearer text not null default 'provider'
    check (instant_fee_bearer = 'provider'),
  effective_from timestamptz not null,
  effective_until timestamptz,
  notes text not null check (length(trim(notes)) between 1 and 4000),
  created_at timestamptz not null default now(),
  constraint provider_payout_policy_version_format check (
    version ~ '^[a-z][a-z0-9_.-]{2,99}$'
  ),
  constraint provider_payout_policy_days check (
    cardinality(standard_payout_isodays) between 1 and 7
    and standard_payout_isodays <@ array[1,2,3,4,5,6,7]::smallint[]
    and public.financial_smallint_array_is_unique(standard_payout_isodays)
  ),
  constraint provider_payout_policy_period check (
    effective_until is null or effective_until > effective_from
  )
);

insert into public.provider_payout_policy_versions (
  version, currency, schedule_timezone, standard_payout_isodays,
  standard_payout_local_time, minimum_payout_amount_cents,
  instant_quote_ttl_seconds, stripe_instant_cost_rate_bps,
  effective_from, notes
) values (
  'provider_payouts_eur_v1', 'eur', 'Europe/Brussels', array[1,4]::smallint[],
  '09:00:00', 0, 300, 100, '2026-01-01 00:00:00+00',
  'Initial EUR-only policy: Monday and Thursday standard payouts, zero Glossed threshold, Stripe documented 1% Instant Payout cost and zero Glossed margin. Verify Stripe pricing before activation.'
);

create trigger provider_payout_policy_versions_immutable
before update or delete on public.provider_payout_policy_versions
for each row execute function public.reject_financial_definition_mutation();

create table public.provider_payout_schedule_controls_v2 (
  provider_id uuid primary key references public.users(id) on delete restrict,
  stripe_account_id text not null unique
    references public.provider_connect_account_identities(stripe_account_id) on delete restrict,
  stripe_schedule_interval text not null check (stripe_schedule_interval = 'manual'),
  configured_at timestamptz not null,
  stripe_balance_settings_revision text,
  last_verified_at timestamptz not null,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_balance_snapshots_v2 (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.users(id) on delete restrict,
  stripe_account_id text not null
    references public.provider_connect_account_identities(stripe_account_id) on delete restrict,
  currency text not null check (currency ~ '^[a-z]{3}$'),
  stripe_available_amount_cents bigint not null check (stripe_available_amount_cents >= 0),
  stripe_pending_amount_cents bigint not null check (stripe_pending_amount_cents >= 0),
  stripe_instant_available_gross_amount_cents bigint not null default 0
    check (stripe_instant_available_gross_amount_cents >= 0),
  stripe_instant_available_net_amount_cents bigint not null default 0
    check (stripe_instant_available_net_amount_cents >= 0),
  stripe_instant_fee_amount_cents bigint not null default 0
    check (stripe_instant_fee_amount_cents >= 0),
  instant_destination_id text,
  instant_destination_type text,
  source_types jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_types) = 'object'),
  livemode boolean not null,
  retrieval_key text not null unique,
  captured_at timestamptz not null default now(),
  constraint provider_balance_snapshot_instant_consistent check (
    stripe_instant_available_net_amount_cents
      + stripe_instant_fee_amount_cents
      = stripe_instant_available_gross_amount_cents
    and stripe_instant_available_gross_amount_cents <= stripe_available_amount_cents
    and (
      (stripe_instant_available_gross_amount_cents = 0
        and instant_destination_id is null and instant_destination_type is null)
      or
      (stripe_instant_available_gross_amount_cents > 0
        and length(instant_destination_id) between 3 and 255
        and instant_destination_type in ('bank_account', 'card'))
    )
  )
);

create index provider_balance_snapshots_v2_latest_idx
  on public.provider_balance_snapshots_v2(provider_id, currency, captured_at desc);

create trigger provider_balance_snapshots_v2_immutable
before update or delete on public.provider_balance_snapshots_v2
for each row execute function public.reject_financial_definition_mutation();

create table public.provider_payout_blocks_v2 (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.users(id) on delete restrict,
  payment_id uuid references public.checkout_v2_payments(id) on delete restrict,
  block_code text not null check (block_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  reason text not null check (length(trim(reason)) between 1 and 4000),
  source_type text not null check (source_type in (
    'system', 'service_dispute', 'payment_dispute', 'recovery', 'payout_failure'
  )),
  source_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_reason text,
  constraint provider_payout_block_resolution check (
    (resolved_at is null and resolution_reason is null)
    or (resolved_at is not null and length(trim(resolution_reason)) between 1 and 4000)
  )
);

create unique index provider_payout_blocks_v2_active_uidx
  on public.provider_payout_blocks_v2(provider_id, block_code, source_type, source_id)
  nulls not distinct where resolved_at is null;

create table public.provider_payouts_v2 (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.users(id) on delete restrict,
  stripe_account_id text not null
    references public.provider_connect_account_identities(stripe_account_id) on delete restrict,
  workflow_instance_id uuid not null unique
    references public.workflow_instances(id) on delete restrict,
  policy_version text not null
    references public.provider_payout_policy_versions(version) on delete restrict,
  payout_method text not null check (payout_method in ('standard', 'instant')),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  provider_balance_debit_amount_cents bigint not null check (
    provider_balance_debit_amount_cents > 0
  ),
  bank_payout_amount_cents bigint not null check (bank_payout_amount_cents > 0),
  quoted_stripe_fee_amount_cents bigint not null default 0 check (
    quoted_stripe_fee_amount_cents >= 0
  ),
  stripe_fee_actual_amount_cents bigint check (
    stripe_fee_actual_amount_cents is null or stripe_fee_actual_amount_cents >= 0
  ),
  provider_fee_charged_amount_cents bigint not null default 0 check (
    provider_fee_charged_amount_cents >= 0
  ),
  platform_fee_absorbed_amount_cents bigint not null default 0 check (
    platform_fee_absorbed_amount_cents >= 0
  ),
  glossed_margin_amount_cents bigint not null default 0 check (
    glossed_margin_amount_cents = 0
  ),
  balance_snapshot_id uuid not null
    references public.provider_balance_snapshots_v2(id) on delete restrict,
  destination_id text,
  schedule_slot_at timestamptz,
  quote_expires_at timestamptz,
  quote_confirmed_at timestamptz,
  idempotency_key text not null unique,
  stripe_payout_id text unique,
  stripe_application_fee_id text unique,
  stripe_balance_transaction_id text unique,
  stripe_status text,
  arrival_date date,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  submitted_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_payout_method_amounts check (
    (payout_method = 'standard'
      and provider_balance_debit_amount_cents = bank_payout_amount_cents
      and quoted_stripe_fee_amount_cents = 0
      and provider_fee_charged_amount_cents = 0
      and destination_id is null
      and schedule_slot_at is not null
      and quote_expires_at is null)
    or
    (payout_method = 'instant'
      and provider_balance_debit_amount_cents
        = bank_payout_amount_cents + quoted_stripe_fee_amount_cents
      and provider_fee_charged_amount_cents = quoted_stripe_fee_amount_cents
      and destination_id is not null
      and schedule_slot_at is null
      and quote_expires_at is not null)
  ),
  constraint provider_payout_idempotency_length check (
    length(idempotency_key) between 1 and 255
  ),
  constraint provider_payout_stripe_id_format check (
    stripe_payout_id is null or stripe_payout_id ~ '^po_[A-Za-z0-9_]+'
  ),
  constraint provider_payout_terminal_exclusive check (
    (paid_at is not null)::integer + (failed_at is not null)::integer
      + (cancelled_at is not null)::integer <= 1
  )
);

create unique index provider_payouts_v2_active_uidx
  on public.provider_payouts_v2(provider_id, currency)
  where paid_at is null and failed_at is null and cancelled_at is null;
create index provider_payouts_v2_history_idx
  on public.provider_payouts_v2(provider_id, created_at desc);

create table public.provider_payout_attempts_v2 (
  id bigint generated always as identity primary key,
  payout_id uuid not null references public.provider_payouts_v2(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  outcome text not null check (outcome in (
    'submitted', 'retryable_failure', 'definitive_failure', 'paid'
  )),
  stripe_payout_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (payout_id, attempt_number, outcome)
);

create table public.stripe_payout_v2_webhook_events (
  event_id text primary key,
  event_type text not null,
  stripe_account_id text not null,
  stripe_payout_id text not null,
  payout_id uuid references public.provider_payouts_v2(id) on delete restrict,
  stripe_created_at timestamptz not null,
  livemode boolean not null,
  applied boolean not null,
  outcome text not null,
  payload_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload_summary) = 'object'),
  processed_at timestamptz not null default now()
);

create trigger provider_payout_attempts_v2_immutable
before update or delete on public.provider_payout_attempts_v2
for each row execute function public.reject_financial_definition_mutation();
create trigger stripe_payout_v2_webhook_events_immutable
before update or delete on public.stripe_payout_v2_webhook_events
for each row execute function public.reject_financial_definition_mutation();

create or replace function public.protect_provider_payout_v2_record()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Provider payout records cannot be deleted' using errcode = '55000';
  end if;
  if current_setting('app.provider_payouts_v2_mutation', true) is distinct from 'on' then
    raise exception 'Provider payout records are server-managed' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger protect_provider_payout_schedule_controls_v2
before update or delete on public.provider_payout_schedule_controls_v2
for each row execute function public.protect_provider_payout_v2_record();
create trigger protect_provider_payout_blocks_v2
before update or delete on public.provider_payout_blocks_v2
for each row execute function public.protect_provider_payout_v2_record();
create trigger protect_provider_payouts_v2
before update or delete on public.provider_payouts_v2
for each row execute function public.protect_provider_payout_v2_record();

-- Serialize the creation of every dispute/block source with payout
-- reservation on the canonical Connect row. If a dispute wins the lock first,
-- dispatch observes it; if payout reservation wins first, its financial
-- initiation is ordered before the later dispute and remains fully audited.
create or replace function public.serialize_provider_payout_block_source_v2()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_provider_id uuid;
begin
  if tg_table_name = 'provider_payout_blocks_v2' then
    v_provider_id := new.provider_id;
  else
    select provider_id into v_provider_id from public.checkout_v2_payments
    where id = new.payment_id;
  end if;
  if v_provider_id is not null then
    perform 1 from public.provider_connect_accounts
    where provider_id = v_provider_id for update;
  end if;
  return new;
end
$$;

create trigger serialize_service_dispute_with_provider_payout_v2
before insert on public.service_disputes_v2
for each row execute function public.serialize_provider_payout_block_source_v2();
create trigger serialize_cancellation_with_provider_payout_v2
before insert on public.cancellation_cases_v2
for each row execute function public.serialize_provider_payout_block_source_v2();
create trigger serialize_payment_dispute_with_provider_payout_v2
before insert on public.payment_disputes_v2
for each row execute function public.serialize_provider_payout_block_source_v2();
create trigger serialize_explicit_block_with_provider_payout_v2
before insert on public.provider_payout_blocks_v2
for each row execute function public.serialize_provider_payout_block_source_v2();

create or replace function public.require_provider_payouts_v2_enabled()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if not coalesce((select enabled from public.financial_feature_flags
                   where flag_code = 'provider_payouts_v2'), false) then
    raise exception 'Provider payouts v2 is disabled' using errcode = '55000';
  end if;
end
$$;

create or replace function public.provider_payout_policy_at_v2(
  p_currency text, p_at timestamptz default now()
)
returns public.provider_payout_policy_versions
language sql stable security definer set search_path = public, pg_temp as $$
  select policy.* from public.provider_payout_policy_versions policy
  where policy.currency = lower(p_currency)
    and policy.effective_from <= p_at
    and (policy.effective_until is null or policy.effective_until > p_at)
  order by policy.effective_from desc, policy.version desc limit 1
$$;

create or replace function public.provider_latest_standard_payout_slot_v2(
  p_policy_version text, p_at timestamptz default now()
)
returns timestamptz language sql stable security definer set search_path = public, pg_temp as $$
  with policy as (
    select * from public.provider_payout_policy_versions where version = p_policy_version
  ), days as (
    select day::date as local_day from policy,
      generate_series(
        (p_at at time zone policy.schedule_timezone)::date - 8,
        (p_at at time zone policy.schedule_timezone)::date,
        interval '1 day'
      ) day
  )
  select max((days.local_day + policy.standard_payout_local_time)
             at time zone policy.schedule_timezone)
  from policy cross join days
  where extract(isodow from days.local_day)::smallint
          = any(policy.standard_payout_isodays)
    and ((days.local_day + policy.standard_payout_local_time)
         at time zone policy.schedule_timezone) <= p_at
$$;

create or replace function public.provider_next_standard_payout_at_v2(
  p_policy_version text, p_at timestamptz default now()
)
returns timestamptz language sql stable security definer set search_path = public, pg_temp as $$
  with policy as (
    select * from public.provider_payout_policy_versions where version = p_policy_version
  ), days as (
    select day::date as local_day from policy,
      generate_series(
        (p_at at time zone policy.schedule_timezone)::date,
        (p_at at time zone policy.schedule_timezone)::date + 8,
        interval '1 day'
      ) day
  )
  select min((days.local_day + policy.standard_payout_local_time)
             at time zone policy.schedule_timezone)
  from policy cross join days
  where extract(isodow from days.local_day)::smallint
          = any(policy.standard_payout_isodays)
    and ((days.local_day + policy.standard_payout_local_time)
         at time zone policy.schedule_timezone) > p_at
$$;

create or replace function public.provider_internal_balance_v2(
  p_provider_id uuid, p_currency text
)
returns table (
  transferred_amount_cents bigint,
  recovered_amount_cents bigint,
  retransferred_amount_cents bigint,
  reserved_payout_amount_cents bigint,
  unreserved_amount_cents bigint,
  transfer_pending_amount_cents bigint
)
language sql stable security definer set search_path = public, pg_temp as $$
  with transferred as (
    select coalesce(sum(amount_cents), 0)::bigint amount
    from public.provider_transfers_v2
    where provider_id = p_provider_id and currency = lower(p_currency)
      and succeeded_at is not null
  ), recovered as (
    select coalesce(sum(reversal.recovered_amount_cents), 0)::bigint amount
    from public.transfer_reversals_v2 reversal
    join public.provider_transfers_v2 transfer
      on transfer.id = reversal.provider_transfer_id
    where transfer.provider_id = p_provider_id
      and reversal.currency = lower(p_currency)
      and reversal.completed_at is not null
  ), retransferred as (
    select coalesce(sum(reversal.recovered_amount_cents), 0)::bigint amount
    from public.transfer_reversals_v2 reversal
    join public.provider_transfers_v2 transfer
      on transfer.id = reversal.provider_transfer_id
    where transfer.provider_id = p_provider_id
      and reversal.currency = lower(p_currency)
      and reversal.retransferred_at is not null
  ), reserved as (
    select coalesce(sum(payout.provider_balance_debit_amount_cents), 0)::bigint amount
    from public.provider_payouts_v2 payout
    where payout.provider_id = p_provider_id and payout.currency = lower(p_currency)
      and payout.paid_at is null and payout.failed_at is null
      and payout.cancelled_at is null
  ), pending as (
    select coalesce(sum(amount_cents), 0)::bigint amount
    from public.provider_transfers_v2
    where provider_id = p_provider_id and currency = lower(p_currency)
      and succeeded_at is null
  )
  select transferred.amount, recovered.amount, retransferred.amount,
    reserved.amount,
    greatest(0, transferred.amount - recovered.amount + retransferred.amount
      - reserved.amount)::bigint,
    pending.amount
  from transferred, recovered, retransferred, reserved, pending
$$;

create or replace function public.provider_payout_block_reasons_v2(
  p_provider_id uuid
)
returns text[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(reason order by reason), '{}'::text[]) from (
    select 'connect_unavailable'::text reason
    where not exists (
      select 1 from public.provider_connect_accounts account
      where account.provider_id = p_provider_id and not account.closed
        and account.connection_enabled and account.payouts_status = 'active'
    )
    union all
    select 'service_dispute_open' where exists (
      select 1 from public.service_disputes_v2 dispute
      join public.checkout_v2_payments payment on payment.id = dispute.payment_id
      where payment.provider_id = p_provider_id and dispute.resolved_at is null
    )
    union all
    select 'cancellation_open' where exists (
      select 1 from public.cancellation_cases_v2 cancellation
      join public.checkout_v2_payments payment on payment.id = cancellation.payment_id
      where payment.provider_id = p_provider_id and cancellation.resolved_at is null
    )
    union all
    select 'payment_dispute_open' where exists (
      select 1 from public.payment_disputes_v2 dispute
      join public.checkout_v2_payments payment on payment.id = dispute.payment_id
      where payment.provider_id = p_provider_id and dispute.resolved_at is null
    )
    union all
    select 'provider_recovery_pending' where exists (
      select 1 from public.transfer_reversals_v2 reversal
      join public.provider_transfers_v2 transfer
        on transfer.id = reversal.provider_transfer_id
      where transfer.provider_id = p_provider_id
        and reversal.submitted_at is not null and reversal.completed_at is null
    )
    union all
    select 'recovery_deficit_admin_review' where exists (
      select 1 from public.financial_recovery_deficits_v2 deficit
      join public.checkout_v2_payments payment on payment.id = deficit.payment_id
      where payment.provider_id = p_provider_id and deficit.status = 'admin_review'
    )
    union all
    select 'manual_payout_block:' || block.block_code
    from public.provider_payout_blocks_v2 block
    where block.provider_id = p_provider_id and block.resolved_at is null
  ) reasons
$$;

create or replace function public.get_provider_payout_context_v2(
  p_provider_id uuid, p_currency text default 'eur'
)
returns table (
  provider_id uuid, stripe_account_id text, connect_revision bigint,
  payouts_status text, livemode boolean, policy_version text,
  manual_schedule_configured boolean, block_reasons text[]
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_policy public.provider_payout_policy_versions%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform public.require_provider_payouts_v2_enabled();
  select * into v_policy from public.provider_payout_policy_at_v2(p_currency, now());
  if not found then raise exception 'No active payout policy' using errcode = 'P0002'; end if;
  return query
  select account.provider_id, account.stripe_account_id, account.revision,
    account.payouts_status, coalesce(account.livemode, false), v_policy.version,
    exists(select 1 from public.provider_payout_schedule_controls_v2 control
           where control.provider_id = account.provider_id
             and control.stripe_account_id = account.stripe_account_id
             and control.stripe_schedule_interval = 'manual'),
    public.provider_payout_block_reasons_v2(account.provider_id)
  from public.provider_connect_accounts account
  where account.provider_id = p_provider_id and account.stripe_account_id is not null;
end
$$;

create or replace function public.record_provider_payout_schedule_control_v2(
  p_provider_id uuid, p_stripe_account_id text, p_interval text,
  p_balance_settings_revision text
)
returns public.provider_payout_schedule_controls_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_control public.provider_payout_schedule_controls_v2%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_provider_payouts_v2_enabled();
  if p_interval <> 'manual' then raise exception 'Manual Stripe payout schedule required' using errcode = '23514'; end if;
  if not exists (select 1 from public.provider_connect_accounts
                 where provider_id = p_provider_id and stripe_account_id = p_stripe_account_id
                   and not closed and connection_enabled) then
    raise exception 'Connect account mismatch' using errcode = '23514';
  end if;
  perform set_config('app.provider_payouts_v2_mutation', 'on', true);
  insert into public.provider_payout_schedule_controls_v2 (
    provider_id, stripe_account_id, stripe_schedule_interval, configured_at,
    stripe_balance_settings_revision, last_verified_at
  ) values (
    p_provider_id, p_stripe_account_id, p_interval, clock_timestamp(),
    p_balance_settings_revision, clock_timestamp()
  ) on conflict (provider_id) do update set
    stripe_account_id = excluded.stripe_account_id,
    stripe_schedule_interval = excluded.stripe_schedule_interval,
    stripe_balance_settings_revision = excluded.stripe_balance_settings_revision,
    last_verified_at = excluded.last_verified_at,
    revision = provider_payout_schedule_controls_v2.revision + 1,
    updated_at = clock_timestamp()
  returning * into v_control;
  perform set_config('app.provider_payouts_v2_mutation', 'off', true);
  insert into public.financial_audit_log (
    financial_flow_version, event_type, entity_type, entity_id, actor_type,
    reason, after_state, evidence, deduplication_key
  ) values (
    'marketplace_v2', 'payout.schedule_verified', 'provider_payout_schedule',
    p_provider_id::text, 'system', 'Stripe connected account uses manual payouts.',
    jsonb_build_object('interval', p_interval, 'revision', v_control.revision),
    jsonb_build_object('stripe_account_id', p_stripe_account_id),
    'payout-schedule-v2:' || p_provider_id::text || ':' || v_control.revision::text
  );
  return v_control;
end
$$;

create or replace function public.record_provider_balance_snapshot_v2(
  p_stripe_account_id text, p_currency text,
  p_available_amount_cents bigint, p_pending_amount_cents bigint,
  p_instant_gross_amount_cents bigint, p_instant_net_amount_cents bigint,
  p_instant_destination_id text, p_instant_destination_type text,
  p_source_types jsonb, p_livemode boolean, p_retrieval_key text
)
returns public.provider_balance_snapshots_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_provider_id uuid; v_snapshot public.provider_balance_snapshots_v2%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_provider_payouts_v2_enabled();
  select provider_id into v_provider_id from public.provider_connect_accounts
  where stripe_account_id = p_stripe_account_id and not closed and connection_enabled;
  if not found then raise exception 'Connect account unavailable' using errcode = 'P0002'; end if;
  insert into public.provider_balance_snapshots_v2 (
    provider_id, stripe_account_id, currency, stripe_available_amount_cents,
    stripe_pending_amount_cents, stripe_instant_available_gross_amount_cents,
    stripe_instant_available_net_amount_cents, stripe_instant_fee_amount_cents,
    instant_destination_id, instant_destination_type, source_types,
    livemode, retrieval_key
  ) values (
    v_provider_id, p_stripe_account_id, lower(p_currency),
    p_available_amount_cents, p_pending_amount_cents,
    p_instant_gross_amount_cents, p_instant_net_amount_cents,
    p_instant_gross_amount_cents - p_instant_net_amount_cents,
    p_instant_destination_id, p_instant_destination_type,
    coalesce(p_source_types, '{}'::jsonb), p_livemode, p_retrieval_key
  ) on conflict (retrieval_key) do nothing returning * into v_snapshot;
  if v_snapshot.id is null then
    select * into v_snapshot from public.provider_balance_snapshots_v2
    where retrieval_key = p_retrieval_key;
  end if;
  return v_snapshot;
end
$$;

create or replace function public.reserve_standard_provider_payout_v2(
  p_provider_id uuid, p_balance_snapshot_id uuid, p_now timestamptz default now()
)
returns public.provider_payouts_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.provider_connect_accounts%rowtype;
  v_snapshot public.provider_balance_snapshots_v2%rowtype;
  v_policy public.provider_payout_policy_versions%rowtype;
  v_balance record; v_slot timestamptz; v_amount bigint;
  v_workflow public.workflow_instances%rowtype; v_payout public.provider_payouts_v2%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_provider_payouts_v2_enabled();
  select * into v_account from public.provider_connect_accounts
  where provider_id = p_provider_id for update;
  if not found or v_account.closed or not v_account.connection_enabled
     or v_account.payouts_status <> 'active' then
    raise exception 'Connect payouts are unavailable' using errcode = '55000';
  end if;
  if cardinality(public.provider_payout_block_reasons_v2(p_provider_id)) > 0 then
    raise exception 'Provider payout is blocked' using errcode = '55000';
  end if;
  if not exists (select 1 from public.provider_payout_schedule_controls_v2
                 where provider_id = p_provider_id
                   and stripe_account_id = v_account.stripe_account_id
                   and stripe_schedule_interval = 'manual') then
    raise exception 'Stripe manual payout schedule is not verified' using errcode = '55000';
  end if;
  select * into v_snapshot from public.provider_balance_snapshots_v2
  where id = p_balance_snapshot_id and provider_id = p_provider_id
    and stripe_account_id = v_account.stripe_account_id for share;
  if not found or v_snapshot.captured_at < p_now - interval '10 minutes' then
    raise exception 'Fresh Stripe balance snapshot required' using errcode = '55000';
  end if;
  select * into v_policy from public.provider_payout_policy_at_v2(v_snapshot.currency, p_now);
  v_slot := public.provider_latest_standard_payout_slot_v2(v_policy.version, p_now);
  if v_slot is null then raise exception 'No standard payout slot is due' using errcode = '55000'; end if;
  if exists (select 1 from public.provider_payouts_v2
             where provider_id = p_provider_id and currency = v_snapshot.currency
               and paid_at is null and failed_at is null and cancelled_at is null) then
    select * into v_payout from public.provider_payouts_v2
    where provider_id = p_provider_id and currency = v_snapshot.currency
      and paid_at is null and failed_at is null and cancelled_at is null;
    if v_payout.payout_method = 'standard' then return v_payout; end if;
    raise exception 'Another provider payout is already active' using errcode = '55000';
  end if;
  select * into v_balance from public.provider_internal_balance_v2(
    p_provider_id, v_snapshot.currency
  );
  v_amount := least(v_balance.unreserved_amount_cents,
                    v_snapshot.stripe_available_amount_cents);
  if v_amount <= v_policy.minimum_payout_amount_cents then
    raise exception 'No positive provider balance is currently payable' using errcode = '55000';
  end if;
  v_payout.id := gen_random_uuid();
  v_workflow := public.create_workflow_instance(
    'payout', 'v1', v_payout.id, 'marketplace_v2', 'system', null,
    'Released provider funds became payout eligible.',
    jsonb_build_object('amount_cents', v_amount, 'currency', v_snapshot.currency),
    'provider-payout-v2:' || v_payout.id::text || ':workflow'
  );
  v_workflow := public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'payout_funds_available',
    'system', null, 'Released Connect balance is available.', '{}'::jsonb,
    'provider-payout-v2:' || v_payout.id::text || ':available'
  );
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'payout_schedule_standard',
    'system', null, 'Configured standard payout slot is due.',
    jsonb_build_object('schedule_slot_at', v_slot),
    'provider-payout-v2:' || v_payout.id::text || ':scheduled'
  );
  insert into public.provider_payouts_v2 (
    id, provider_id, stripe_account_id, workflow_instance_id, policy_version,
    payout_method, currency, provider_balance_debit_amount_cents,
    bank_payout_amount_cents, balance_snapshot_id, schedule_slot_at,
    idempotency_key
  ) values (
    v_payout.id, p_provider_id, v_account.stripe_account_id, v_workflow.id,
    v_policy.version, 'standard', v_snapshot.currency, v_amount, v_amount,
    v_snapshot.id, v_slot,
    'provider-payout-v2:standard:' || p_provider_id::text || ':'
      || extract(epoch from v_slot)::bigint::text
  ) returning * into v_payout;
  return v_payout;
end
$$;

create or replace function public.quote_provider_instant_payout_v2(
  p_provider_id uuid, p_balance_snapshot_id uuid, p_now timestamptz default now()
)
returns public.provider_payouts_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.provider_connect_accounts%rowtype;
  v_snapshot public.provider_balance_snapshots_v2%rowtype;
  v_policy public.provider_payout_policy_versions%rowtype;
  v_balance record; v_expected_fee bigint;
  v_workflow public.workflow_instances%rowtype; v_payout public.provider_payouts_v2%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_provider_payouts_v2_enabled();
  select * into v_account from public.provider_connect_accounts
  where provider_id = p_provider_id for update;
  if not found or v_account.closed or not v_account.connection_enabled
     or v_account.payouts_status <> 'active'
     or cardinality(public.provider_payout_block_reasons_v2(p_provider_id)) > 0 then
    raise exception 'Provider payout is blocked or unavailable' using errcode = '55000';
  end if;
  select * into v_snapshot from public.provider_balance_snapshots_v2
  where id = p_balance_snapshot_id and provider_id = p_provider_id
    and stripe_account_id = v_account.stripe_account_id for share;
  if not found or v_snapshot.captured_at < p_now - interval '2 minutes'
     or v_snapshot.stripe_instant_available_gross_amount_cents <= 0
     or v_snapshot.instant_destination_id is null then
    raise exception 'Fresh eligible Stripe Instant Payout balance required' using errcode = '55000';
  end if;
  select * into v_policy from public.provider_payout_policy_at_v2(v_snapshot.currency, p_now);
  select * into v_balance from public.provider_internal_balance_v2(
    p_provider_id, v_snapshot.currency
  );
  if v_balance.unreserved_amount_cents
       < v_snapshot.stripe_instant_available_gross_amount_cents then
    raise exception 'Stripe balance exceeds reconciled provider entitlement' using errcode = '55000';
  end if;
  v_expected_fee := floor(
    (v_snapshot.stripe_instant_available_gross_amount_cents::numeric
      * v_policy.stripe_instant_cost_rate_bps + 5000) / 10000
  )::bigint;
  if v_snapshot.stripe_instant_fee_amount_cents <> v_expected_fee
     or v_policy.instant_payout_margin_bps <> 0 then
    raise exception 'Stripe Instant Payout pricing is not configured at exact cost'
      using errcode = '55000';
  end if;
  if exists (select 1 from public.provider_payouts_v2
             where provider_id = p_provider_id and currency = v_snapshot.currency
               and paid_at is null and failed_at is null and cancelled_at is null) then
    select * into v_payout from public.provider_payouts_v2
    where provider_id = p_provider_id and currency = v_snapshot.currency
      and paid_at is null and failed_at is null and cancelled_at is null;
    if v_payout.payout_method = 'instant' and v_payout.quote_expires_at > p_now then
      return v_payout;
    end if;
    raise exception 'Another provider payout is already active' using errcode = '55000';
  end if;
  v_payout.id := gen_random_uuid();
  v_workflow := public.create_workflow_instance(
    'payout', 'v1', v_payout.id, 'marketplace_v2', 'system', null,
    'Released provider funds became payout eligible.', '{}',
    'provider-payout-v2:' || v_payout.id::text || ':workflow'
  );
  v_workflow := public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'payout_funds_available',
    'system', null, 'Released Connect balance is available.', '{}',
    'provider-payout-v2:' || v_payout.id::text || ':available'
  );
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'payout_quote_instant',
    'provider', p_provider_id, 'Exact Stripe Instant Payout cost displayed.',
    jsonb_build_object(
      'gross_debit_amount_cents', v_snapshot.stripe_instant_available_gross_amount_cents,
      'bank_payout_amount_cents', v_snapshot.stripe_instant_available_net_amount_cents,
      'stripe_fee_amount_cents', v_snapshot.stripe_instant_fee_amount_cents,
      'destination_id', v_snapshot.instant_destination_id
    ), 'provider-payout-v2:' || v_payout.id::text || ':quote'
  );
  insert into public.provider_payouts_v2 (
    id, provider_id, stripe_account_id, workflow_instance_id, policy_version,
    payout_method, currency, provider_balance_debit_amount_cents,
    bank_payout_amount_cents, quoted_stripe_fee_amount_cents,
    provider_fee_charged_amount_cents, balance_snapshot_id, destination_id,
    quote_expires_at, idempotency_key
  ) values (
    v_payout.id, p_provider_id, v_account.stripe_account_id, v_workflow.id,
    v_policy.version, 'instant', v_snapshot.currency,
    v_snapshot.stripe_instant_available_gross_amount_cents,
    v_snapshot.stripe_instant_available_net_amount_cents,
    v_snapshot.stripe_instant_fee_amount_cents,
    v_snapshot.stripe_instant_fee_amount_cents, v_snapshot.id,
    v_snapshot.instant_destination_id,
    p_now + make_interval(secs => v_policy.instant_quote_ttl_seconds),
    'provider-payout-v2:instant:' || v_payout.id::text
  ) returning * into v_payout;
  insert into public.financial_audit_log (
    financial_flow_version, event_type, entity_type, entity_id, actor_type,
    actor_user_id, reason, after_state, evidence, deduplication_key
  ) values (
    'marketplace_v2', 'payout.instant_quote', 'provider_payout_v2',
    v_payout.id::text, 'user', p_provider_id,
    'Exact Stripe Instant Payout cost displayed with no Glossed margin.',
    jsonb_build_object('gross_cents', v_payout.provider_balance_debit_amount_cents,
      'net_cents', v_payout.bank_payout_amount_cents,
      'stripe_fee_cents', v_payout.quoted_stripe_fee_amount_cents,
      'currency', v_payout.currency, 'expires_at', v_payout.quote_expires_at),
    jsonb_build_object('balance_snapshot_id', v_snapshot.id,
      'destination_id', v_snapshot.instant_destination_id,
      'pricing_policy_version', v_policy.version),
    'provider-payout-v2:' || v_payout.id::text || ':audit:quote'
  );
  return v_payout;
end
$$;

create or replace function public.confirm_provider_instant_payout_v2(
  p_provider_id uuid, p_payout_id uuid, p_now timestamptz default now()
)
returns public.provider_payouts_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_payout public.provider_payouts_v2%rowtype; v_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_provider_payouts_v2_enabled();
  perform 1 from public.provider_connect_accounts where provider_id = p_provider_id for update;
  select * into v_payout from public.provider_payouts_v2
  where id = p_payout_id and provider_id = p_provider_id for update;
  if not found or v_payout.payout_method <> 'instant' then raise exception 'Instant payout quote not found' using errcode = 'P0002'; end if;
  select * into v_workflow from public.workflow_instances
  where id = v_payout.workflow_instance_id for update;
  if v_workflow.current_state = 'instant_confirmed' then return v_payout; end if;
  if v_workflow.current_state <> 'instant_quote' or v_payout.quote_expires_at <= p_now
     or cardinality(public.provider_payout_block_reasons_v2(p_provider_id)) > 0 then
    raise exception 'Instant payout quote expired or payout became blocked' using errcode = '55000';
  end if;
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'payout_confirm_instant',
    'provider', p_provider_id, 'Provider explicitly accepted the exact Stripe fee.',
    jsonb_build_object('stripe_fee_cents', v_payout.quoted_stripe_fee_amount_cents),
    'provider-payout-v2:' || v_payout.id::text || ':confirmed'
  );
  perform set_config('app.provider_payouts_v2_mutation', 'on', true);
  update public.provider_payouts_v2 set quote_confirmed_at = clock_timestamp(),
    updated_at = clock_timestamp() where id = p_payout_id returning * into v_payout;
  perform set_config('app.provider_payouts_v2_mutation', 'off', true);
  return v_payout;
end
$$;

create or replace function public.reserve_provider_payout_dispatch_v2(
  p_payout_id uuid, p_balance_snapshot_id uuid
)
returns table (
  payout_id uuid, payout_method text, bank_payout_amount_cents bigint,
  currency text, stripe_account_id text, destination_id text,
  idempotency_key text, attempt_number integer
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_payout public.provider_payouts_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_snapshot public.provider_balance_snapshots_v2%rowtype;
  v_balance record; v_other_reserved bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_provider_payouts_v2_enabled();
  select * into v_payout from public.provider_payouts_v2 where id = p_payout_id for update;
  if not found then raise exception 'Provider payout not found' using errcode = 'P0002'; end if;
  perform 1 from public.provider_connect_accounts account
  where account.provider_id = v_payout.provider_id
    and account.stripe_account_id = v_payout.stripe_account_id
    and account.payouts_status = 'active' and not account.closed
    and account.connection_enabled for update;
  if not found or cardinality(public.provider_payout_block_reasons_v2(v_payout.provider_id)) > 0 then
    raise exception 'Current invariants block payout dispatch' using errcode = '55000';
  end if;
  select * into v_workflow from public.workflow_instances
  where id = v_payout.workflow_instance_id for update;
  if v_workflow.current_state = 'submitted' then
    return query select v_payout.id, v_payout.payout_method,
      v_payout.bank_payout_amount_cents, v_payout.currency,
      v_payout.stripe_account_id, v_payout.destination_id,
      v_payout.idempotency_key, v_payout.attempt_count;
    return;
  end if;
  if (v_payout.payout_method = 'standard' and v_workflow.current_state <> 'scheduled')
     or (v_payout.payout_method = 'instant' and v_workflow.current_state <> 'instant_confirmed') then
    raise exception 'Provider payout is not dispatchable' using errcode = '23514';
  end if;
  if v_payout.payout_method = 'instant' and v_payout.quote_expires_at <= now() then
    raise exception 'Instant payout quote expired' using errcode = '55000';
  end if;
  select snapshot.* into v_snapshot from public.provider_balance_snapshots_v2 snapshot
  where snapshot.id = p_balance_snapshot_id
    and snapshot.provider_id = v_payout.provider_id
    and snapshot.stripe_account_id = v_payout.stripe_account_id
    and snapshot.currency = v_payout.currency;
  if not found or v_snapshot.captured_at < now() - interval '2 minutes'
     or v_snapshot.stripe_available_amount_cents
          < v_payout.provider_balance_debit_amount_cents then
    raise exception 'Fresh sufficient Stripe balance required' using errcode = '55000';
  end if;
  if v_payout.payout_method = 'instant' and (
    v_snapshot.stripe_instant_available_gross_amount_cents
      <> v_payout.provider_balance_debit_amount_cents
    or v_snapshot.stripe_instant_available_net_amount_cents
      <> v_payout.bank_payout_amount_cents
    or v_snapshot.instant_destination_id <> v_payout.destination_id
  ) then
    raise exception 'Instant payout balance or exact fee changed; request a new quote' using errcode = '55000';
  end if;
  select * into v_balance from public.provider_internal_balance_v2(
    v_payout.provider_id, v_payout.currency
  );
  select coalesce(sum(provider_balance_debit_amount_cents), 0)::bigint
  into v_other_reserved from public.provider_payouts_v2 other_payout
  where other_payout.provider_id = v_payout.provider_id
    and other_payout.currency = v_payout.currency
    and other_payout.id <> v_payout.id and other_payout.paid_at is null
    and other_payout.failed_at is null and other_payout.cancelled_at is null;
  if v_payout.provider_balance_debit_amount_cents
       > v_balance.unreserved_amount_cents + v_payout.provider_balance_debit_amount_cents
     or v_other_reserved > 0 then
    raise exception 'Payout exceeds reconciled provider funds' using errcode = '55000';
  end if;
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision,
    case when v_payout.payout_method = 'standard'
      then 'payout_submit_standard' else 'payout_submit_instant' end,
    'system', null, 'Provider payout submitted with stable operation identity.',
    jsonb_build_object('balance_snapshot_id', p_balance_snapshot_id,
      'idempotency_key', v_payout.idempotency_key),
    'provider-payout-v2:' || v_payout.id::text || ':submitted'
  );
  perform set_config('app.provider_payouts_v2_mutation', 'on', true);
  update public.provider_payouts_v2 set attempt_count = attempt_count + 1,
    submitted_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = v_payout.id returning * into v_payout;
  perform set_config('app.provider_payouts_v2_mutation', 'off', true);
  insert into public.provider_payout_attempts_v2 (
    payout_id, attempt_number, outcome
  ) values (v_payout.id, v_payout.attempt_count, 'submitted')
  on conflict do nothing;
  return query select v_payout.id, v_payout.payout_method,
    v_payout.bank_payout_amount_cents, v_payout.currency,
    v_payout.stripe_account_id, v_payout.destination_id,
    v_payout.idempotency_key, v_payout.attempt_count;
end
$$;

create or replace function public.attach_provider_payout_stripe_object_v2(
  p_payout_id uuid, p_stripe_payout_id text, p_stripe_status text,
  p_arrival_date date, p_stripe_application_fee_id text,
  p_stripe_balance_transaction_id text
)
returns public.provider_payouts_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_payout public.provider_payouts_v2%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into v_payout from public.provider_payouts_v2 where id = p_payout_id for update;
  if not found then raise exception 'Provider payout not found' using errcode = 'P0002'; end if;
  if v_payout.stripe_payout_id is not null
     and v_payout.stripe_payout_id <> p_stripe_payout_id then
    raise exception 'Provider payout already has another Stripe identity' using errcode = '23505';
  end if;
  perform set_config('app.provider_payouts_v2_mutation', 'on', true);
  update public.provider_payouts_v2 set
    stripe_payout_id = p_stripe_payout_id,
    stripe_status = case when paid_at is not null then 'paid'
      when failed_at is not null then 'failed'
      when cancelled_at is not null then 'canceled'
      else p_stripe_status end,
    arrival_date = p_arrival_date,
    stripe_application_fee_id = coalesce(stripe_application_fee_id, p_stripe_application_fee_id),
    stripe_balance_transaction_id = coalesce(stripe_balance_transaction_id, p_stripe_balance_transaction_id),
    updated_at = clock_timestamp()
  where id = p_payout_id returning * into v_payout;
  perform set_config('app.provider_payouts_v2_mutation', 'off', true);
  return v_payout;
end
$$;

create or replace function public.fail_provider_payout_dispatch_v2(
  p_payout_id uuid, p_error_code text, p_error_message text, p_retryable boolean
)
returns public.provider_payouts_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_payout public.provider_payouts_v2%rowtype; v_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into v_payout from public.provider_payouts_v2 where id = p_payout_id for update;
  select * into v_workflow from public.workflow_instances
  where id = v_payout.workflow_instance_id for update;
  if p_retryable then
    insert into public.provider_payout_attempts_v2 (
      payout_id, attempt_number, outcome, error_code, error_message
    ) values (
      v_payout.id, greatest(v_payout.attempt_count, 1), 'retryable_failure',
      p_error_code, p_error_message
    ) on conflict do nothing;
    return v_payout;
  end if;
  if v_workflow.current_state = 'submitted' then
    perform public.transition_workflow_instance(
      v_workflow.id, v_workflow.revision, 'payout_failed', 'system', null,
      p_error_message, jsonb_build_object('error_code', p_error_code),
      'provider-payout-v2:' || v_payout.id::text || ':failed'
    );
  end if;
  perform set_config('app.provider_payouts_v2_mutation', 'on', true);
  update public.provider_payouts_v2 set failed_at = coalesce(failed_at, clock_timestamp()),
    failure_code = p_error_code, failure_message = p_error_message,
    updated_at = clock_timestamp() where id = p_payout_id returning * into v_payout;
  perform set_config('app.provider_payouts_v2_mutation', 'off', true);
  insert into public.provider_payout_attempts_v2 (
    payout_id, attempt_number, outcome, error_code, error_message
  ) values (
    v_payout.id, greatest(v_payout.attempt_count, 1), 'definitive_failure',
    p_error_code, p_error_message
  ) on conflict do nothing;
  return v_payout;
end
$$;

create or replace function public.process_provider_payout_v2_event(
  p_event_id text, p_event_type text, p_stripe_account_id text,
  p_stripe_created_at timestamptz, p_livemode boolean,
  p_stripe_payout_id text, p_local_payout_id uuid,
  p_amount_cents bigint, p_currency text, p_method text, p_status text,
  p_arrival_date date, p_failure_code text, p_failure_message text,
  p_stripe_application_fee_id text, p_application_fee_amount_cents bigint,
  p_stripe_balance_transaction_id text, p_balance_transaction_fee_cents bigint,
  p_payload_summary jsonb
)
returns table (payout_id uuid, duplicate boolean, outcome text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_event public.stripe_payout_v2_webhook_events%rowtype;
  v_payout public.provider_payouts_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_outcome text; v_actual_fee bigint; v_payout_feature_enabled boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into v_event from public.stripe_payout_v2_webhook_events where event_id = p_event_id;
  if found then return query select v_event.payout_id, true, v_event.outcome; return; end if;
  select * into v_payout from public.provider_payouts_v2
  where (p_local_payout_id is not null and id = p_local_payout_id)
     or stripe_payout_id = p_stripe_payout_id
  order by (id = p_local_payout_id) desc limit 1 for update;
  if not found then
    select enabled into v_payout_feature_enabled
    from public.financial_feature_flags where flag_code = 'provider_payouts_v2';
    if coalesce(v_payout_feature_enabled, false) and exists (
      select 1 from public.provider_payout_schedule_controls_v2 control
      where control.stripe_account_id = p_stripe_account_id
    ) then
      insert into public.provider_payout_blocks_v2 (
        provider_id, block_code, reason, source_type, source_id
      )
      select account.provider_id, 'unexpected_stripe_payout',
        'Stripe reported a payout not reserved by the Glossed v2 payout engine.',
        'payout_failure', p_stripe_payout_id
      from public.provider_connect_accounts account
      where account.stripe_account_id = p_stripe_account_id
      on conflict do nothing;
      v_outcome := 'unexpected_external_payout';
    else
      v_outcome := 'untracked_legacy_payout';
    end if;
    insert into public.stripe_payout_v2_webhook_events values (
      p_event_id, p_event_type, p_stripe_account_id, p_stripe_payout_id,
      null, p_stripe_created_at, p_livemode, false, v_outcome,
      coalesce(p_payload_summary, '{}'), clock_timestamp()
    );
    return query select null::uuid, false, v_outcome; return;
  end if;
  -- A concurrent delivery can only become visible after the payout lock is
  -- acquired. Recheck the event claim inside that serialization boundary.
  select * into v_event from public.stripe_payout_v2_webhook_events
  where event_id = p_event_id;
  if found then return query select v_event.payout_id, true, v_event.outcome; return; end if;
  if v_payout.stripe_account_id <> p_stripe_account_id
     or v_payout.bank_payout_amount_cents <> p_amount_cents
     or v_payout.currency <> lower(p_currency)
     or v_payout.payout_method <> p_method then
    raise exception 'Stripe payout does not match the immutable local operation'
      using errcode = '23514';
  end if;
  if v_payout.stripe_payout_id is not null
     and v_payout.stripe_payout_id <> p_stripe_payout_id then
    raise exception 'Stripe payout identity mismatch' using errcode = '23505';
  end if;
  -- The payout application fee is the amount charged to the provider. It is
  -- not Stripe's own Connect fee, which is reconciled separately. A fee on
  -- the connected payout balance transaction is the only actual Stripe fee
  -- observable on this event.
  v_actual_fee := coalesce(p_balance_transaction_fee_cents, 0);
  if v_payout.payout_method = 'instant'
     and p_application_fee_amount_cents is not null
     and p_application_fee_amount_cents <> v_payout.quoted_stripe_fee_amount_cents then
    insert into public.provider_payout_blocks_v2 (
      provider_id, block_code, reason, source_type, source_id
    ) values (
      v_payout.provider_id, 'instant_fee_mismatch',
      'Actual Stripe Instant Payout application fee differs from the accepted quote.',
      'payout_failure', p_stripe_payout_id
    ) on conflict do nothing;
  end if;
  perform set_config('app.provider_payouts_v2_mutation', 'on', true);
  update public.provider_payouts_v2 set
    stripe_payout_id = coalesce(stripe_payout_id, p_stripe_payout_id),
    stripe_status = case when paid_at is not null then 'paid'
      when failed_at is not null then 'failed'
      when cancelled_at is not null then 'canceled'
      else p_status end,
    arrival_date = coalesce(p_arrival_date, arrival_date),
    stripe_application_fee_id = coalesce(stripe_application_fee_id, p_stripe_application_fee_id),
    stripe_balance_transaction_id = coalesce(stripe_balance_transaction_id, p_stripe_balance_transaction_id),
    provider_fee_charged_amount_cents = case
      when payout_method = 'instant' and p_application_fee_amount_cents is not null
        then p_application_fee_amount_cents else provider_fee_charged_amount_cents end,
    stripe_fee_actual_amount_cents = case when v_actual_fee > 0 then v_actual_fee else stripe_fee_actual_amount_cents end,
    platform_fee_absorbed_amount_cents = case
      when payout_method = 'standard' then v_actual_fee else platform_fee_absorbed_amount_cents end,
    updated_at = clock_timestamp()
  where id = v_payout.id returning * into v_payout;
  perform set_config('app.provider_payouts_v2_mutation', 'off', true);
  select * into v_workflow from public.workflow_instances
  where id = v_payout.workflow_instance_id for update;
  if p_event_type = 'payout.paid' and v_workflow.current_state = 'submitted' then
    perform public.transition_workflow_instance(
      v_workflow.id, v_workflow.revision, 'payout_paid', 'system', null,
      'Signed Stripe webhook confirmed bank payout.',
      jsonb_build_object('stripe_payout_id', p_stripe_payout_id),
      'provider-payout-v2:' || v_payout.id::text || ':paid'
    );
    perform set_config('app.provider_payouts_v2_mutation', 'on', true);
    update public.provider_payouts_v2 set paid_at = coalesce(paid_at, p_stripe_created_at),
      updated_at = clock_timestamp() where id = v_payout.id returning * into v_payout;
    perform set_config('app.provider_payouts_v2_mutation', 'off', true);
    insert into public.provider_payout_attempts_v2 (
      payout_id, attempt_number, outcome, stripe_payout_id
    ) values (v_payout.id, greatest(v_payout.attempt_count, 1), 'paid', p_stripe_payout_id)
    on conflict do nothing;
    v_outcome := 'paid';
  elsif p_event_type = 'payout.failed' and v_workflow.current_state = 'submitted' then
    perform public.transition_workflow_instance(
      v_workflow.id, v_workflow.revision, 'payout_failed', 'system', null,
      coalesce(p_failure_message, 'Stripe bank payout failed.'),
      jsonb_build_object('failure_code', p_failure_code),
      'provider-payout-v2:' || v_payout.id::text || ':failed'
    );
    perform set_config('app.provider_payouts_v2_mutation', 'on', true);
    update public.provider_payouts_v2 set failed_at = coalesce(failed_at, p_stripe_created_at),
      failure_code = p_failure_code, failure_message = p_failure_message,
      updated_at = clock_timestamp() where id = v_payout.id returning * into v_payout;
    perform set_config('app.provider_payouts_v2_mutation', 'off', true);
    insert into public.provider_payout_attempts_v2 (
      payout_id, attempt_number, outcome, stripe_payout_id, error_code, error_message
    ) values (
      v_payout.id, greatest(v_payout.attempt_count, 1), 'definitive_failure',
      p_stripe_payout_id, coalesce(p_failure_code, 'payout_failed'),
      coalesce(p_failure_message, 'Stripe bank payout failed.')
    ) on conflict do nothing;
    v_outcome := 'failed';
  else
    v_outcome := 'reconciled_' || p_status;
  end if;
  insert into public.stripe_payout_v2_webhook_events values (
    p_event_id, p_event_type, p_stripe_account_id, p_stripe_payout_id,
    v_payout.id, p_stripe_created_at, p_livemode, true, v_outcome,
    coalesce(p_payload_summary, '{}'), clock_timestamp()
  );
  insert into public.financial_audit_log (
    financial_flow_version, event_type, entity_type, entity_id, actor_type,
    reason, after_state, evidence, deduplication_key
  ) values (
    'marketplace_v2', 'payout.' || replace(v_outcome, 'reconciled_', ''),
    'provider_payout_v2', v_payout.id::text, 'stripe_webhook',
    'Signed Stripe payout webhook reconciled the bank payout.',
    jsonb_build_object('status', p_status, 'method', v_payout.payout_method,
      'bank_payout_amount_cents', v_payout.bank_payout_amount_cents,
      'currency', v_payout.currency,
      'stripe_fee_actual_amount_cents', v_payout.stripe_fee_actual_amount_cents),
    jsonb_build_object('stripe_event_id', p_event_id,
      'stripe_payout_id', p_stripe_payout_id,
      'stripe_application_fee_id', p_stripe_application_fee_id,
      'stripe_balance_transaction_id', p_stripe_balance_transaction_id),
    'provider-payout-v2-event:' || p_event_id || ':audit'
  );
  return query select v_payout.id, false, v_outcome;
end
$$;

create or replace function public.list_due_provider_payout_accounts_v2(
  p_limit integer default 50, p_now timestamptz default now()
)
returns table (provider_id uuid, currency text, policy_version text, schedule_slot_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_provider_payouts_v2_enabled();
  return query
  select account.provider_id, policy.currency, policy.version,
    public.provider_latest_standard_payout_slot_v2(policy.version, p_now)
  from public.provider_connect_accounts account
  cross join lateral public.provider_payout_policy_at_v2('eur', p_now) policy
  where not account.closed and account.connection_enabled
    and account.payouts_status = 'active'
    and cardinality(public.provider_payout_block_reasons_v2(account.provider_id)) = 0
    and exists (
      select 1 from public.provider_internal_balance_v2(account.provider_id, policy.currency) balance
      where balance.unreserved_amount_cents > policy.minimum_payout_amount_cents
    )
    and not exists (
      select 1 from public.provider_payouts_v2 payout
      where payout.provider_id = account.provider_id and payout.currency = policy.currency
        and payout.paid_at is null and payout.failed_at is null and payout.cancelled_at is null
    )
    and not exists (
      select 1 from public.provider_payouts_v2 payout
      where payout.provider_id = account.provider_id and payout.currency = policy.currency
        and payout.schedule_slot_at
          = public.provider_latest_standard_payout_slot_v2(policy.version, p_now)
    )
  order by account.provider_id
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end
$$;

create or replace function public.expire_provider_instant_payout_quotes_v2(
  p_limit integer default 100, p_now timestamptz default now()
)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_payout public.provider_payouts_v2%rowtype;
  v_workflow public.workflow_instances%rowtype; v_count integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_provider_payouts_v2_enabled();
  for v_payout in
    select payout.* from public.provider_payouts_v2 payout
    join public.workflow_instances workflow on workflow.id = payout.workflow_instance_id
    where payout.payout_method = 'instant' and payout.quote_expires_at <= p_now
      and payout.cancelled_at is null and payout.failed_at is null and payout.paid_at is null
      and workflow.current_state = 'instant_quote'
    order by payout.quote_expires_at for update of payout skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    select * into v_workflow from public.workflow_instances
    where id = v_payout.workflow_instance_id for update;
    perform public.transition_workflow_instance(
      v_workflow.id, v_workflow.revision, 'payout_cancel_quote',
      'system', null, 'Instant Payout quote expired.', '{}',
      'provider-payout-v2:' || v_payout.id::text || ':quote_expired'
    );
    perform set_config('app.provider_payouts_v2_mutation', 'on', true);
    update public.provider_payouts_v2 set cancelled_at = clock_timestamp(),
      updated_at = clock_timestamp() where id = v_payout.id;
    perform set_config('app.provider_payouts_v2_mutation', 'off', true);
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

create or replace function public.list_provider_payouts_for_dispatch_v2(
  p_limit integer default 50
)
returns table (payout_id uuid, provider_id uuid)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_provider_payouts_v2_enabled();
  return query
  select payout.id, payout.provider_id
  from public.provider_payouts_v2 payout
  join public.workflow_instances workflow on workflow.id = payout.workflow_instance_id
  where workflow.current_state in ('scheduled', 'instant_confirmed', 'submitted')
    and payout.paid_at is null and payout.failed_at is null and payout.cancelled_at is null
  order by payout.updated_at, payout.id
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end
$$;

create or replace function public.get_my_provider_gains_v2()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_provider_id uuid := auth.uid();
  v_enabled boolean; v_account public.provider_connect_accounts%rowtype;
  v_policy public.provider_payout_policy_versions%rowtype;
  v_snapshot public.provider_balance_snapshots_v2%rowtype;
  v_balance record; v_available bigint := 0; v_pending bigint := 0;
  v_history jsonb; v_blocks text[];
begin
  if auth.role() <> 'authenticated' or v_provider_id is null then
    raise exception 'Authenticated provider required' using errcode = '42501';
  end if;
  select enabled into v_enabled from public.financial_feature_flags
  where flag_code = 'provider_payouts_v2';
  select * into v_account from public.provider_connect_accounts
  where provider_id = v_provider_id;
  select * into v_policy from public.provider_payout_policy_at_v2('eur', now());
  select * into v_snapshot from public.provider_balance_snapshots_v2
  where provider_id = v_provider_id and currency = 'eur'
  order by captured_at desc limit 1;
  select * into v_balance from public.provider_internal_balance_v2(v_provider_id, 'eur');
  v_blocks := public.provider_payout_block_reasons_v2(v_provider_id);
  if v_snapshot.id is not null then
    v_available := least(v_balance.unreserved_amount_cents,
                         v_snapshot.stripe_available_amount_cents);
    v_pending := v_balance.transfer_pending_amount_cents
      + v_snapshot.stripe_pending_amount_cents;
  else
    v_pending := v_balance.transfer_pending_amount_cents;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', payout.id, 'method', payout.payout_method,
    'gross_debit_amount_cents', payout.provider_balance_debit_amount_cents,
    'bank_payout_amount_cents', payout.bank_payout_amount_cents,
    'stripe_fee_amount_cents', coalesce(payout.stripe_fee_actual_amount_cents,
      payout.quoted_stripe_fee_amount_cents),
    'currency', payout.currency, 'stripe_status', payout.stripe_status,
    'arrival_date', payout.arrival_date, 'created_at', payout.created_at,
    'paid_at', payout.paid_at, 'failed_at', payout.failed_at,
    'failure_code', payout.failure_code
  ) order by payout.created_at desc), '[]'::jsonb) into v_history
  from (select * from public.provider_payouts_v2
        where provider_id = v_provider_id order by created_at desc limit 50) payout;
  return jsonb_build_object(
    'enabled', coalesce(v_enabled, false),
    'currency', 'eur', 'pending_amount_cents', coalesce(v_pending, 0),
    'available_amount_cents', greatest(0, coalesce(v_available, 0)),
    'next_standard_payout_at', case when v_policy.version is null then null
      else public.provider_next_standard_payout_at_v2(v_policy.version, now()) end,
    'minimum_payout_amount_cents', coalesce(v_policy.minimum_payout_amount_cents, 0),
    'schedule_days', coalesce(to_jsonb(v_policy.standard_payout_isodays), '[]'::jsonb),
    'connect_ready', coalesce(v_account.payouts_status = 'active'
      and not v_account.closed and v_account.connection_enabled, false),
    'manual_schedule_configured', exists(
      select 1 from public.provider_payout_schedule_controls_v2 control
      where control.provider_id = v_provider_id
        and control.stripe_schedule_interval = 'manual'),
    'block_reasons', to_jsonb(v_blocks),
    'balance_captured_at', v_snapshot.captured_at,
    'instant_available_gross_amount_cents',
      coalesce(v_snapshot.stripe_instant_available_gross_amount_cents, 0),
    'instant_available_net_amount_cents',
      coalesce(v_snapshot.stripe_instant_available_net_amount_cents, 0),
    'instant_fee_amount_cents', coalesce(v_snapshot.stripe_instant_fee_amount_cents, 0),
    'history', v_history
  );
end
$$;

alter table public.provider_payout_policy_versions enable row level security;
alter table public.provider_payout_schedule_controls_v2 enable row level security;
alter table public.provider_balance_snapshots_v2 enable row level security;
alter table public.provider_payout_blocks_v2 enable row level security;
alter table public.provider_payouts_v2 enable row level security;
alter table public.provider_payout_attempts_v2 enable row level security;
alter table public.stripe_payout_v2_webhook_events enable row level security;

revoke all on public.provider_payout_policy_versions from public, anon, authenticated;
revoke all on public.provider_payout_schedule_controls_v2 from public, anon, authenticated;
revoke all on public.provider_balance_snapshots_v2 from public, anon, authenticated;
revoke all on public.provider_payout_blocks_v2 from public, anon, authenticated;
revoke all on public.provider_payouts_v2 from public, anon, authenticated;
revoke all on public.provider_payout_attempts_v2 from public, anon, authenticated;
revoke all on public.stripe_payout_v2_webhook_events from public, anon, authenticated;

grant all on public.provider_payout_policy_versions to service_role;
grant all on public.provider_payout_schedule_controls_v2 to service_role;
grant all on public.provider_balance_snapshots_v2 to service_role;
grant all on public.provider_payout_blocks_v2 to service_role;
grant all on public.provider_payouts_v2 to service_role;
grant all on public.provider_payout_attempts_v2 to service_role;
grant all on public.stripe_payout_v2_webhook_events to service_role;
grant usage, select on sequence public.provider_payout_attempts_v2_id_seq to service_role;

revoke all on function public.get_my_provider_gains_v2() from public, anon;
grant execute on function public.get_my_provider_gains_v2() to authenticated;

revoke all on function public.require_provider_payouts_v2_enabled() from public, anon, authenticated;
revoke all on function public.serialize_provider_payout_block_source_v2() from public, anon, authenticated;
revoke all on function public.financial_smallint_array_is_unique(smallint[]) from public, anon, authenticated;
revoke all on function public.provider_payout_policy_at_v2(text,timestamptz) from public, anon, authenticated;
revoke all on function public.provider_latest_standard_payout_slot_v2(text,timestamptz) from public, anon, authenticated;
revoke all on function public.provider_next_standard_payout_at_v2(text,timestamptz) from public, anon, authenticated;
revoke all on function public.provider_internal_balance_v2(uuid,text) from public, anon, authenticated;
revoke all on function public.provider_payout_block_reasons_v2(uuid) from public, anon, authenticated;
revoke all on function public.get_provider_payout_context_v2(uuid,text) from public, anon, authenticated;
revoke all on function public.record_provider_payout_schedule_control_v2(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.record_provider_balance_snapshot_v2(text,text,bigint,bigint,bigint,bigint,text,text,jsonb,boolean,text) from public, anon, authenticated;
revoke all on function public.reserve_standard_provider_payout_v2(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.quote_provider_instant_payout_v2(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.confirm_provider_instant_payout_v2(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.reserve_provider_payout_dispatch_v2(uuid,uuid) from public, anon, authenticated;
revoke all on function public.attach_provider_payout_stripe_object_v2(uuid,text,text,date,text,text) from public, anon, authenticated;
revoke all on function public.fail_provider_payout_dispatch_v2(uuid,text,text,boolean) from public, anon, authenticated;
revoke all on function public.process_provider_payout_v2_event(text,text,text,timestamptz,boolean,text,uuid,bigint,text,text,text,date,text,text,text,bigint,text,bigint,jsonb) from public, anon, authenticated;
revoke all on function public.list_due_provider_payout_accounts_v2(integer,timestamptz) from public, anon, authenticated;
revoke all on function public.expire_provider_instant_payout_quotes_v2(integer,timestamptz) from public, anon, authenticated;
revoke all on function public.list_provider_payouts_for_dispatch_v2(integer) from public, anon, authenticated;

grant execute on function public.require_provider_payouts_v2_enabled() to service_role;
grant execute on function public.serialize_provider_payout_block_source_v2() to service_role;
grant execute on function public.financial_smallint_array_is_unique(smallint[]) to service_role;
grant execute on function public.provider_payout_policy_at_v2(text,timestamptz) to service_role;
grant execute on function public.provider_latest_standard_payout_slot_v2(text,timestamptz) to service_role;
grant execute on function public.provider_next_standard_payout_at_v2(text,timestamptz) to service_role;
grant execute on function public.provider_internal_balance_v2(uuid,text) to service_role;
grant execute on function public.provider_payout_block_reasons_v2(uuid) to service_role;
grant execute on function public.get_provider_payout_context_v2(uuid,text) to service_role;
grant execute on function public.record_provider_payout_schedule_control_v2(uuid,text,text,text) to service_role;
grant execute on function public.record_provider_balance_snapshot_v2(text,text,bigint,bigint,bigint,bigint,text,text,jsonb,boolean,text) to service_role;
grant execute on function public.reserve_standard_provider_payout_v2(uuid,uuid,timestamptz) to service_role;
grant execute on function public.quote_provider_instant_payout_v2(uuid,uuid,timestamptz) to service_role;
grant execute on function public.confirm_provider_instant_payout_v2(uuid,uuid,timestamptz) to service_role;
grant execute on function public.reserve_provider_payout_dispatch_v2(uuid,uuid) to service_role;
grant execute on function public.attach_provider_payout_stripe_object_v2(uuid,text,text,date,text,text) to service_role;
grant execute on function public.fail_provider_payout_dispatch_v2(uuid,text,text,boolean) to service_role;
grant execute on function public.process_provider_payout_v2_event(text,text,text,timestamptz,boolean,text,uuid,bigint,text,text,text,date,text,text,text,bigint,text,bigint,jsonb) to service_role;
grant execute on function public.list_due_provider_payout_accounts_v2(integer,timestamptz) to service_role;
grant execute on function public.expire_provider_instant_payout_quotes_v2(integer,timestamptz) to service_role;
grant execute on function public.list_provider_payouts_for_dispatch_v2(integer) to service_role;

commit;
