-- Completion, 48-hour release and deferred Stripe transfer for marketplace_v2.
--
-- This path is additive and disabled by default. legacy_v1 remains active.

begin;

insert into public.financial_feature_flags (flag_code, enabled, reason)
values (
  'completion_release_v2', false,
  'Disabled by default. Completion, release and transfer require an explicit controlled rollout.'
);

alter table public.financial_terms_snapshots
  add column eligibility_service_category_code text;
alter table public.financial_terms_snapshots
  add constraint financial_terms_eligibility_category_format check (
    eligibility_service_category_code is null
    or eligibility_service_category_code ~ '^[a-z][a-z0-9_.-]{1,99}$'
  );

insert into public.workflow_transitions (
  transition_code, machine_code, machine_version, from_state, to_state,
  allowed_actor_types, condition_codes, financial_effect_code,
  audit_event_type, description
) values
  (
    'execution_conclude_timeout', 'service_execution', 'v1',
    'provider_completed_waiting_client', 'concluded', array['system'],
    array['release_decision_recorded', 'protection_window_elapsed'], null,
    'execution.concluded',
    'The provider declaration matured after 48 hours and has an explicit release path.'
  ),
  (
    'transfer_fail_definitive', 'provider_transfer', 'v1',
    'submitted', 'manual_review', array['system'],
    array['definitive_stripe_failure'], null, 'transfer.manual_review',
    'A definitive Stripe transfer failure requires administrative review.'
  );

create table public.service_executions_v2 (
  payment_id uuid primary key
    references public.checkout_v2_payments(id) on delete restrict,
  request_id uuid not null unique references public.bookings(id) on delete restrict,
  proposal_id uuid not null unique references public.missions(id) on delete restrict,
  terms_snapshot_id uuid not null unique
    references public.financial_terms_snapshots(id) on delete restrict,
  client_id uuid not null references public.users(id) on delete restrict,
  provider_id uuid not null references public.users(id) on delete restrict,
  workflow_instance_id uuid not null unique
    references public.workflow_instances(id) on delete restrict,
  completion_not_before_at timestamptz not null,
  provider_completed_at timestamptz,
  client_confirmed_at timestamptz,
  problem_reported_at timestamptz,
  problem_code text,
  problem_reason text,
  release_due_at timestamptz,
  original_release_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_execution_v2_provider_completion_consistent check (
    (provider_completed_at is null and release_due_at is null
      and original_release_due_at is null)
    or
    (provider_completed_at is not null and release_due_at is not null
      and original_release_due_at = release_due_at
      and release_due_at > provider_completed_at)
  ),
  constraint service_execution_v2_problem_consistent check (
    (problem_reported_at is null and problem_code is null and problem_reason is null)
    or
    (problem_reported_at is not null
      and length(trim(problem_code)) between 1 and 100
      and length(trim(problem_reason)) between 1 and 4000)
  ),
  constraint service_execution_v2_outcome_exclusive check (
    client_confirmed_at is null or problem_reported_at is null
  )
);

create table public.fund_releases_v2 (
  payment_id uuid primary key
    references public.checkout_v2_payments(id) on delete restrict,
  execution_payment_id uuid not null unique
    references public.service_executions_v2(payment_id) on delete restrict,
  workflow_instance_id uuid not null unique
    references public.workflow_instances(id) on delete restrict,
  allocation_snapshot_id uuid unique
    references public.financial_allocation_snapshots(id) on delete restrict,
  ledger_batch_id uuid unique
    references public.financial_ledger_batches(id) on delete restrict,
  release_trigger text check (
    release_trigger in ('client_confirmation', 'provider_timeout_48h')
  ),
  original_release_due_at timestamptz,
  released_at timestamptz,
  blocked_at timestamptz,
  blocker_codes text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fund_release_v2_blockers_format check (
    public.financial_text_array_is_unique(blocker_codes)
    and public.financial_text_array_matches(
      blocker_codes, '^[a-z][a-z0-9_.-]{2,99}$'
    )
  ),
  constraint fund_release_v2_release_consistent check (
    (released_at is null and allocation_snapshot_id is null
      and ledger_batch_id is null and release_trigger is null)
    or
    (released_at is not null and allocation_snapshot_id is not null
      and ledger_batch_id is not null and release_trigger is not null)
  ),
  constraint fund_release_v2_block_consistent check (
    (blocked_at is null and cardinality(blocker_codes) = 0)
    or
    (blocked_at is not null and cardinality(blocker_codes) > 0)
  )
);

create table public.checkout_v2_financial_holds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null
    references public.checkout_v2_payments(id) on delete restrict,
  hold_type text not null check (hold_type in (
    'service_dispute', 'refund', 'payment_dispute', 'payment_issue',
    'compliance', 'manual'
  )),
  source_reference text not null,
  reason text not null check (length(trim(reason)) between 1 and 4000),
  opened_by_actor_type text not null
    check (opened_by_actor_type in ('client', 'provider', 'system', 'admin')),
  opened_by uuid references auth.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  released_at timestamptz,
  released_by_actor_type text
    check (released_by_actor_type in ('system', 'admin')),
  released_by uuid references auth.users(id) on delete restrict,
  release_reason text,
  created_at timestamptz not null default now(),
  constraint checkout_v2_hold_source_length check (
    length(source_reference) between 1 and 255
  ),
  constraint checkout_v2_hold_open_actor check (
    (opened_by_actor_type = 'system' and opened_by is null)
    or
    (opened_by_actor_type in ('client', 'provider', 'admin') and opened_by is not null)
  ),
  constraint checkout_v2_hold_release_consistent check (
    (released_at is null and released_by_actor_type is null
      and released_by is null and release_reason is null)
    or
    (released_at is not null and released_by_actor_type is not null
      and length(trim(release_reason)) between 1 and 4000
      and ((released_by_actor_type = 'system' and released_by is null)
        or (released_by_actor_type = 'admin' and released_by is not null)))
  )
);

create unique index checkout_v2_financial_holds_active_uidx
  on public.checkout_v2_financial_holds(payment_id, hold_type, source_reference)
  where released_at is null;

create table public.checkout_v2_financial_hold_events (
  id bigint generated always as identity primary key,
  hold_id uuid not null
    references public.checkout_v2_financial_holds(id) on delete restrict,
  payment_id uuid not null
    references public.checkout_v2_payments(id) on delete restrict,
  event_type text not null check (event_type in ('opened', 'released')),
  actor_type text not null check (actor_type in ('client', 'provider', 'system', 'admin')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 1 and 4000),
  deduplication_key text not null unique,
  created_at timestamptz not null default now(),
  constraint checkout_v2_hold_event_actor check (
    (actor_type = 'system' and actor_user_id is null)
    or
    (actor_type in ('client', 'provider', 'admin') and actor_user_id is not null)
  )
);

