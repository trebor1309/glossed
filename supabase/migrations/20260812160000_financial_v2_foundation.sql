-- Additive foundation for the versioned financial flow and append-only ledger.
--
-- This migration deliberately leaves the active Stripe integration unchanged.
-- Existing and newly-created records continue to use legacy_v1 until a later,
-- explicitly activated migration introduces the separate-charges-and-transfers
-- flow.

begin;

create table public.financial_flow_versions (
  version text primary key,
  charge_pattern text not null check (charge_pattern in (
    'destination_charge',
    'separate_charges_and_transfers'
  )),
  platform_fee_rate_bps integer check (
    platform_fee_rate_bps is null
    or platform_fee_rate_bps between 0 and 10000
  ),
  rounding_mode text not null check (rounding_mode in ('half_up')),
  release_delay_seconds bigint check (
    release_delay_seconds is null
    or release_delay_seconds between 0 and 31536000
  ),
  notes text check (notes is null or length(notes) between 1 and 4000),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint financial_flow_version_format check (
    version ~ '^[a-z][a-z0-9_]{2,63}$'
  )
);

comment on table public.financial_flow_versions is
  'Immutable definitions for financial engines. A transaction keeps its version for its full lifecycle.';

insert into public.financial_flow_versions (
  version,
  charge_pattern,
  platform_fee_rate_bps,
  rounding_mode,
  release_delay_seconds,
  notes
) values (
  'legacy_v1',
  'destination_charge',
  1000,
  'half_up',
  null,
  'Historical destination-charge flow retained only for operations opened before the v2 rollout.'
);

create or replace function public.reject_financial_definition_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Financial definitions are immutable; create a new version instead'
    using errcode = '55000';
end
$$;

create trigger financial_flow_versions_immutable
before update or delete on public.financial_flow_versions
for each row execute function public.reject_financial_definition_mutation();

alter table public.missions
  add column financial_flow_version text not null default 'legacy_v1'
    references public.financial_flow_versions(version) on delete restrict;

alter table public.payments
  add column financial_flow_version text not null default 'legacy_v1'
    references public.financial_flow_versions(version) on delete restrict;

alter table public.checkout_attempts
  add column financial_flow_version text not null default 'legacy_v1'
    references public.financial_flow_versions(version) on delete restrict;

alter table public.refund_attempts
  add column financial_flow_version text not null default 'legacy_v1'
    references public.financial_flow_versions(version) on delete restrict;

alter table public.stripe_webhook_events
  add column financial_flow_version text not null default 'legacy_v1'
    references public.financial_flow_versions(version) on delete restrict;

-- A child financial object can never silently move to another engine version.
-- The redundant unique constraint makes that invariant enforceable with
-- composite foreign keys instead of application-side checks.
alter table public.missions
  add constraint missions_id_financial_flow_version_key
  unique (id, financial_flow_version);

alter table public.payments
  add constraint payments_id_financial_flow_version_key
  unique (id, financial_flow_version);

alter table public.payments
  add constraint payments_mission_financial_flow_version_fkey
  foreign key (mission_id, financial_flow_version)
  references public.missions(id, financial_flow_version)
  on delete restrict;

alter table public.checkout_attempts
  add constraint checkout_attempts_mission_financial_flow_version_fkey
  foreign key (mission_id, financial_flow_version)
  references public.missions(id, financial_flow_version)
  on delete cascade;

alter table public.refund_attempts
  add constraint refund_attempts_mission_financial_flow_version_fkey
  foreign key (mission_id, financial_flow_version)
  references public.missions(id, financial_flow_version)
  on delete restrict;

alter table public.refund_attempts
  add constraint refund_attempts_payment_financial_flow_version_fkey
  foreign key (payment_id, financial_flow_version)
  references public.payments(id, financial_flow_version)
  on delete restrict;

alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_payment_financial_flow_version_fkey
  foreign key (payment_id, financial_flow_version)
  references public.payments(id, financial_flow_version)
  on delete set null (payment_id);

create or replace function public.reject_financial_flow_version_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.financial_flow_version is distinct from old.financial_flow_version then
    raise exception 'A financial operation cannot change engine version after creation'
      using errcode = '55000';
  end if;
  return new;
end
$$;

create trigger missions_financial_flow_version_immutable
before update of financial_flow_version on public.missions
for each row execute function public.reject_financial_flow_version_change();

create trigger payments_financial_flow_version_immutable
before update of financial_flow_version on public.payments
for each row execute function public.reject_financial_flow_version_change();

create trigger checkout_attempts_financial_flow_version_immutable
before update of financial_flow_version on public.checkout_attempts
for each row execute function public.reject_financial_flow_version_change();

create trigger refund_attempts_financial_flow_version_immutable
before update of financial_flow_version on public.refund_attempts
for each row execute function public.reject_financial_flow_version_change();

create trigger stripe_webhook_events_financial_flow_version_immutable
before update of financial_flow_version on public.stripe_webhook_events
for each row execute function public.reject_financial_flow_version_change();

create table public.financial_limit_versions (
  version text not null,
  metric_code text not null,
  currency text not null,
  comparison_operator text not null check (comparison_operator in ('above', 'below')),
  warning_threshold_cents bigint not null check (warning_threshold_cents >= 0),
  blocking_threshold_cents bigint not null check (blocking_threshold_cents >= 0),
  notes text check (notes is null or length(notes) between 1 and 4000),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (version, metric_code, currency),
  constraint financial_limit_version_format check (
    version ~ '^[a-z][a-z0-9_]{2,63}$'
  ),
  constraint financial_limit_metric_format check (
    metric_code ~ '^[a-z][a-z0-9_]{2,63}$'
  ),
  constraint financial_limit_currency_format check (
    currency ~ '^[a-z]{3}$'
  ),
  constraint financial_limit_threshold_order check (
    (comparison_operator = 'above' and blocking_threshold_cents >= warning_threshold_cents)
    or
    (comparison_operator = 'below' and blocking_threshold_cents <= warning_threshold_cents)
  )
);

comment on table public.financial_limit_versions is
  'Immutable, per-currency warning and blocking thresholds. No production threshold is guessed by this migration.';

create trigger financial_limit_versions_immutable
before update or delete on public.financial_limit_versions
for each row execute function public.reject_financial_definition_mutation();

create table public.financial_runtime_controls (
  id uuid primary key default gen_random_uuid(),
  control_code text not null,
  currency text,
  state text not null default 'normal' check (state in ('normal', 'warning', 'blocked')),
  source text not null default 'manual' check (source in ('manual', 'automatic')),
  reason text,
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint financial_runtime_control_code_format check (
    control_code ~ '^[a-z][a-z0-9_]{2,63}$'
  ),
  constraint financial_runtime_control_currency_format check (
    currency is null or currency ~ '^[a-z]{3}$'
  ),
  constraint financial_runtime_control_reason_required check (
    state = 'normal' or length(trim(reason)) between 1 and 4000
  )
);

create unique index financial_runtime_controls_scope_uidx
  on public.financial_runtime_controls (control_code, currency) nulls not distinct;