create table public.provider_transfers_v2 (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique
    references public.checkout_v2_payments(id) on delete restrict,
  release_payment_id uuid not null unique
    references public.fund_releases_v2(payment_id) on delete restrict,
  allocation_snapshot_id uuid not null unique
    references public.financial_allocation_snapshots(id) on delete restrict,
  workflow_instance_id uuid not null unique
    references public.workflow_instances(id) on delete restrict,
  provider_id uuid not null references public.users(id) on delete restrict,
  stripe_account_id text not null
    references public.provider_connect_account_identities(stripe_account_id)
    on delete restrict,
  source_transaction_charge_id text not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  idempotency_key text not null unique,
  stripe_transfer_id text unique,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  reserved_at timestamptz not null default now(),
  submitted_at timestamptz,
  succeeded_at timestamptz,
  last_error_code text,
  last_error_message text,
  ledger_batch_id uuid unique
    references public.financial_ledger_batches(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_transfer_v2_idempotency_length check (
    length(idempotency_key) between 1 and 255
  ),
  constraint provider_transfer_v2_source_charge_format check (
    source_transaction_charge_id ~ '^ch_[A-Za-z0-9_]+'
  ),
  constraint provider_transfer_v2_stripe_id_format check (
    stripe_transfer_id is null or stripe_transfer_id ~ '^tr_[A-Za-z0-9_]+'
  ),
  constraint provider_transfer_v2_success_consistent check (
    (succeeded_at is null and ledger_batch_id is null)
    or
    (succeeded_at is not null and stripe_transfer_id is not null
      and ledger_batch_id is not null)
  )
);

create table public.provider_transfer_v2_attempts (
  id bigint generated always as identity primary key,
  transfer_id uuid not null
    references public.provider_transfers_v2(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  outcome text not null check (outcome in ('succeeded', 'retryable_failure', 'manual_review')),
  stripe_transfer_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (transfer_id, attempt_number),
  constraint provider_transfer_v2_attempt_outcome check (
    (outcome = 'succeeded' and stripe_transfer_id is not null
      and error_code is null and error_message is null)
    or
    (outcome <> 'succeeded' and stripe_transfer_id is null
      and length(trim(error_code)) between 1 and 100
      and length(trim(error_message)) between 1 and 4000)
  )
);

create or replace function public.protect_completion_release_v2_record()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Completion and release v2 records cannot be deleted'
      using errcode = '55000';
  end if;
  if current_setting('app.completion_release_v2_mutation', true) is distinct from 'on' then
    raise exception 'Completion and release v2 records are server-managed'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger protect_service_executions_v2
before update or delete on public.service_executions_v2
for each row execute function public.protect_completion_release_v2_record();
create trigger protect_fund_releases_v2
before update or delete on public.fund_releases_v2
for each row execute function public.protect_completion_release_v2_record();
create trigger protect_checkout_v2_financial_holds
before update or delete on public.checkout_v2_financial_holds
for each row execute function public.protect_completion_release_v2_record();
create trigger protect_provider_transfers_v2
before update or delete on public.provider_transfers_v2
for each row execute function public.protect_completion_release_v2_record();

create trigger checkout_v2_financial_hold_events_immutable
before update or delete on public.checkout_v2_financial_hold_events
for each row execute function public.reject_financial_definition_mutation();
create trigger provider_transfer_v2_attempts_immutable
before update or delete on public.provider_transfer_v2_attempts
for each row execute function public.reject_financial_definition_mutation();

create or replace function public.initialize_checkout_v2_execution()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_terms public.financial_terms_snapshots%rowtype;
  v_execution_workflow public.workflow_instances%rowtype;
  v_release_workflow public.workflow_instances%rowtype;
begin
  select * into v_terms from public.financial_terms_snapshots
  where id = new.terms_snapshot_id;
  v_execution_workflow := public.create_workflow_instance(
    'service_execution', 'v1', new.proposal_id, 'marketplace_v2',
    'system', null, 'Paid v2 service execution initialized.',
    jsonb_build_object('payment_id', new.id,
      'completion_not_before_at', v_terms.completion_not_before_at),
    'completion-v2:' || new.id::text || ':execution:create'
  );
  v_release_workflow := public.create_workflow_instance(
    'fund_release', 'v1', new.proposal_id, 'marketplace_v2',
    'system', null, 'Provider funds held after payment.',
    jsonb_build_object('payment_id', new.id),
    'completion-v2:' || new.id::text || ':release:create'
  );
  insert into public.service_executions_v2 (
    payment_id, request_id, proposal_id, terms_snapshot_id, client_id,
    provider_id, workflow_instance_id, completion_not_before_at
  ) values (
    new.id, new.request_id, new.proposal_id, new.terms_snapshot_id,
    new.client_id, new.provider_id, v_execution_workflow.id,
    v_terms.completion_not_before_at
  );
  insert into public.fund_releases_v2 (
    payment_id, execution_payment_id, workflow_instance_id
  ) values (new.id, new.id, v_release_workflow.id);
  return new;
end
$$;

create trigger initialize_checkout_v2_execution
after insert on public.checkout_v2_payments
for each row execute function public.initialize_checkout_v2_execution();

create or replace function public.require_completion_release_v2_enabled()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not coalesce((select enabled from public.financial_feature_flags
                   where flag_code = 'completion_release_v2'), false) then
    raise exception 'Completion and release v2 is disabled' using errcode = '55000';
  end if;
end
$$;

create or replace function public.advance_service_execution_v2_threshold(
  p_execution public.service_executions_v2,
  p_workflow public.workflow_instances
)
returns public.workflow_instances
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_workflow.current_state = 'planned'
     and clock_timestamp() >= p_execution.completion_not_before_at then
    return public.transition_workflow_instance(
      p_workflow.id, p_workflow.revision,
      'execution_reach_completion_threshold', 'system', null,
      'Server completion threshold reached.',
      jsonb_build_object(
        'completion_not_before_at', p_execution.completion_not_before_at
      ),
      'completion-v2:' || p_execution.payment_id::text || ':eligible'
    );
  end if;
  return p_workflow;
end
$$;

create or replace function public.provider_complete_service_v2(
  p_payment_id uuid,
  p_provider_id uuid,
  p_deduplication_key text
)
returns public.service_executions_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_execution public.service_executions_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_delay_seconds integer;
  v_completed_at timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform public.require_completion_release_v2_enabled();
  -- Keep the common payment/execution lock order used by release operations.
  perform 1 from public.checkout_v2_payments
  where id = p_payment_id for update;
  select * into v_execution from public.service_executions_v2
  where payment_id = p_payment_id for update;
  if not found or v_execution.provider_id <> p_provider_id then
    raise exception 'Provider execution not found' using errcode = '42501';
  end if;
  if v_execution.provider_completed_at is not null then return v_execution; end if;
  if v_execution.client_confirmed_at is not null
     or v_execution.problem_reported_at is not null then
    raise exception 'Execution already has a client outcome' using errcode = '23514';
  end if;
  select * into v_workflow from public.workflow_instances
  where id = v_execution.workflow_instance_id for update;
  v_workflow := public.advance_service_execution_v2_threshold(v_execution, v_workflow);
  if v_workflow.current_state <> 'completion_eligible' then
    raise exception 'Service completion is not yet allowed' using errcode = '23514';
  end if;
  select release_delay_seconds into v_delay_seconds
  from public.financial_flow_versions where version = 'marketplace_v2';
  if v_delay_seconds <> 172800 then
    raise exception 'Marketplace v2 release delay must remain 48 hours'
      using errcode = '23514';
  end if;
  v_completed_at := clock_timestamp();
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision,
    'execution_provider_declares_complete', 'provider', p_provider_id,
    'Provider declared the paid service complete.',
    jsonb_build_object('provider_completed_at', v_completed_at,
      'release_due_at', v_completed_at + make_interval(secs => v_delay_seconds)),
    p_deduplication_key
  );
  perform set_config('app.completion_release_v2_mutation', 'on', true);
  update public.service_executions_v2 set
    provider_completed_at = v_completed_at,
    release_due_at = v_completed_at + make_interval(secs => v_delay_seconds),
    original_release_due_at = v_completed_at + make_interval(secs => v_delay_seconds),
    updated_at = clock_timestamp()
  where payment_id = p_payment_id returning * into v_execution;
  perform set_config('app.completion_release_v2_mutation', 'off', true);
  insert into public.financial_audit_log (
    financial_flow_version, event_type, entity_type, entity_id, actor_type,
    actor_user_id, reason, after_state, evidence, deduplication_key
  ) values (
    'marketplace_v2', 'execution.provider_completed', 'service_execution_v2',
    p_payment_id::text, 'user', p_provider_id,
    'Provider completion recorded at server time.',
    jsonb_build_object('provider_completed_at', v_execution.provider_completed_at,
      'release_due_at', v_execution.release_due_at),
    jsonb_build_object('completion_not_before_at', v_execution.completion_not_before_at),
    p_deduplication_key || ':audit'
  ) on conflict (deduplication_key) do nothing;
  return v_execution;
end
$$;

create or replace function public.open_checkout_v2_financial_hold(
  p_payment_id uuid,
  p_hold_type text,
  p_source_reference text,
  p_reason text,
  p_actor_type text,
  p_actor_user_id uuid,
  p_deduplication_key text
)
returns public.checkout_v2_financial_holds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hold public.checkout_v2_financial_holds%rowtype;
  v_release public.fund_releases_v2%rowtype;
  v_release_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_release from public.fund_releases_v2
  where payment_id = p_payment_id for update;
  if not found then raise exception 'Fund release not found' using errcode = 'P0002'; end if;
  select * into v_hold from public.checkout_v2_financial_holds
  where payment_id = p_payment_id and hold_type = p_hold_type
    and source_reference = p_source_reference and released_at is null;
  if found then return v_hold; end if;
  if v_release.released_at is not null then
    raise exception 'Funds are already released' using errcode = '23514';
  end if;
  insert into public.checkout_v2_financial_holds (
    payment_id, hold_type, source_reference, reason,
    opened_by_actor_type, opened_by
  ) values (
    p_payment_id, p_hold_type, p_source_reference, p_reason,
    p_actor_type, p_actor_user_id
  ) returning * into v_hold;
  insert into public.checkout_v2_financial_hold_events (
    hold_id, payment_id, event_type, actor_type, actor_user_id,
    reason, deduplication_key
  ) values (
    v_hold.id, p_payment_id, 'opened', p_actor_type, p_actor_user_id,
    p_reason, p_deduplication_key
  );
  select * into v_release_workflow from public.workflow_instances
  where id = v_release.workflow_instance_id for update;
  if v_release_workflow.current_state in ('held', 'eligible') then
    v_release_workflow := public.transition_workflow_instance(
      v_release_workflow.id, v_release_workflow.revision,
      case when v_release_workflow.current_state = 'held'
        then 'release_block_held' else 'release_block_eligible' end,
      'system', null, 'Financial hold blocks provider release.',
      jsonb_build_object('hold_id', v_hold.id, 'hold_type', p_hold_type),
      p_deduplication_key || ':release_block'
    );
  end if;
  perform set_config('app.completion_release_v2_mutation', 'on', true);
  update public.fund_releases_v2 set
    blocked_at = coalesce(blocked_at, clock_timestamp()),
    blocker_codes = (
      select array_agg(distinct value order by value)
      from unnest(blocker_codes || p_hold_type) value
    ),
    updated_at = clock_timestamp()
  where payment_id = p_payment_id;
  perform set_config('app.completion_release_v2_mutation', 'off', true);
  return v_hold;
end
$$;

create or replace function public.client_report_service_problem_v2(
  p_payment_id uuid,
  p_client_id uuid,
  p_problem_code text,
  p_reason text,
  p_deduplication_key text
)
returns public.service_executions_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_execution public.service_executions_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_reported_at timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform public.require_completion_release_v2_enabled();
  -- Keep the common payment/execution lock order used by release operations.
  perform 1 from public.checkout_v2_payments
  where id = p_payment_id for update;
  select * into v_execution from public.service_executions_v2
  where payment_id = p_payment_id for update;
  if not found or v_execution.client_id <> p_client_id then
    raise exception 'Client execution not found' using errcode = '42501';
  end if;
  if v_execution.problem_reported_at is not null then return v_execution; end if;
  if v_execution.client_confirmed_at is not null then
    raise exception 'Client already confirmed completion' using errcode = '23514';
  end if;
  select * into v_workflow from public.workflow_instances
  where id = v_execution.workflow_instance_id for update;
  v_workflow := public.advance_service_execution_v2_threshold(v_execution, v_workflow);
  if v_workflow.current_state not in (
    'completion_eligible', 'provider_completed_waiting_client'
  ) then
    raise exception 'A problem cannot be reported in the current state'
      using errcode = '23514';
  end if;
  v_reported_at := clock_timestamp();
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision,
    case when v_workflow.current_state = 'completion_eligible'
      then 'execution_client_reports_problem_without_provider'
      else 'execution_client_reports_problem' end,
    'client', p_client_id, p_reason,
    jsonb_build_object('problem_code', p_problem_code,
      'problem_reported_at', v_reported_at), p_deduplication_key
  );
  perform set_config('app.completion_release_v2_mutation', 'on', true);
  update public.service_executions_v2 set
    problem_reported_at = v_reported_at,
    problem_code = p_problem_code,
    problem_reason = p_reason,
    updated_at = clock_timestamp()
  where payment_id = p_payment_id returning * into v_execution;
  perform set_config('app.completion_release_v2_mutation', 'off', true);
  perform public.open_checkout_v2_financial_hold(
    p_payment_id, 'service_dispute',
    'service-problem:' || p_payment_id::text, p_reason,
    'client', p_client_id, p_deduplication_key || ':hold'
  );
  return v_execution;