create table public.financial_runtime_control_events (
  id bigint generated always as identity primary key,
  control_id uuid not null references public.financial_runtime_controls(id) on delete restrict,
  control_code text not null,
  currency text,
  previous_state text check (previous_state is null or previous_state in ('normal', 'warning', 'blocked')),
  new_state text not null check (new_state in ('normal', 'warning', 'blocked')),
  source text not null check (source in ('manual', 'automatic')),
  reason text,
  revision bigint not null check (revision > 0),
  changed_by uuid references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create or replace function public.prepare_financial_runtime_control()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.control_code is distinct from old.control_code
       or new.currency is distinct from old.currency then
      raise exception 'A runtime control scope cannot be changed'
        using errcode = '55000';
    end if;
    new.revision := old.revision + 1;
    new.updated_at := now();
  else
    new.revision := 1;
    new.updated_at := coalesce(new.updated_at, now());
  end if;

  return new;
end
$$;

create or replace function public.audit_financial_runtime_control()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.financial_runtime_control_events (
    control_id,
    control_code,
    currency,
    previous_state,
    new_state,
    source,
    reason,
    revision,
    changed_by,
    changed_at
  ) values (
    new.id,
    new.control_code,
    new.currency,
    case when tg_op = 'UPDATE' then old.state else null end,
    new.state,
    new.source,
    new.reason,
    new.revision,
    new.updated_by,
    new.updated_at
  );

  return new;
end
$$;

create trigger prepare_financial_runtime_control
before insert or update on public.financial_runtime_controls
for each row execute function public.prepare_financial_runtime_control();

create trigger audit_financial_runtime_control
after insert or update on public.financial_runtime_controls
for each row execute function public.audit_financial_runtime_control();

create trigger financial_runtime_control_events_immutable
before update or delete on public.financial_runtime_control_events
for each row execute function public.reject_financial_definition_mutation();

insert into public.financial_runtime_controls (
  control_code,
  currency,
  state,
  source,
  reason
) values (
  'new_checkout_creation',
  'eur',
  'normal',
  'manual',
  'Baseline only; the legacy Checkout does not read this control.'
);

create table public.financial_ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text not null,
  account_class text not null check (account_class in (
    'asset', 'liability', 'equity', 'revenue', 'expense', 'contra'
  )),
  owner_type text not null check (owner_type in (
    'platform', 'provider', 'client', 'stripe', 'tax_authority'
  )),
  owner_user_id uuid references public.users(id) on delete restrict,
  currency text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint financial_ledger_account_code_format check (
    account_code ~ '^[a-z][a-z0-9_]{2,63}$'
  ),
  constraint financial_ledger_account_currency_format check (
    currency ~ '^[a-z]{3}$'
  ),
  constraint financial_ledger_account_owner_consistent check (
    (owner_type in ('provider', 'client') and owner_user_id is not null)
    or
    (owner_type in ('platform', 'stripe', 'tax_authority') and owner_user_id is null)
  ),
  constraint financial_ledger_account_closed_consistent check (
    (status = 'open' and closed_at is null)
    or
    (status = 'closed' and closed_at is not null)
  )
);

create unique index financial_ledger_accounts_identity_uidx
  on public.financial_ledger_accounts (
    account_code,
    owner_type,
    owner_user_id,
    currency
  ) nulls not distinct;

create or replace function public.protect_financial_ledger_account()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Ledger accounts cannot be deleted'
      using errcode = '55000';
  end if;

  if new.id is distinct from old.id
     or new.account_code is distinct from old.account_code
     or new.account_class is distinct from old.account_class
     or new.owner_type is distinct from old.owner_type
     or new.owner_user_id is distinct from old.owner_user_id
     or new.currency is distinct from old.currency
     or new.created_at is distinct from old.created_at
     or old.status <> 'open'
     or new.status <> 'closed'
     or old.closed_at is not null
     or new.closed_at is null then
    raise exception 'Ledger account identity is immutable and accounts can only be closed once'
      using errcode = '55000';
  end if;

  return new;
end
$$;

create trigger protect_financial_ledger_account
before update or delete on public.financial_ledger_accounts
for each row execute function public.protect_financial_ledger_account();