end
$$;

create or replace function public.get_checkout_v2_release_connect_context(
  p_payment_id uuid
)
returns table (
  provider_id uuid,
  stripe_account_id text,
  connect_revision bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return query
  select payment.provider_id, connect.stripe_account_id, connect.revision
  from public.checkout_v2_payments payment
  join public.provider_connect_accounts connect
    on connect.provider_id = payment.provider_id
  where payment.id = p_payment_id;
end
$$;

create or replace function public.reserve_full_fund_release_v2(
  p_payment_id uuid,
  p_release_trigger text,
  p_expected_connect_revision bigint,
  p_deduplication_key text
)
returns table (
  transfer_id uuid,
  transfer_status text,
  amount_cents bigint,
  currency text,
  destination_account_id text,
  source_transaction_charge_id text,
  idempotency_key text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.checkout_v2_payments%rowtype;
  v_terms public.financial_terms_snapshots%rowtype;
  v_execution public.service_executions_v2%rowtype;
  v_release public.fund_releases_v2%rowtype;
  v_connect public.provider_connect_accounts%rowtype;
  v_payment_workflow public.workflow_instances%rowtype;
  v_execution_workflow public.workflow_instances%rowtype;
  v_release_workflow public.workflow_instances%rowtype;
  v_transfer_workflow public.workflow_instances%rowtype;
  v_transfer public.provider_transfers_v2%rowtype;
  v_policy public.provider_eligibility_policy_versions%rowtype;
  v_assessment public.provider_eligibility_assessments%rowtype;
  v_allocation_id uuid;
  v_release_batch_id uuid;
  v_provider_held uuid;
  v_provider_payable uuid;
  v_withholding_payable uuid;
  v_fee_held uuid;
  v_fee_revenue uuid;
  v_client_tax_held uuid;
  v_client_tax_payable uuid;
  v_line smallint := 1;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform public.require_completion_release_v2_enabled();
  if p_release_trigger not in ('client_confirmation', 'provider_timeout_48h') then
    raise exception 'Invalid release trigger' using errcode = '22023';
  end if;
  select * into v_payment from public.checkout_v2_payments
  where id = p_payment_id for update;
  if not found then raise exception 'Checkout v2 payment not found' using errcode = 'P0002'; end if;
  select * into v_terms from public.financial_terms_snapshots
  where id = v_payment.terms_snapshot_id;
  select * into v_execution from public.service_executions_v2
  where payment_id = p_payment_id for update;
  select * into v_release from public.fund_releases_v2
  where payment_id = p_payment_id for update;
  if v_release.released_at is not null then
    select * into v_transfer from public.provider_transfers_v2
    where payment_id = p_payment_id;
    return query select v_transfer.id,
      coalesce((select current_state from public.workflow_instances
                where id = v_transfer.workflow_instance_id), 'not_required'),
      v_transfer.amount_cents, v_transfer.currency, v_transfer.stripe_account_id,
      v_transfer.source_transaction_charge_id, v_transfer.idempotency_key;
    return;
  end if;
  select * into v_payment_workflow from public.workflow_instances
  where id = v_payment.workflow_instance_id for update;
  select * into v_execution_workflow from public.workflow_instances
  where id = v_execution.workflow_instance_id for update;
  select * into v_release_workflow from public.workflow_instances
  where id = v_release.workflow_instance_id for update;
  if v_payment_workflow.current_state <> 'paid' then
    raise exception 'Payment is not fully paid' using errcode = '23514';
  end if;
  if v_release_workflow.current_state = 'blocked'
     or exists (select 1 from public.checkout_v2_financial_holds
                where payment_id = p_payment_id and released_at is null) then
    raise exception 'Financial hold blocks provider release' using errcode = '55000';
  end if;
  if p_release_trigger = 'client_confirmation' then
    if v_execution.client_confirmed_at is null
       or v_execution_workflow.current_state <> 'client_confirmed' then
      raise exception 'Client confirmation is not recorded' using errcode = '23514';
    end if;
  else
    if v_execution.provider_completed_at is null
       or v_execution.release_due_at is null
       or clock_timestamp() < v_execution.release_due_at
       or v_execution.client_confirmed_at is not null
       or v_execution.problem_reported_at is not null
       or v_execution_workflow.current_state <> 'provider_completed_waiting_client' then
      raise exception 'Provider 48-hour release is not due' using errcode = '23514';
    end if;
  end if;
  select * into v_connect from public.provider_connect_accounts
  where provider_id = v_payment.provider_id for update;
  if not found or v_connect.revision <> p_expected_connect_revision
     or v_connect.stripe_account_id is null or v_connect.closed
     or not v_connect.connection_enabled
     or v_connect.account_api_version <> 'accounts_v2'
     or v_connect.stripe_transfers_status <> 'active' then
    raise exception 'Current Connect capability does not allow transfer'
      using errcode = '55000';
  end if;
  if v_terms.eligibility_policy_version is null
     or v_terms.jurisdiction_code is null
     or v_terms.eligibility_service_category_code is null then
    raise exception 'Eligibility snapshot is missing' using errcode = '55000';
  end if;
  select * into v_policy from public.provider_eligibility_policy_versions
  where version = v_terms.eligibility_policy_version;
  if not found or v_policy.effective_from > clock_timestamp()
     or (v_policy.effective_until is not null
       and v_policy.effective_until <= clock_timestamp())
     or (v_policy.service_country_code is not null
       and v_policy.service_country_code <> left(v_terms.jurisdiction_code, 2))
     or (v_policy.service_category_code is not null
       and v_policy.service_category_code
         <> v_terms.eligibility_service_category_code) then
    raise exception 'Provider eligibility is not currently valid' using errcode = '55000';
  end if;
  select * into v_assessment
  from public.provider_eligibility_assessments assessment
  where assessment.provider_id = v_payment.provider_id
    and assessment.policy_version = v_terms.eligibility_policy_version
    and assessment.service_country_code = left(v_terms.jurisdiction_code, 2)
    and assessment.service_category_code in (
      v_terms.eligibility_service_category_code, '*'
    )
  order by (
    assessment.service_category_code = v_terms.eligibility_service_category_code
  ) desc, assessment.revision desc
  limit 1;
  if not found or v_assessment.status <> 'eligible'
     or (v_assessment.valid_until is not null
       and v_assessment.valid_until <= clock_timestamp()) then
    raise exception 'Provider eligibility is not currently valid' using errcode = '55000';
  end if;
  if exists (select 1 from public.financial_allocation_snapshots
             where terms_snapshot_id = v_terms.id) then
    raise exception 'A financial allocation already exists' using errcode = '23505';
  end if;

  v_release_workflow := public.transition_workflow_instance(
    v_release_workflow.id, v_release_workflow.revision,
    'release_become_eligible', 'system', null,
    'Validated release trigger occurred.',
    jsonb_build_object('release_trigger', p_release_trigger,
      'original_release_due_at', v_execution.original_release_due_at),
    p_deduplication_key || ':eligible'
  );
  v_release_workflow := public.transition_workflow_instance(
    v_release_workflow.id, v_release_workflow.revision,
    'release_reserve_automatic', 'system', null,
    'All release invariants and Connect capability revalidated.',
    jsonb_build_object('connect_revision', v_connect.revision),
    p_deduplication_key || ':reserved'
  );
  insert into public.financial_allocation_snapshots (
    terms_snapshot_id, revision, allocation_reason, currency,
    provider_awarded_gross_amount_cents, platform_fee_final_amount_cents,
    client_refund_amount_cents, client_tax_allocated_amount_cents,
    provider_statutory_withholding_amount_cents,
    provider_transfer_amount_cents, is_final, created_by_actor_type,
    decision_reason, evidence, deduplication_key
  ) values (
    v_terms.id, 1, 'full_service_release', v_terms.currency,
    v_terms.provider_initial_gross_amount_cents,
    v_terms.platform_fee_initial_amount_cents, 0,
    v_terms.client_tax_initial_amount_cents,
    v_terms.provider_initial_statutory_withholding_cents,
    v_terms.provider_initial_transfer_amount_cents, true, 'system',
    'Full allocation after validated service completion release.',
    jsonb_build_object('release_trigger', p_release_trigger,
      'original_release_due_at', v_execution.original_release_due_at,
      'connect_revision', v_connect.revision),
    p_deduplication_key || ':allocation'
  ) returning id into v_allocation_id;

  v_provider_held := public.get_or_create_financial_ledger_account(
    'provider_gross_held', 'liability', 'provider', v_payment.provider_id, v_terms.currency);
  v_provider_payable := public.get_or_create_financial_ledger_account(
    'provider_transfer_payable', 'liability', 'provider', v_payment.provider_id, v_terms.currency);
  if v_terms.provider_initial_statutory_withholding_cents > 0 then
    v_withholding_payable := public.get_or_create_financial_ledger_account(
      'provider_statutory_withholding_payable', 'liability',
      'tax_authority', null, v_terms.currency);
  end if;
  if v_terms.platform_fee_initial_amount_cents > 0 then
    v_fee_held := public.get_or_create_financial_ledger_account(
      'platform_fee_held', 'liability', 'platform', null, v_terms.currency);
    v_fee_revenue := public.get_or_create_financial_ledger_account(
      'platform_fee_revenue', 'revenue', 'platform', null, v_terms.currency);
  end if;
  if v_terms.client_tax_initial_amount_cents > 0 then
    v_client_tax_held := public.get_or_create_financial_ledger_account(
      'client_tax_held', 'liability', 'platform', null, v_terms.currency);
    v_client_tax_payable := public.get_or_create_financial_ledger_account(
      'client_tax_payable', 'liability', 'tax_authority', null, v_terms.currency);
  end if;
  insert into public.financial_ledger_batches (
    financial_flow_version, operation_type, operation_key, currency,
    external_reference_type, external_reference_id, actor_type, reason
  ) values (
    'marketplace_v2', 'provider_funds_released',
    'release-v2:' || p_payment_id::text, v_terms.currency,
    'checkout_v2_payment', p_payment_id::text, 'system',
    'Provider gross allocation released before deferred transfer.'
  ) returning id into v_release_batch_id;
  insert into public.financial_ledger_entries (
    batch_id, line_number, account_id, direction, amount_cents, memo
  ) values (
    v_release_batch_id, v_line, v_provider_held, 'debit',
    v_terms.provider_initial_gross_amount_cents,
    'Release provider gross funds from held liability.'
  );
  v_line := v_line + 1;
  if v_terms.provider_initial_transfer_amount_cents > 0 then
    insert into public.financial_ledger_entries (
      batch_id, line_number, account_id, direction, amount_cents, memo
    ) values (
      v_release_batch_id, v_line, v_provider_payable, 'credit',
      v_terms.provider_initial_transfer_amount_cents,
      'Recognize deferred provider transfer payable.'
    );
    v_line := v_line + 1;
  end if;
  if v_terms.provider_initial_statutory_withholding_cents > 0 then
    insert into public.financial_ledger_entries (
      batch_id, line_number, account_id, direction, amount_cents, memo
    ) values (
      v_release_batch_id, v_line, v_withholding_payable, 'credit',
      v_terms.provider_initial_statutory_withholding_cents,
      'Recognize statutory withholding inside provider gross award.'
    );
    v_line := v_line + 1;
  end if;
  if v_terms.client_tax_initial_amount_cents > 0 then
    insert into public.financial_ledger_entries (
      batch_id, line_number, account_id, direction, amount_cents, memo
    ) values
      (v_release_batch_id, v_line, v_client_tax_held, 'debit',
       v_terms.client_tax_initial_amount_cents,
       'Release client tax from pending allocation.'),
      (v_release_batch_id, v_line + 1, v_client_tax_payable, 'credit',
       v_terms.client_tax_initial_amount_cents,
       'Recognize allocated client tax payable.');
    v_line := v_line + 2;
  end if;
  if v_terms.platform_fee_initial_amount_cents > 0 then
    insert into public.financial_ledger_entries (
      batch_id, line_number, account_id, direction, amount_cents, memo
    ) values
      (v_release_batch_id, v_line, v_fee_held, 'debit',
       v_terms.platform_fee_initial_amount_cents, 'Release held platform fee.'),
      (v_release_batch_id, v_line + 1, v_fee_revenue, 'credit',
       v_terms.platform_fee_initial_amount_cents, 'Recognize platform fee revenue.');
  end if;
  perform public.post_financial_ledger_batch(v_release_batch_id);
  v_release_workflow := public.transition_workflow_instance(
    v_release_workflow.id, v_release_workflow.revision,
    'release_post', 'system', null,
    'Balanced release allocation posted.',
    jsonb_build_object('allocation_snapshot_id', v_allocation_id,
      'ledger_batch_id', v_release_batch_id),
    p_deduplication_key || ':posted'
  );
  v_execution_workflow := public.transition_workflow_instance(
    v_execution_workflow.id, v_execution_workflow.revision,
    case when p_release_trigger = 'client_confirmation'
      then 'execution_conclude_confirmation' else 'execution_conclude_timeout' end,
    'system', null, 'Execution concluded with explicit full release.',
    jsonb_build_object('release_trigger', p_release_trigger),
    p_deduplication_key || ':execution_concluded'
  );
  perform set_config('app.completion_release_v2_mutation', 'on', true);
  update public.fund_releases_v2 set
    allocation_snapshot_id = v_allocation_id,
    ledger_batch_id = v_release_batch_id,
    release_trigger = p_release_trigger,
    original_release_due_at = v_execution.original_release_due_at,
    released_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where payment_id = p_payment_id returning * into v_release;
  perform set_config('app.completion_release_v2_mutation', 'off', true);

  if v_terms.provider_initial_transfer_amount_cents > 0 then
    v_transfer.id := gen_random_uuid();
    v_transfer_workflow := public.create_workflow_instance(
      'provider_transfer', 'v1', v_transfer.id, 'marketplace_v2',
      'system', null, 'Released provider transfer initialized.',
      jsonb_build_object('payment_id', p_payment_id,
        'allocation_snapshot_id', v_allocation_id),
      'transfer-v2:' || p_payment_id::text || ':workflow'
    );
    insert into public.provider_transfers_v2 (
      id, payment_id, release_payment_id, allocation_snapshot_id,
      workflow_instance_id, provider_id, stripe_account_id,
      source_transaction_charge_id, amount_cents, currency, idempotency_key
    ) values (
      v_transfer.id, p_payment_id, p_payment_id, v_allocation_id,
      v_transfer_workflow.id, v_payment.provider_id, v_connect.stripe_account_id,
      v_payment.stripe_charge_id, v_terms.provider_initial_transfer_amount_cents,
      v_terms.currency, 'transfer-v2:' || p_payment_id::text || ':1'
    ) returning * into v_transfer;
    v_transfer_workflow := public.transition_workflow_instance(
      v_transfer_workflow.id, v_transfer_workflow.revision,
      'transfer_become_ready', 'system', null,
      'Released funds and current Connect capability allow transfer.',
      jsonb_build_object('connect_revision', v_connect.revision),
      p_deduplication_key || ':transfer_ready'
    );
    perform public.transition_workflow_instance(
      v_transfer_workflow.id, v_transfer_workflow.revision,
      'transfer_reserve', 'system', null,
      'Deferred transfer operation atomically reserved.',
      jsonb_build_object('source_transaction', v_payment.stripe_charge_id),
      p_deduplication_key || ':transfer_reserved'
    );
  end if;
  insert into public.financial_audit_log (
    financial_flow_version, event_type, entity_type, entity_id, actor_type,
    reason, after_state, evidence, deduplication_key
  ) values (
    'marketplace_v2', 'release.released', 'fund_release_v2',
    p_payment_id::text, 'system',
    'Provider allocation released after all invariants were revalidated.',
    jsonb_build_object('release_trigger', p_release_trigger,
      'released_at', v_release.released_at,
      'original_release_due_at', v_execution.original_release_due_at),
    jsonb_build_object('allocation_snapshot_id', v_allocation_id,
      'ledger_batch_id', v_release_batch_id,
      'connect_revision', v_connect.revision),
    p_deduplication_key || ':audit'
  );
  return query select v_transfer.id,
    case when v_transfer.id is null then 'not_required' else 'reserved' end,
    v_transfer.amount_cents, v_transfer.currency, v_transfer.stripe_account_id,
    v_transfer.source_transaction_charge_id, v_transfer.idempotency_key;
end
$$;

create or replace function public.client_confirm_service_v2(
  p_payment_id uuid,
  p_client_id uuid,
  p_deduplication_key text
)
returns public.service_executions_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_execution public.service_executions_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_confirmed_at timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform public.require_completion_release_v2_enabled();
  -- Match the release transaction lock order (payment, execution, release) so
  -- client confirmation cannot deadlock with the 48-hour worker.
  perform 1 from public.checkout_v2_payments
  where id = p_payment_id for update;
  select * into v_execution from public.service_executions_v2
  where payment_id = p_payment_id for update;
  if not found or v_execution.client_id <> p_client_id then
    raise exception 'Client execution not found' using errcode = '42501';
  end if;
  if v_execution.problem_reported_at is not null then
    raise exception 'Reported problem blocks confirmation' using errcode = '55000';
  end if;
  if v_execution.client_confirmed_at is null then
    select * into v_workflow from public.workflow_instances
    where id = v_execution.workflow_instance_id for update;
    v_workflow := public.advance_service_execution_v2_threshold(v_execution, v_workflow);
    if v_workflow.current_state not in (
      'completion_eligible', 'provider_completed_waiting_client'
    ) then
      raise exception 'Client confirmation is not yet allowed' using errcode = '23514';
    end if;
    v_confirmed_at := clock_timestamp();
    perform public.transition_workflow_instance(
      v_workflow.id, v_workflow.revision,
      case when v_workflow.current_state = 'completion_eligible'
        then 'execution_client_confirms_without_provider'
        else 'execution_client_confirms_provider' end,
      'client', p_client_id, 'Client explicitly confirmed service completion.',
      jsonb_build_object('client_confirmed_at', v_confirmed_at),
      p_deduplication_key || ':confirmed'
    );
    perform set_config('app.completion_release_v2_mutation', 'on', true);
    update public.service_executions_v2 set
      client_confirmed_at = v_confirmed_at,
      updated_at = clock_timestamp()
    where payment_id = p_payment_id returning * into v_execution;
    perform set_config('app.completion_release_v2_mutation', 'off', true);
  end if;
  return v_execution;
end
$$;

create or replace function public.list_due_fund_releases_v2(p_limit integer default 25)
returns table (
  payment_id uuid,
  provider_id uuid,
  stripe_account_id text,
  connect_revision bigint,
  release_due_at timestamptz,
  release_trigger text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform public.require_completion_release_v2_enabled();
  return query
  select execution.payment_id, execution.provider_id,
    connect.stripe_account_id, connect.revision, execution.release_due_at,
    case when execution.client_confirmed_at is not null
      then 'client_confirmation' else 'provider_timeout_48h' end
  from public.service_executions_v2 execution
  join public.fund_releases_v2 release on release.payment_id = execution.payment_id
  join public.provider_connect_accounts connect
    on connect.provider_id = execution.provider_id
  join public.workflow_instances workflow on workflow.id = execution.workflow_instance_id
  where execution.problem_reported_at is null
    and release.released_at is null
    and release.blocked_at is null
    and (
      (execution.client_confirmed_at is not null
        and workflow.current_state = 'client_confirmed')
      or
      (execution.client_confirmed_at is null
        and execution.provider_completed_at is not null
        and execution.release_due_at <= clock_timestamp()
        and workflow.current_state = 'provider_completed_waiting_client')
    )
    and not exists (
      select 1 from public.checkout_v2_financial_holds hold
      where hold.payment_id = execution.payment_id and hold.released_at is null
    )
  order by coalesce(execution.client_confirmed_at, execution.release_due_at),
    execution.payment_id
  limit greatest(1, least(coalesce(p_limit, 25), 100));
end
$$;

create or replace function public.reserve_client_confirmed_fund_release_v2(
  p_payment_id uuid,
  p_expected_connect_revision bigint
)
returns table (
  transfer_id uuid, transfer_status text, amount_cents bigint, currency text,
  destination_account_id text, source_transaction_charge_id text,
  idempotency_key text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from public.reserve_full_fund_release_v2(
    p_payment_id, 'client_confirmation', p_expected_connect_revision,
    'release-v2:' || p_payment_id::text || ':client_confirmation'
  )
$$;

create or replace function public.reserve_due_fund_release_v2(
  p_payment_id uuid,
  p_expected_connect_revision bigint
)
returns table (
  transfer_id uuid, transfer_status text, amount_cents bigint, currency text,
  destination_account_id text, source_transaction_charge_id text,
  idempotency_key text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from public.reserve_full_fund_release_v2(
    p_payment_id, 'provider_timeout_48h', p_expected_connect_revision,
    'release-v2:' || p_payment_id::text || ':provider_timeout_48h'
  )
$$;

create or replace function public.reserve_provider_transfer_dispatch_v2(
  p_transfer_id uuid,
  p_expected_connect_revision bigint
)
returns table (
  transfer_id uuid, transfer_status text, amount_cents bigint, currency text,
  destination_account_id text, source_transaction_charge_id text,
  idempotency_key text, attempt_number integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transfer public.provider_transfers_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_connect public.provider_connect_accounts%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform public.require_completion_release_v2_enabled();
  select * into v_transfer from public.provider_transfers_v2
  where id = p_transfer_id for update;
  if not found then raise exception 'Provider transfer not found' using errcode = 'P0002'; end if;
  select * into v_workflow from public.workflow_instances
  where id = v_transfer.workflow_instance_id for update;
  if v_workflow.current_state = 'succeeded' then
    return query select v_transfer.id, 'succeeded'::text, v_transfer.amount_cents,
      v_transfer.currency, v_transfer.stripe_account_id,
      v_transfer.source_transaction_charge_id, v_transfer.idempotency_key,
      v_transfer.attempt_count;
    return;
  end if;
  select * into v_connect from public.provider_connect_accounts
  where provider_id = v_transfer.provider_id for update;
  if not found or v_connect.revision <> p_expected_connect_revision
     or v_connect.stripe_account_id <> v_transfer.stripe_account_id
     or v_connect.closed or not v_connect.connection_enabled
     or v_connect.stripe_transfers_status <> 'active'
     or exists (select 1 from public.checkout_v2_financial_holds
                where payment_id = v_transfer.payment_id and released_at is null) then
    if v_workflow.current_state = 'reserved' then
      perform public.transition_workflow_instance(
        v_workflow.id, v_workflow.revision, 'transfer_block_reserved',
        'system', null, 'Current financial or Connect state blocks transfer.',
        jsonb_build_object('connect_revision', v_connect.revision),
        'transfer-v2:' || v_transfer.id::text || ':blocked'
      );
    end if;
    raise exception 'Current invariants block provider transfer' using errcode = '55000';
  end if;
  if v_workflow.current_state = 'failed_retryable' then
    v_workflow := public.transition_workflow_instance(
      v_workflow.id, v_workflow.revision, 'transfer_retry',
      'system', null, 'Retry reserved with the stable operation identity.',
      jsonb_build_object('attempt_count', v_transfer.attempt_count),
      'transfer-v2:' || v_transfer.id::text || ':retry:'
        || (v_transfer.attempt_count + 1)::text
    );
  elsif v_workflow.current_state not in ('reserved', 'submitted') then
    raise exception 'Provider transfer is not dispatchable' using errcode = '23514';
  end if;
  return query select v_transfer.id, v_workflow.current_state, v_transfer.amount_cents,
    v_transfer.currency, v_transfer.stripe_account_id,
    v_transfer.source_transaction_charge_id, v_transfer.idempotency_key,
    case when v_workflow.current_state = 'submitted'
      then v_transfer.attempt_count else v_transfer.attempt_count + 1 end;
end
$$;

create or replace function public.mark_provider_transfer_submitted_v2(
  p_transfer_id uuid
)
returns public.provider_transfers_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transfer public.provider_transfers_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_transfer from public.provider_transfers_v2
  where id = p_transfer_id for update;
  select * into v_workflow from public.workflow_instances
  where id = v_transfer.workflow_instance_id for update;
  if v_workflow.current_state in ('submitted', 'succeeded') then return v_transfer; end if;
  if v_workflow.current_state <> 'reserved' then
    raise exception 'Provider transfer is not reserved' using errcode = '23514';
  end if;
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'transfer_submit',
    'system', null, 'Deferred Stripe transfer submitted.',
    jsonb_build_object('source_transaction', v_transfer.source_transaction_charge_id,
      'idempotency_key', v_transfer.idempotency_key),
    'transfer-v2:' || v_transfer.id::text || ':submitted:'
      || (v_transfer.attempt_count + 1)::text
  );
  perform set_config('app.completion_release_v2_mutation', 'on', true);
  update public.provider_transfers_v2 set
    attempt_count = attempt_count + 1,
    submitted_at = clock_timestamp(),
    last_error_code = null,
    last_error_message = null,
    updated_at = clock_timestamp()
  where id = p_transfer_id returning * into v_transfer;
  perform set_config('app.completion_release_v2_mutation', 'off', true);
  return v_transfer;
end
$$;

create or replace function public.complete_provider_transfer_v2(
  p_transfer_id uuid,
  p_stripe_transfer_id text
)
returns public.provider_transfers_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transfer public.provider_transfers_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_batch_id uuid;
  v_provider_payable uuid;
  v_stripe_asset uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_transfer from public.provider_transfers_v2
  where id = p_transfer_id for update;
  select * into v_workflow from public.workflow_instances
  where id = v_transfer.workflow_instance_id for update;
  if v_workflow.current_state = 'succeeded' then
    if v_transfer.stripe_transfer_id <> p_stripe_transfer_id then
      raise exception 'Transfer already completed with another Stripe identity'
        using errcode = '23505';
    end if;
    return v_transfer;
  end if;
  if v_workflow.current_state <> 'submitted' then
    raise exception 'Provider transfer is not submitted' using errcode = '23514';
  end if;
  v_provider_payable := public.get_or_create_financial_ledger_account(
    'provider_transfer_payable', 'liability', 'provider',
    v_transfer.provider_id, v_transfer.currency);
  v_stripe_asset := public.get_or_create_financial_ledger_account(
    'stripe_platform_balance', 'asset', 'stripe', null, v_transfer.currency);
  insert into public.financial_ledger_batches (
    financial_flow_version, operation_type, operation_key, currency,
    external_reference_type, external_reference_id, actor_type, reason
  ) values (
    'marketplace_v2', 'provider_transfer_succeeded',
    'transfer-v2:' || v_transfer.id::text, v_transfer.currency,
    'stripe_transfer', p_stripe_transfer_id, 'system',
    'Deferred provider transfer created from the original charge.'
  ) returning id into v_batch_id;
  insert into public.financial_ledger_entries (
    batch_id, line_number, account_id, direction, amount_cents, memo
  ) values
    (v_batch_id, 1, v_provider_payable, 'debit', v_transfer.amount_cents,
     'Settle released provider transfer payable.'),
    (v_batch_id, 2, v_stripe_asset, 'credit', v_transfer.amount_cents,
     'Reduce Stripe platform balance by provider transfer.');
  perform public.post_financial_ledger_batch(v_batch_id);
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'transfer_succeed',
    'system', null, 'Stripe confirmed the deferred provider transfer.',
    jsonb_build_object('stripe_transfer_id', p_stripe_transfer_id,
      'ledger_batch_id', v_batch_id),
    'transfer-v2:' || v_transfer.id::text || ':succeeded'
  );
  perform set_config('app.completion_release_v2_mutation', 'on', true);
  update public.provider_transfers_v2 set
    stripe_transfer_id = p_stripe_transfer_id,
    succeeded_at = clock_timestamp(),
    ledger_batch_id = v_batch_id,
    updated_at = clock_timestamp()
  where id = p_transfer_id returning * into v_transfer;
  perform set_config('app.completion_release_v2_mutation', 'off', true);
  insert into public.provider_transfer_v2_attempts (
    transfer_id, attempt_number, outcome, stripe_transfer_id
  ) values (
    v_transfer.id, v_transfer.attempt_count, 'succeeded', p_stripe_transfer_id
  ) on conflict (transfer_id, attempt_number) do nothing;
  insert into public.financial_audit_log (
    financial_flow_version, event_type, entity_type, entity_id, actor_type,
    reason, after_state, evidence, deduplication_key
  ) values (
    'marketplace_v2', 'transfer.succeeded', 'provider_transfer_v2',
    v_transfer.id::text, 'system',
    'Stripe confirmed one deferred transfer.',
    jsonb_build_object('stripe_transfer_id', p_stripe_transfer_id,
      'amount_cents', v_transfer.amount_cents, 'currency', v_transfer.currency),
    jsonb_build_object('source_transaction', v_transfer.source_transaction_charge_id,
      'destination', v_transfer.stripe_account_id,
      'ledger_batch_id', v_batch_id),
    'transfer-v2:' || v_transfer.id::text || ':audit:succeeded'
  );
  return v_transfer;
end
$$;

create or replace function public.fail_provider_transfer_v2(
  p_transfer_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
)
returns public.provider_transfers_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transfer public.provider_transfers_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_outcome text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_transfer from public.provider_transfers_v2
  where id = p_transfer_id for update;
  select * into v_workflow from public.workflow_instances
  where id = v_transfer.workflow_instance_id for update;
  if v_workflow.current_state in ('failed_retryable', 'manual_review') then
    return v_transfer;
  end if;
  if v_workflow.current_state <> 'submitted' then
    raise exception 'Provider transfer is not submitted' using errcode = '23514';
  end if;
  v_outcome := case when p_retryable then 'retryable_failure' else 'manual_review' end;
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision,
    case when p_retryable then 'transfer_fail_retryable'
      else 'transfer_fail_definitive' end,
    'system', null, p_error_message,
    jsonb_build_object('error_code', p_error_code,
      'attempt_number', v_transfer.attempt_count),
    'transfer-v2:' || v_transfer.id::text || ':failure:'
      || v_transfer.attempt_count::text
  );
  perform set_config('app.completion_release_v2_mutation', 'on', true);
  update public.provider_transfers_v2 set
    last_error_code = p_error_code,
    last_error_message = p_error_message,
    updated_at = clock_timestamp()
  where id = p_transfer_id returning * into v_transfer;
  perform set_config('app.completion_release_v2_mutation', 'off', true);
  insert into public.provider_transfer_v2_attempts (
    transfer_id, attempt_number, outcome, error_code, error_message
  ) values (
    v_transfer.id, v_transfer.attempt_count, v_outcome,
    p_error_code, p_error_message
  ) on conflict (transfer_id, attempt_number) do nothing;
  return v_transfer;
end
$$;

create or replace function public.list_provider_transfers_v2_for_dispatch(
  p_limit integer default 25
)
returns table (transfer_id uuid, payment_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform public.require_completion_release_v2_enabled();
  return query
  select transfer.id, transfer.payment_id
  from public.provider_transfers_v2 transfer
  join public.workflow_instances workflow on workflow.id = transfer.workflow_instance_id
  where workflow.current_state in ('reserved', 'submitted', 'failed_retryable')
  order by transfer.updated_at, transfer.id
  limit greatest(1, least(coalesce(p_limit, 25), 100));
end
$$;

alter table public.service_executions_v2 enable row level security;
alter table public.fund_releases_v2 enable row level security;
alter table public.checkout_v2_financial_holds enable row level security;
alter table public.checkout_v2_financial_hold_events enable row level security;
alter table public.provider_transfers_v2 enable row level security;
alter table public.provider_transfer_v2_attempts enable row level security;

revoke all on public.service_executions_v2 from public, anon, authenticated;
revoke all on public.fund_releases_v2 from public, anon, authenticated;
revoke all on public.checkout_v2_financial_holds from public, anon, authenticated;
revoke all on public.checkout_v2_financial_hold_events from public, anon, authenticated;
revoke all on public.provider_transfers_v2 from public, anon, authenticated;
revoke all on public.provider_transfer_v2_attempts from public, anon, authenticated;
revoke all on sequence public.checkout_v2_financial_hold_events_id_seq
from public, anon, authenticated;
revoke all on sequence public.provider_transfer_v2_attempts_id_seq
from public, anon, authenticated;

grant all on public.service_executions_v2 to service_role;
grant all on public.fund_releases_v2 to service_role;
grant all on public.checkout_v2_financial_holds to service_role;
grant all on public.checkout_v2_financial_hold_events to service_role;
grant all on public.provider_transfers_v2 to service_role;
grant all on public.provider_transfer_v2_attempts to service_role;
grant usage, select on sequence public.checkout_v2_financial_hold_events_id_seq
to service_role;
grant usage, select on sequence public.provider_transfer_v2_attempts_id_seq
to service_role;

revoke all on function public.protect_completion_release_v2_record()
from public, anon, authenticated;
revoke all on function public.initialize_checkout_v2_execution()
from public, anon, authenticated;
revoke all on function public.require_completion_release_v2_enabled()
from public, anon, authenticated;
revoke all on function public.advance_service_execution_v2_threshold(
  public.service_executions_v2, public.workflow_instances
) from public, anon, authenticated;

revoke all on function public.provider_complete_service_v2(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.provider_complete_service_v2(uuid, uuid, text)
to service_role;
revoke all on function public.client_report_service_problem_v2(uuid, uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.client_report_service_problem_v2(uuid, uuid, text, text, text)
to service_role;
revoke all on function public.open_checkout_v2_financial_hold(uuid, text, text, text, text, uuid, text)
from public, anon, authenticated;
grant execute on function public.open_checkout_v2_financial_hold(uuid, text, text, text, text, uuid, text)
to service_role;
revoke all on function public.get_checkout_v2_release_connect_context(uuid)
from public, anon, authenticated;
grant execute on function public.get_checkout_v2_release_connect_context(uuid)
to service_role;
revoke all on function public.reserve_full_fund_release_v2(uuid, text, bigint, text)
from public, anon, authenticated;
grant execute on function public.reserve_full_fund_release_v2(uuid, text, bigint, text)
to service_role;
revoke all on function public.client_confirm_service_v2(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.client_confirm_service_v2(uuid, uuid, text)
to service_role;
revoke all on function public.list_due_fund_releases_v2(integer)
from public, anon, authenticated;
grant execute on function public.list_due_fund_releases_v2(integer)
to service_role;
revoke all on function public.reserve_client_confirmed_fund_release_v2(uuid, bigint)
from public, anon, authenticated;
grant execute on function public.reserve_client_confirmed_fund_release_v2(uuid, bigint)
to service_role;
revoke all on function public.reserve_due_fund_release_v2(uuid, bigint)
from public, anon, authenticated;
grant execute on function public.reserve_due_fund_release_v2(uuid, bigint)
to service_role;
revoke all on function public.reserve_provider_transfer_dispatch_v2(uuid, bigint)
from public, anon, authenticated;
grant execute on function public.reserve_provider_transfer_dispatch_v2(uuid, bigint)
to service_role;
revoke all on function public.mark_provider_transfer_submitted_v2(uuid)
from public, anon, authenticated;
grant execute on function public.mark_provider_transfer_submitted_v2(uuid)
to service_role;
revoke all on function public.complete_provider_transfer_v2(uuid, text)
from public, anon, authenticated;
grant execute on function public.complete_provider_transfer_v2(uuid, text)
to service_role;
revoke all on function public.fail_provider_transfer_v2(uuid, text, text, boolean)
from public, anon, authenticated;
grant execute on function public.fail_provider_transfer_v2(uuid, text, text, boolean)
to service_role;
revoke all on function public.list_provider_transfers_v2_for_dispatch(integer)
from public, anon, authenticated;
grant execute on function public.list_provider_transfers_v2_for_dispatch(integer)
to service_role;

commit;