create table public.financial_ledger_batches (
  id uuid primary key default gen_random_uuid(),
  financial_flow_version text not null
    references public.financial_flow_versions(version) on delete restrict,
  operation_type text not null,
  operation_key text not null unique,
  currency text not null,
  status text not null default 'draft' check (status in ('draft', 'posted')),
  external_reference_type text,
  external_reference_id text,
  reversal_of_batch_id uuid
    references public.financial_ledger_batches(id) on delete restrict,
  actor_type text not null check (actor_type in (
    'user', 'admin', 'system', 'stripe_webhook'
  )),
  actor_user_id uuid references auth.users(id) on delete restrict,
  correlation_id uuid not null default gen_random_uuid(),
  reason text check (reason is null or length(reason) between 1 and 4000),
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  constraint financial_ledger_batch_operation_type_format check (
    operation_type ~ '^[a-z][a-z0-9_]{2,63}$'
  ),
  constraint financial_ledger_batch_operation_key_length check (
    length(operation_key) between 1 and 255
  ),
  constraint financial_ledger_batch_currency_format check (
    currency ~ '^[a-z]{3}$'
  ),
  constraint financial_ledger_batch_external_reference_consistent check (
    (external_reference_type is null and external_reference_id is null)
    or
    (
      length(external_reference_type) between 1 and 100
      and length(external_reference_id) between 1 and 255
    )
  ),
  constraint financial_ledger_batch_actor_consistent check (
    (actor_type in ('user', 'admin') and actor_user_id is not null)
    or
    (actor_type in ('system', 'stripe_webhook') and actor_user_id is null)
  ),
  constraint financial_ledger_batch_posted_consistent check (
    (status = 'draft' and posted_at is null)
    or
    (status = 'posted' and posted_at is not null)
  ),
  constraint financial_ledger_batch_not_self_reversal check (
    reversal_of_batch_id is null or reversal_of_batch_id <> id
  )
);

create unique index financial_ledger_batches_external_reference_uidx
  on public.financial_ledger_batches (
    external_reference_type,
    external_reference_id
  )
  where external_reference_type is not null and external_reference_id is not null;

create index financial_ledger_batches_reversal_idx
  on public.financial_ledger_batches (reversal_of_batch_id)
  where reversal_of_batch_id is not null;

create table public.financial_ledger_entries (
  id bigint generated always as identity primary key,
  batch_id uuid not null
    references public.financial_ledger_batches(id) on delete restrict,
  line_number smallint not null check (line_number > 0),
  account_id uuid not null
    references public.financial_ledger_accounts(id) on delete restrict,
  direction text not null check (direction in ('debit', 'credit')),
  amount_cents bigint not null check (amount_cents > 0),
  memo text check (memo is null or length(memo) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (batch_id, line_number)
);

create index financial_ledger_entries_account_idx
  on public.financial_ledger_entries (account_id, created_at, id);

create or replace function public.validate_financial_ledger_entry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_batch_currency text;
  v_batch_status text;
  v_account_currency text;
  v_account_status text;
begin
  select currency, status
  into v_batch_currency, v_batch_status
  from public.financial_ledger_batches
  where id = new.batch_id
  for update;

  if not found then
    raise exception 'Ledger batch not found' using errcode = '23503';
  end if;
  if v_batch_status <> 'draft' then
    raise exception 'Posted ledger batches cannot receive new entries'
      using errcode = '55000';
  end if;

  select currency, status
  into v_account_currency, v_account_status
  from public.financial_ledger_accounts
  where id = new.account_id;

  if not found then
    raise exception 'Ledger account not found' using errcode = '23503';
  end if;
  if v_account_status <> 'open' then
    raise exception 'Closed ledger accounts cannot receive entries'
      using errcode = '55000';
  end if;
  if v_account_currency <> v_batch_currency then
    raise exception 'Ledger entry currency does not match its batch'
      using errcode = '23514';
  end if;

  return new;
end
$$;

create trigger validate_financial_ledger_entry
before insert on public.financial_ledger_entries
for each row execute function public.validate_financial_ledger_entry();

create or replace function public.reject_financial_ledger_entry_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Ledger entries are append-only; correct them with a reversal batch'
    using errcode = '55000';
end
$$;

create trigger financial_ledger_entries_append_only
before update or delete on public.financial_ledger_entries
for each row execute function public.reject_financial_ledger_entry_mutation();

create or replace function public.protect_financial_ledger_batch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Ledger batches are append-only; correct them with a reversal batch'
      using errcode = '55000';
  end if;

  if current_setting('app.posting_financial_ledger_batch', true) is distinct from 'on'
     or old.status <> 'draft'
     or new.status <> 'posted'
     or new.id is distinct from old.id
     or new.financial_flow_version is distinct from old.financial_flow_version
     or new.operation_type is distinct from old.operation_type
     or new.operation_key is distinct from old.operation_key
     or new.currency is distinct from old.currency
     or new.external_reference_type is distinct from old.external_reference_type
     or new.external_reference_id is distinct from old.external_reference_id
     or new.reversal_of_batch_id is distinct from old.reversal_of_batch_id
     or new.actor_type is distinct from old.actor_type
     or new.actor_user_id is distinct from old.actor_user_id
     or new.correlation_id is distinct from old.correlation_id
     or new.reason is distinct from old.reason
     or new.created_at is distinct from old.created_at
     or new.posted_at is null then
    raise exception 'Ledger batches can only transition atomically from draft to posted'
      using errcode = '55000';
  end if;

  return new;
end
$$;

create trigger protect_financial_ledger_batch
before update or delete on public.financial_ledger_batches
for each row execute function public.protect_financial_ledger_batch();

create or replace function public.post_financial_ledger_batch(
  p_batch_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.financial_ledger_batches%rowtype;
  v_entry_count bigint;
  v_debits numeric;
  v_credits numeric;
  v_reversed_batch public.financial_ledger_batches%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select * into v_batch
  from public.financial_ledger_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'Ledger batch not found' using errcode = 'P0002';
  end if;
  if v_batch.status = 'posted' then
    return v_batch.id;
  end if;

  select
    count(*),
    coalesce(sum(amount_cents) filter (where direction = 'debit'), 0),
    coalesce(sum(amount_cents) filter (where direction = 'credit'), 0)
  into v_entry_count, v_debits, v_credits
  from public.financial_ledger_entries
  where batch_id = p_batch_id;

  if v_entry_count < 2 then
    raise exception 'A ledger batch requires at least two entries'
      using errcode = '23514';
  end if;
  if v_debits = 0 or v_credits = 0 or v_debits <> v_credits then
    raise exception 'Ledger batch is not balanced: debits %, credits %', v_debits, v_credits
      using errcode = '23514';
  end if;

  if v_batch.reversal_of_batch_id is not null then
    select * into v_reversed_batch
    from public.financial_ledger_batches
    where id = v_batch.reversal_of_batch_id
    for update;

    if not found or v_reversed_batch.status <> 'posted' then
      raise exception 'Only a posted ledger batch can be reversed'
        using errcode = '23514';
    end if;
    if v_reversed_batch.currency <> v_batch.currency
       or v_reversed_batch.financial_flow_version <> v_batch.financial_flow_version then
      raise exception 'A reversal must use the original currency and financial flow version'
        using errcode = '23514';
    end if;

    -- Several partial reversals are allowed, but their cumulative amount may
    -- never exceed any original account/direction line. Locking the original
    -- batch above serializes concurrent reversals before this check.
    if exists (
      with original as (
        select
          account_id,
          direction,
          sum(amount_cents) as amount_cents
        from public.financial_ledger_entries
        where batch_id = v_reversed_batch.id
        group by account_id, direction
      ), cumulative_reversal as (
        select
          e.account_id,
          case e.direction when 'debit' then 'credit' else 'debit' end as original_direction,
          sum(e.amount_cents) as amount_cents
        from public.financial_ledger_batches b
        join public.financial_ledger_entries e on e.batch_id = b.id
        where b.reversal_of_batch_id = v_reversed_batch.id
          and (b.status = 'posted' or b.id = v_batch.id)
        group by e.account_id, e.direction
      )
      select 1
      from original o
      full join cumulative_reversal r
        on r.account_id = o.account_id
       and r.original_direction = o.direction
      where o.account_id is null
         or r.amount_cents > o.amount_cents
    ) then
      raise exception 'Cumulative reversal entries exceed or do not match the original batch'
        using errcode = '23514';
    end if;
  end if;

  perform set_config('app.posting_financial_ledger_batch', 'on', true);
  update public.financial_ledger_batches
  set status = 'posted', posted_at = now()
  where id = p_batch_id;
  perform set_config('app.posting_financial_ledger_batch', 'off', true);

  return p_batch_id;
end
$$;

create table public.financial_audit_log (
  id bigint generated always as identity primary key,
  financial_flow_version text
    references public.financial_flow_versions(version) on delete restrict,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  actor_type text not null check (actor_type in (
    'user', 'admin', 'system', 'stripe_webhook'
  )),
  actor_user_id uuid references auth.users(id) on delete restrict,
  reason text,
  before_state jsonb,
  after_state jsonb,
  evidence jsonb not null default '{}'::jsonb,
  deduplication_key text not null unique,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint financial_audit_event_type_format check (
    event_type ~ '^[a-z][a-z0-9_.]{2,100}$'
  ),
  constraint financial_audit_entity_type_format check (
    entity_type ~ '^[a-z][a-z0-9_]{2,63}$'
  ),
  constraint financial_audit_entity_id_length check (
    length(entity_id) between 1 and 255
  ),
  constraint financial_audit_actor_consistent check (
    (actor_type in ('user', 'admin') and actor_user_id is not null)
    or
    (actor_type in ('system', 'stripe_webhook') and actor_user_id is null)
  ),
  constraint financial_audit_reason_length check (
    reason is null or length(reason) between 1 and 4000
  ),
  constraint financial_audit_before_state_object check (
    before_state is null or jsonb_typeof(before_state) = 'object'
  ),
  constraint financial_audit_after_state_object check (
    after_state is null or jsonb_typeof(after_state) = 'object'
  ),
  constraint financial_audit_evidence_object check (
    jsonb_typeof(evidence) = 'object'
  ),
  constraint financial_audit_deduplication_key_length check (
    length(deduplication_key) between 1 and 255
  )
);

create index financial_audit_log_entity_idx
  on public.financial_audit_log (entity_type, entity_id, created_at, id);

create trigger financial_audit_log_append_only
before update or delete on public.financial_audit_log
for each row execute function public.reject_financial_definition_mutation();

-- All financial infrastructure stays server-only. User-facing projections will
-- be exposed later through narrowly scoped, JWT-aware RPCs.
alter table public.financial_flow_versions enable row level security;
alter table public.financial_limit_versions enable row level security;
alter table public.financial_runtime_controls enable row level security;
alter table public.financial_runtime_control_events enable row level security;
alter table public.financial_ledger_accounts enable row level security;
alter table public.financial_ledger_batches enable row level security;
alter table public.financial_ledger_entries enable row level security;
alter table public.financial_audit_log enable row level security;

revoke all on public.financial_flow_versions from public, anon, authenticated;
revoke all on public.financial_limit_versions from public, anon, authenticated;
revoke all on public.financial_runtime_controls from public, anon, authenticated;
revoke all on public.financial_runtime_control_events from public, anon, authenticated;
revoke all on public.financial_ledger_accounts from public, anon, authenticated;
revoke all on public.financial_ledger_batches from public, anon, authenticated;
revoke all on public.financial_ledger_entries from public, anon, authenticated;
revoke all on public.financial_audit_log from public, anon, authenticated;

grant all on public.financial_flow_versions to service_role;
grant all on public.financial_limit_versions to service_role;
grant all on public.financial_runtime_controls to service_role;
grant all on public.financial_runtime_control_events to service_role;
grant all on public.financial_ledger_accounts to service_role;
grant all on public.financial_ledger_batches to service_role;
grant all on public.financial_ledger_entries to service_role;
grant all on public.financial_audit_log to service_role;

revoke all on function public.reject_financial_definition_mutation()
  from public, anon, authenticated;
revoke all on function public.reject_financial_flow_version_change()
  from public, anon, authenticated;
revoke all on function public.prepare_financial_runtime_control()
  from public, anon, authenticated;
revoke all on function public.audit_financial_runtime_control()
  from public, anon, authenticated;
revoke all on function public.validate_financial_ledger_entry()
  from public, anon, authenticated;
revoke all on function public.protect_financial_ledger_account()
  from public, anon, authenticated;
revoke all on function public.reject_financial_ledger_entry_mutation()
  from public, anon, authenticated;
revoke all on function public.protect_financial_ledger_batch()
  from public, anon, authenticated;
revoke all on function public.post_financial_ledger_batch(uuid)
  from public, anon, authenticated;
grant execute on function public.post_financial_ledger_batch(uuid) to service_role;

commit;
