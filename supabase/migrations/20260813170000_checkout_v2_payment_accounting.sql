-- Checkout v2 and platform-charge accounting.
--
-- The engine is additive and disabled by default. legacy_v1 remains the only
-- active path until checkout_v2 is explicitly enabled and a request is
-- explicitly enrolled through a v2 conditional selection.

begin;

insert into public.financial_flow_versions (
  version, charge_pattern, platform_fee_rate_bps, rounding_mode,
  release_delay_seconds, notes
) values (
  'marketplace_v2', 'separate_charges_and_transfers', 1000, 'half_up', 172800,
  'Platform Checkout charge followed by a separately authorized provider transfer. This definition is inert until the checkout_v2 feature flag is enabled.'
);

create table public.financial_feature_flags (
  flag_code text primary key,
  enabled boolean not null default false,
  revision bigint not null default 1 check (revision > 0),
  reason text not null check (length(trim(reason)) between 1 and 4000),
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint financial_feature_flag_code_format check (
    flag_code ~ '^[a-z][a-z0-9_]{2,63}$'
  )
);

create table public.financial_feature_flag_events (
  id bigint generated always as identity primary key,
  flag_code text not null,
  previous_enabled boolean,
  new_enabled boolean not null,
  revision bigint not null check (revision > 0),
  reason text not null,
  changed_by uuid references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create or replace function public.audit_financial_feature_flag()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.flag_code is distinct from old.flag_code then
      raise exception 'Feature flag identity is immutable' using errcode = '55000';
    end if;
    new.revision := old.revision + 1;
    new.updated_at := clock_timestamp();
  end if;
  insert into public.financial_feature_flag_events (
    flag_code, previous_enabled, new_enabled, revision, reason, changed_by, changed_at
  ) values (
    new.flag_code, case when tg_op = 'UPDATE' then old.enabled else null end,
    new.enabled, new.revision, new.reason, new.updated_by, new.updated_at
  );
  return new;
end
$$;

create trigger audit_financial_feature_flag
before insert or update on public.financial_feature_flags
for each row execute function public.audit_financial_feature_flag();

create trigger financial_feature_flag_events_immutable
before update or delete on public.financial_feature_flag_events
for each row execute function public.reject_financial_definition_mutation();

insert into public.financial_feature_flags (flag_code, enabled, reason)
values (
  'checkout_v2', false,
  'Disabled by default. Enabling requires an explicit controlled rollout after this foundation is deployed.'
);

create table public.checkout_v2_policy_versions (
  version text primary key,
  financial_flow_version text not null default 'marketplace_v2'
    references public.financial_flow_versions(version) on delete restrict,
  currency text not null,
  payment_window_open_before_start_seconds bigint not null check (
    payment_window_open_before_start_seconds between 1800 and 31536000
  ),
  payment_deadline_seconds bigint not null check (
    payment_deadline_seconds between 1800 and 2592000
  ),
  checkout_ttl_seconds bigint not null check (
    checkout_ttl_seconds between 1800 and 86400
  ),
  checkout_expiry_margin_before_start_seconds bigint not null check (
    checkout_expiry_margin_before_start_seconds between 0 and 2592000
  ),
  liquidity_limit_version text not null,
  liquidity_limit_metric_code text not null default 'checkout_liquidity_exposure'
    check (liquidity_limit_metric_code = 'checkout_liquidity_exposure'),
  stripe_payment_method_configuration_reference text not null check (
    length(stripe_payment_method_configuration_reference) between 1 and 100
  ),
  notes text not null check (length(trim(notes)) between 1 and 4000),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint checkout_v2_policy_version_format check (
    version ~ '^[a-z][a-z0-9_.-]{2,99}$'
  ),
  constraint checkout_v2_policy_currency_format check (currency ~ '^[a-z]{3}$'),
  constraint checkout_v2_policy_engine check (
    financial_flow_version = 'marketplace_v2'
  ),
  foreign key (liquidity_limit_version, liquidity_limit_metric_code, currency)
    references public.financial_limit_versions(version, metric_code, currency)
    on delete restrict
);

create trigger checkout_v2_policy_versions_immutable
before update or delete on public.checkout_v2_policy_versions
for each row execute function public.reject_financial_definition_mutation();

create table public.checkout_v2_selections (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.bookings(id) on delete restrict,
  selected_proposal_id uuid not null references public.missions(id) on delete restrict,
  terms_snapshot_id uuid not null unique
    references public.financial_terms_snapshots(id) on delete restrict,
  client_id uuid not null references public.users(id) on delete restrict,
  provider_id uuid not null references public.users(id) on delete restrict,
  policy_version text not null
    references public.checkout_v2_policy_versions(version) on delete restrict,
  financial_flow_version text not null default 'marketplace_v2'
    references public.financial_flow_versions(version) on delete restrict,
  request_workflow_instance_id uuid not null unique
    references public.workflow_instances(id) on delete restrict,
  proposal_workflow_instance_id uuid not null unique
    references public.workflow_instances(id) on delete restrict,
  selection_workflow_instance_id uuid not null unique
    references public.workflow_instances(id) on delete restrict,
  payment_window_opens_at timestamptz not null,
  payment_deadline_at timestamptz not null,
  lock_released_at timestamptz,
  lock_release_reason text,
  deduplication_key text not null unique,
  created_at timestamptz not null default now(),
  constraint checkout_v2_selection_engine check (
    financial_flow_version = 'marketplace_v2'
  ),
  constraint checkout_v2_selection_window check (
    payment_window_opens_at < payment_deadline_at
  ),
  constraint checkout_v2_selection_lock_consistent check (
    (lock_released_at is null and lock_release_reason is null)
    or
    (lock_released_at is not null and length(trim(lock_release_reason)) between 1 and 255)
  ),
  constraint checkout_v2_selection_dedup_length check (
    length(deduplication_key) between 1 and 255
  )
);

create unique index checkout_v2_selections_active_request_uidx
  on public.checkout_v2_selections(request_id)
  where lock_released_at is null;

create table public.checkout_v2_attempts (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null references public.checkout_v2_selections(id) on delete restrict,
  terms_snapshot_id uuid not null references public.financial_terms_snapshots(id) on delete restrict,
  client_id uuid not null references public.users(id) on delete restrict,
  workflow_instance_id uuid not null unique
    references public.workflow_instances(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  idempotency_key text not null unique,
  stripe_session_id text unique,
  stripe_session_url text,
  reserved_expires_at timestamptz not null,
  stripe_expires_at timestamptz,
  payment_method_configuration_reference text not null,
  currency text not null,
  amount_total_cents bigint not null check (amount_total_cents > 0),
  stripe_payment_intent_id text unique,
  stripe_charge_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (selection_id, attempt_number),
  constraint checkout_v2_attempt_currency_format check (currency ~ '^[a-z]{3}$'),
  constraint checkout_v2_attempt_session_shape check (
    (stripe_session_id is null and stripe_session_url is null and stripe_expires_at is null)
    or
    (stripe_session_id is not null and stripe_session_url is not null and stripe_expires_at is not null)
  ),
  constraint checkout_v2_attempt_expiry_bound check (
    stripe_expires_at is null or stripe_expires_at <= reserved_expires_at
  )
);

create unique index checkout_v2_attempts_one_active_selection_uidx
  on public.checkout_v2_attempts(selection_id)
  where stripe_payment_intent_id is null;

create table public.checkout_v2_liquidity_reservations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.checkout_v2_attempts(id) on delete restrict,
  selection_id uuid not null references public.checkout_v2_selections(id) on delete restrict,
  limit_version text not null,
  limit_metric_code text not null default 'checkout_liquidity_exposure'
    check (limit_metric_code = 'checkout_liquidity_exposure'),
  currency text not null,
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'active' check (status in ('active', 'consumed', 'released')),
  release_reason text,
  reserved_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint checkout_v2_liquidity_currency_format check (currency ~ '^[a-z]{3}$'),
  constraint checkout_v2_liquidity_resolution check (
    (status = 'active' and resolved_at is null and release_reason is null)
    or
    (status = 'consumed' and resolved_at is not null and release_reason = 'payment_confirmed')
    or
    (status = 'released' and resolved_at is not null and length(trim(release_reason)) between 1 and 255)
  ),
  foreign key (limit_version, limit_metric_code, currency)
    references public.financial_limit_versions(version, metric_code, currency)
    on delete restrict
);

create table public.checkout_v2_payments (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null unique references public.checkout_v2_selections(id) on delete restrict,
  attempt_id uuid not null unique references public.checkout_v2_attempts(id) on delete restrict,
  request_id uuid not null unique references public.bookings(id) on delete restrict,
  proposal_id uuid not null unique references public.missions(id) on delete restrict,
  terms_snapshot_id uuid not null unique references public.financial_terms_snapshots(id) on delete restrict,
  client_id uuid not null references public.users(id) on delete restrict,
  provider_id uuid not null references public.users(id) on delete restrict,
  workflow_instance_id uuid not null unique references public.workflow_instances(id) on delete restrict,
  financial_flow_version text not null default 'marketplace_v2'
    references public.financial_flow_versions(version) on delete restrict,
  currency text not null,
  amount_total_cents bigint not null check (amount_total_cents > 0),
  provider_gross_held_cents bigint not null check (provider_gross_held_cents > 0),
  platform_fee_held_cents bigint not null check (platform_fee_held_cents >= 0),
  client_tax_held_cents bigint not null check (client_tax_held_cents >= 0),
  stripe_payment_intent_id text not null unique,
  stripe_charge_id text not null unique,
  stripe_session_id text not null unique,
  stripe_event_id text not null,
  livemode boolean not null,
  paid_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint checkout_v2_payment_engine check (
    financial_flow_version = 'marketplace_v2'
  ),
  constraint checkout_v2_payment_currency_format check (currency ~ '^[a-z]{3}$'),
  constraint checkout_v2_payment_allocation check (
    amount_total_cents = provider_gross_held_cents
      + platform_fee_held_cents + client_tax_held_cents
  )
);

create table public.checkout_v2_awards (
  request_id uuid primary key references public.bookings(id) on delete restrict,
  selection_id uuid not null unique references public.checkout_v2_selections(id) on delete restrict,
  proposal_id uuid not null unique references public.missions(id) on delete restrict,
  payment_id uuid not null unique references public.checkout_v2_payments(id) on delete restrict,
  client_id uuid not null references public.users(id) on delete restrict,
  provider_id uuid not null references public.users(id) on delete restrict,
  awarded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create trigger checkout_v2_payments_immutable
before update or delete on public.checkout_v2_payments
for each row execute function public.reject_financial_definition_mutation();

create trigger checkout_v2_awards_immutable
before update or delete on public.checkout_v2_awards
for each row execute function public.reject_financial_definition_mutation();

create or replace function public.block_proposal_after_checkout_v2_award()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.booking_id is not null then
    perform 1 from public.bookings
    where id = new.booking_id
    for update;
    if exists (
      select 1 from public.checkout_v2_awards award
      where award.request_id = new.booking_id
    ) then
      raise exception 'Request is already awarded and cannot receive proposals'
        using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

create trigger block_proposal_after_checkout_v2_award
before insert on public.missions
for each row execute function public.block_proposal_after_checkout_v2_award();

alter table public.notifications drop constraint notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check
check (event_type in (
  'new_message', 'booking_request', 'offer_received', 'mission_confirmed',
  'cancellation_requested', 'mission_cancelled', 'mission_completed',
  'payment_confirmed', 'refund_completed', 'verification_approved',
  'verification_rejected', 'proposal_not_selected'
));
alter table public.notifications drop constraint notifications_source_table_check;
alter table public.notifications add constraint notifications_source_table_check
check (source_table in (
  'messages', 'booking_notifications', 'missions', 'payments',
  'professional_verification_reviews', 'checkout_v2_awards'
));

create or replace function public.notification_email_preference_enabled(
  p_user public.users,
  p_event_type text
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    coalesce(p_user.notifications_email, p_user.notif_email, true)
    and case
      when p_event_type = 'new_message'
        then coalesce(p_user.notif_new_messages, true)
      when p_event_type = 'booking_request'
        then coalesce(p_user.notif_job_alerts, true)
      when p_event_type in (
        'offer_received', 'mission_confirmed', 'cancellation_requested',
        'mission_cancelled', 'mission_completed', 'payment_confirmed',
        'refund_completed', 'proposal_not_selected'
      ) then coalesce(p_user.notif_booking_updates, true)
      else true
    end
$$;

create table public.checkout_v2_webhook_events (
  event_id text primary key,
  event_type text not null,
  stripe_created_at timestamptz not null,
  stripe_session_id text not null,
  livemode boolean not null,
  applied boolean not null,
  outcome text not null check (outcome in (
    'payment_confirmed', 'payment_pending', 'checkout_expired',
    'payment_failed', 'already_resolved'
  )),
  payment_id uuid references public.checkout_v2_payments(id) on delete restrict,
  payload_summary jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  constraint checkout_v2_webhook_payload_object check (
    jsonb_typeof(payload_summary) = 'object'
  )
);

create trigger checkout_v2_webhook_events_immutable
before update or delete on public.checkout_v2_webhook_events
for each row execute function public.reject_financial_definition_mutation();

create or replace function public.protect_checkout_v2_record()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Checkout v2 financial records cannot be deleted' using errcode = '55000';
  end if;
  if current_setting('app.checkout_v2_mutation', true) is distinct from 'on' then
    raise exception 'Checkout v2 records are server-managed' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger protect_checkout_v2_selections
before update or delete on public.checkout_v2_selections
for each row execute function public.protect_checkout_v2_record();
create trigger protect_checkout_v2_attempts
before update or delete on public.checkout_v2_attempts
for each row execute function public.protect_checkout_v2_record();
create trigger protect_checkout_v2_liquidity
before update or delete on public.checkout_v2_liquidity_reservations
for each row execute function public.protect_checkout_v2_record();

create or replace function public.create_checkout_v2_selection(
  p_terms_snapshot_id uuid,
  p_policy_version text,
  p_client_id uuid,
  p_deduplication_key text
)
returns public.checkout_v2_selections
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_terms public.financial_terms_snapshots%rowtype;
  v_policy public.checkout_v2_policy_versions%rowtype;
  v_request public.bookings%rowtype;
  v_proposal public.missions%rowtype;
  v_request_workflow public.workflow_instances%rowtype;
  v_proposal_workflow public.workflow_instances%rowtype;
  v_selection_workflow public.workflow_instances%rowtype;
  v_selection public.checkout_v2_selections%rowtype;
  v_window_open timestamptz;
  v_deadline timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_selection from public.checkout_v2_selections
  where deduplication_key = p_deduplication_key;
  if found then
    if v_selection.client_id <> p_client_id
       or v_selection.terms_snapshot_id <> p_terms_snapshot_id then
      raise exception 'Selection operation identity belongs to another transaction'
        using errcode = '23505';
    end if;
    return v_selection;
  end if;
  if not coalesce((select enabled from public.financial_feature_flags
                   where flag_code = 'checkout_v2'), false) then
    raise exception 'Checkout v2 is disabled' using errcode = '55000';
  end if;
  select * into v_terms from public.financial_terms_snapshots
  where id = p_terms_snapshot_id;
  if not found or v_terms.financial_flow_version <> 'marketplace_v2' then
    raise exception 'Marketplace v2 financial terms are required' using errcode = '23514';
  end if;
  select * into v_policy from public.checkout_v2_policy_versions
  where version = p_policy_version;
  if not found or v_policy.currency <> v_terms.currency then
    raise exception 'Checkout v2 policy is missing or uses another currency' using errcode = '23514';
  end if;
  if v_terms.currency <> 'eur' then
    raise exception 'Checkout v2 launch supports EUR only' using errcode = '23514';
  end if;
  select * into v_request from public.bookings where id = v_terms.request_id for update;
  select * into v_proposal from public.missions where id = v_terms.proposal_id for update;
  if v_request.client_id is distinct from p_client_id
     or v_proposal.client_id is distinct from p_client_id
     or v_proposal.pro_id is null
     or v_proposal.booking_id is distinct from v_request.id
     or v_proposal.financial_flow_version <> 'marketplace_v2' then
    raise exception 'Financial terms do not match the request and proposal' using errcode = '23514';
  end if;
  if exists (select 1 from public.checkout_v2_awards where request_id = v_request.id) then
    raise exception 'Request is already awarded' using errcode = '23505';
  end if;
  select * into v_request_workflow from public.workflow_instances
  where machine_code = 'request_lifecycle' and machine_version = 'v1'
    and subject_type = 'request' and subject_id = v_request.id for update;
  select * into v_proposal_workflow from public.workflow_instances
  where machine_code = 'proposal_lifecycle' and machine_version = 'v1'
    and subject_type = 'proposal' and subject_id = v_proposal.id for update;
  if v_request_workflow.current_state <> 'open'
     or v_proposal_workflow.current_state <> 'active' then
    raise exception 'Request and proposal are not selectable' using errcode = '23514';
  end if;

  v_window_open := v_terms.scheduled_start_at
    - make_interval(secs => v_policy.payment_window_open_before_start_seconds::integer);
  v_deadline := least(
    v_window_open + make_interval(secs => v_policy.payment_deadline_seconds::integer),
    v_terms.scheduled_start_at
      - make_interval(secs => v_policy.checkout_expiry_margin_before_start_seconds::integer)
  );
  if v_deadline <= v_window_open then
    raise exception 'Configured payment window closes before it opens' using errcode = '23514';
  end if;

  v_selection_workflow := public.create_workflow_instance(
    'conditional_selection', 'v1', gen_random_uuid(), 'marketplace_v2',
    'client', p_client_id, 'Client selected the proposal conditionally.',
    jsonb_build_object('terms_snapshot_id', v_terms.id),
    p_deduplication_key || ':workflow'
  );

  insert into public.checkout_v2_selections (
    id, request_id, selected_proposal_id, terms_snapshot_id, client_id,
    provider_id, policy_version, request_workflow_instance_id,
    proposal_workflow_instance_id, selection_workflow_instance_id,
    payment_window_opens_at, payment_deadline_at, deduplication_key
  ) values (
    v_selection_workflow.subject_id, v_request.id, v_proposal.id, v_terms.id,
    p_client_id, v_proposal.pro_id, v_policy.version, v_request_workflow.id,
    v_proposal_workflow.id, v_selection_workflow.id, v_window_open, v_deadline,
    p_deduplication_key
  ) returning * into v_selection;

  perform public.transition_workflow_instance(
    v_request_workflow.id, v_request_workflow.revision, 'request_select',
    'client', p_client_id, 'Exclusive conditional selection created.',
    jsonb_build_object('selection_id', v_selection.id),
    p_deduplication_key || ':request_select'
  );
  perform public.transition_workflow_instance(
    v_proposal_workflow.id, v_proposal_workflow.revision, 'proposal_freeze',
    'system', null, 'Selected proposal frozen pending payment.',
    jsonb_build_object('selection_id', v_selection.id),
    p_deduplication_key || ':proposal_freeze'
  );
  v_selection_workflow := public.transition_workflow_instance(
    v_selection_workflow.id, v_selection_workflow.revision, 'selection_commit',
    'client', p_client_id, 'Exclusive conditional commitment created.',
    jsonb_build_object('payment_window_opens_at', v_window_open,
                       'payment_deadline_at', v_deadline),
    p_deduplication_key || ':selection_commit'
  );
  if now() >= v_window_open then
    perform public.transition_workflow_instance(
      v_selection_workflow.id, v_selection_workflow.revision,
      'selection_open_payment_window', 'system', null,
      'Configured payment window is open.', '{}'::jsonb,
      p_deduplication_key || ':payment_window'
    );
  end if;
  return v_selection;
end
$$;

create or replace function public.reserve_checkout_v2_attempt(
  p_selection_id uuid,
  p_client_id uuid
)
returns table (
  attempt_id uuid,
  attempt_status text,
  idempotency_key text,
  stripe_session_id text,
  stripe_session_url text,
  expires_at timestamptz,
  payment_method_configuration_reference text,
  currency text,
  amount_total_cents bigint,
  service_amount_cents bigint,
  travel_amount_cents bigint,
  platform_fee_amount_cents bigint,
  client_tax_amount_cents bigint,
  request_id uuid,
  proposal_id uuid,
  provider_id uuid,
  terms_snapshot_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_selection public.checkout_v2_selections%rowtype;
  v_terms public.financial_terms_snapshots%rowtype;
  v_policy public.checkout_v2_policy_versions%rowtype;
  v_selection_workflow public.workflow_instances%rowtype;
  v_attempt public.checkout_v2_attempts%rowtype;
  v_attempt_workflow public.workflow_instances%rowtype;
  v_expires_at timestamptz;
  v_exposure bigint;
  v_limit bigint;
  v_control_state text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if not coalesce((select enabled from public.financial_feature_flags
                   where flag_code = 'checkout_v2'), false) then
    raise exception 'Checkout v2 is disabled' using errcode = '55000';
  end if;
  -- This per-currency control row is also the serialization lock for exposure
  -- calculations across different requests.
  select control.state into v_control_state
  from public.financial_runtime_controls control
  where control.control_code = 'new_checkout_creation' and control.currency = 'eur'
  for update;
  if not found then
    raise exception 'Checkout runtime control is not configured' using errcode = 'P0002';
  end if;
  if v_control_state = 'blocked' then
    raise exception 'New Checkout creation is blocked by liquidity controls'
      using errcode = '55000';
  end if;
  select * into v_selection from public.checkout_v2_selections
  where id = p_selection_id for update;
  if not found or v_selection.lock_released_at is not null
     or v_selection.client_id <> p_client_id then
    raise exception 'Active client selection not found' using errcode = '42501';
  end if;
  select * into v_terms from public.financial_terms_snapshots
  where id = v_selection.terms_snapshot_id;
  select * into v_policy from public.checkout_v2_policy_versions
  where version = v_selection.policy_version;
  select * into v_selection_workflow from public.workflow_instances
  where id = v_selection.selection_workflow_instance_id for update;
  select attempt.* into v_attempt
  from public.checkout_v2_attempts attempt
  join public.workflow_instances workflow on workflow.id = attempt.workflow_instance_id
  where attempt.selection_id = v_selection.id
    and workflow.current_state in ('reserved', 'open')
  order by attempt.attempt_number desc
  limit 1
  for update of attempt;
  if found then
    select * into v_attempt_workflow from public.workflow_instances
    where id = v_attempt.workflow_instance_id;
    return query select v_attempt.id, v_attempt_workflow.current_state,
      v_attempt.idempotency_key, v_attempt.stripe_session_id,
      v_attempt.stripe_session_url, v_attempt.reserved_expires_at,
      v_attempt.payment_method_configuration_reference, v_attempt.currency,
      v_attempt.amount_total_cents, v_terms.service_amount_cents,
      v_terms.travel_amount_cents, v_terms.platform_fee_initial_amount_cents,
      v_terms.client_tax_initial_amount_cents, v_selection.request_id,
      v_selection.selected_proposal_id, v_selection.provider_id, v_terms.id;
    return;
  end if;
  if v_selection_workflow.current_state = 'committed_waiting_window'
     and now() >= v_selection.payment_window_opens_at then
    v_selection_workflow := public.transition_workflow_instance(
      v_selection_workflow.id, v_selection_workflow.revision,
      'selection_open_payment_window', 'system', null,
      'Configured payment window is open.', '{}'::jsonb,
      'checkout-v2:' || v_selection.id::text || ':payment_window'
    );
  end if;
  if v_selection_workflow.current_state <> 'payment_due'
     or now() < v_selection.payment_window_opens_at
     or now() >= v_selection.payment_deadline_at then
    raise exception 'Selection is outside its payable window' using errcode = '23514';
  end if;

  v_expires_at := least(
    now() + make_interval(secs => v_policy.checkout_ttl_seconds::integer),
    v_selection.payment_deadline_at,
    v_terms.scheduled_start_at
      - make_interval(secs => v_policy.checkout_expiry_margin_before_start_seconds::integer)
  );
  if v_expires_at < now() + interval '30 minutes' then
    raise exception 'Insufficient time remains for a Stripe Checkout session'
      using errcode = '23514';
  end if;

  select blocking_threshold_cents into v_limit
  from public.financial_limit_versions limits
  where limits.version = v_policy.liquidity_limit_version
    and limits.metric_code = 'checkout_liquidity_exposure'
    and limits.currency = v_terms.currency
    and limits.comparison_operator = 'above';
  if not found then
    raise exception 'Checkout liquidity exposure limit is not configured'
      using errcode = 'P0002';
  end if;
  select coalesce(sum(amount_cents), 0) into v_exposure
  from public.checkout_v2_liquidity_reservations reservation
  where reservation.status = 'active'
    and reservation.currency = v_terms.currency;
  if v_exposure + v_terms.client_total_amount_cents > v_limit then
    raise exception 'Checkout liquidity exposure limit reached' using errcode = '55000';
  end if;

  v_attempt := null;
  v_attempt.id := gen_random_uuid();
  v_attempt_workflow := public.create_workflow_instance(
    'checkout_attempt', 'v1', v_attempt.id, 'marketplace_v2', 'system', null,
    'Atomic Checkout v2 reservation created.',
    jsonb_build_object('selection_id', v_selection.id),
    'checkout-v2:' || v_selection.id::text || ':attempt:1:workflow'
  );
  insert into public.checkout_v2_attempts (
    id, selection_id, terms_snapshot_id, client_id, workflow_instance_id,
    attempt_number, idempotency_key, reserved_expires_at,
    payment_method_configuration_reference, currency, amount_total_cents
  ) values (
    v_attempt.id, v_selection.id, v_terms.id, p_client_id,
    v_attempt_workflow.id, 1,
    'checkout-v2:' || v_selection.id::text || ':1', v_expires_at,
    v_policy.stripe_payment_method_configuration_reference,
    v_terms.currency, v_terms.client_total_amount_cents
  ) returning * into v_attempt;
  insert into public.checkout_v2_liquidity_reservations (
    attempt_id, selection_id, limit_version, currency, amount_cents
  ) values (
    v_attempt.id, v_selection.id, v_policy.liquidity_limit_version,
    v_terms.currency, v_terms.client_total_amount_cents
  );

  return query select v_attempt.id, 'reserved'::text, v_attempt.idempotency_key,
    v_attempt.stripe_session_id, v_attempt.stripe_session_url, v_expires_at,
    v_attempt.payment_method_configuration_reference, v_attempt.currency,
    v_attempt.amount_total_cents, v_terms.service_amount_cents,
    v_terms.travel_amount_cents, v_terms.platform_fee_initial_amount_cents,
    v_terms.client_tax_initial_amount_cents, v_selection.request_id,
    v_selection.selected_proposal_id, v_selection.provider_id, v_terms.id;
end
$$;

create or replace function public.attach_checkout_v2_session(
  p_attempt_id uuid,
  p_stripe_session_id text,
  p_stripe_session_url text,
  p_stripe_expires_at timestamptz
)
returns public.checkout_v2_attempts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.checkout_v2_attempts%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_selection public.checkout_v2_selections%rowtype;
  v_selection_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_attempt from public.checkout_v2_attempts
  where id = p_attempt_id for update;
  if not found then raise exception 'Checkout v2 attempt not found' using errcode = 'P0002'; end if;
  if v_attempt.stripe_session_id is not null then
    if v_attempt.stripe_session_id <> p_stripe_session_id then
      raise exception 'Attempt is already attached to another Stripe session'
        using errcode = '23505';
    end if;
    return v_attempt;
  end if;
  if p_stripe_expires_at > v_attempt.reserved_expires_at
     or p_stripe_expires_at < now() + interval '29 minutes' then
    raise exception 'Stripe Checkout expiry does not match the reservation'
      using errcode = '23514';
  end if;
  select * into v_workflow from public.workflow_instances
  where id = v_attempt.workflow_instance_id for update;
  select * into v_selection from public.checkout_v2_selections
  where id = v_attempt.selection_id for update;
  select * into v_selection_workflow from public.workflow_instances
  where id = v_selection.selection_workflow_instance_id for update;
  if v_workflow.current_state <> 'reserved'
     or v_selection_workflow.current_state <> 'payment_due' then
    raise exception 'Checkout reservation is no longer attachable' using errcode = '23514';
  end if;
  perform set_config('app.checkout_v2_mutation', 'on', true);
  update public.checkout_v2_attempts set
    stripe_session_id = p_stripe_session_id,
    stripe_session_url = p_stripe_session_url,
    stripe_expires_at = p_stripe_expires_at,
    updated_at = clock_timestamp()
  where id = v_attempt.id returning * into v_attempt;
  perform set_config('app.checkout_v2_mutation', 'off', true);
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'checkout_attach_session',
    'system', null, 'Stripe Checkout session attached.',
    jsonb_build_object('stripe_session_id', p_stripe_session_id,
                       'expires_at', p_stripe_expires_at),
    'checkout-v2:' || v_attempt.id::text || ':attached'
  );
  perform public.transition_workflow_instance(
    v_selection_workflow.id, v_selection_workflow.revision,
    'selection_checkout_created', 'system', null,
    'Payable Checkout session holds the exclusive lock.',
    jsonb_build_object('attempt_id', v_attempt.id,
                       'stripe_session_id', p_stripe_session_id),
    'checkout-v2:' || v_attempt.id::text || ':selection_active'
  );
  return v_attempt;
end
$$;

create or replace function public.get_or_create_financial_ledger_account(
  p_account_code text,
  p_account_class text,
  p_owner_type text,
  p_owner_user_id uuid,
  p_currency text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  insert into public.financial_ledger_accounts (
    account_code, account_class, owner_type, owner_user_id, currency
  ) values (
    p_account_code, p_account_class, p_owner_type, p_owner_user_id, p_currency
  ) on conflict (account_code, owner_type, owner_user_id, currency)
    do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.financial_ledger_accounts
    where account_code = p_account_code and owner_type = p_owner_type
      and owner_user_id is not distinct from p_owner_user_id and currency = p_currency;
  end if;
  return v_id;
end
$$;

-- Signed webhook dispatcher. p_payment_status is never trusted from a browser;
-- this RPC is service-role only and is called after Stripe signature validation.
create or replace function public.process_checkout_v2_event(
  p_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz,
  p_livemode boolean,
  p_stripe_session_id text,
  p_payment_status text,
  p_stripe_payment_intent_id text,
  p_stripe_charge_id text,
  p_amount_total_cents bigint,
  p_currency text,
  p_payload_summary jsonb
)
returns table (payment_id uuid, duplicate boolean, outcome text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.checkout_v2_attempts%rowtype;
  v_selection public.checkout_v2_selections%rowtype;
  v_terms public.financial_terms_snapshots%rowtype;
  v_event public.checkout_v2_webhook_events%rowtype;
  v_payment public.checkout_v2_payments%rowtype;
  v_attempt_workflow public.workflow_instances%rowtype;
  v_selection_workflow public.workflow_instances%rowtype;
  v_request_workflow public.workflow_instances%rowtype;
  v_proposal_workflow public.workflow_instances%rowtype;
  v_other_workflow public.workflow_instances%rowtype;
  v_payment_workflow public.workflow_instances%rowtype;
  v_batch_id uuid;
  v_stripe_asset uuid;
  v_provider_held uuid;
  v_fee_held uuid;
  v_tax_held uuid;
  v_outcome text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_event from public.checkout_v2_webhook_events
  where event_id = p_event_id;
  if found then
    return query select v_event.payment_id, true, v_event.outcome;
    return;
  end if;
  select * into v_attempt from public.checkout_v2_attempts
  where stripe_session_id = p_stripe_session_id for update;
  if not found then raise exception 'Checkout v2 session not found' using errcode = 'P0002'; end if;
  -- A concurrent delivery can only become visible after the attempt lock is
  -- acquired. Recheck the event claim inside that serialization boundary.
  select * into v_event from public.checkout_v2_webhook_events
  where event_id = p_event_id;
  if found then
    return query select v_event.payment_id, true, v_event.outcome;
    return;
  end if;
  select * into v_selection from public.checkout_v2_selections
  where id = v_attempt.selection_id for update;
  select * into v_terms from public.financial_terms_snapshots
  where id = v_attempt.terms_snapshot_id;
  select * into v_attempt_workflow from public.workflow_instances
  where id = v_attempt.workflow_instance_id for update;
  select * into v_selection_workflow from public.workflow_instances
  where id = v_selection.selection_workflow_instance_id for update;

  if p_event_type = 'checkout.session.completed' and p_payment_status <> 'paid' then
    v_outcome := 'payment_pending';
    insert into public.checkout_v2_webhook_events values (
      p_event_id, p_event_type, p_stripe_created_at, p_stripe_session_id,
      p_livemode, false, v_outcome, null, coalesce(p_payload_summary, '{}'::jsonb), now()
    );
    return query select null::uuid, false, v_outcome;
    return;
  end if;

  if p_event_type in ('checkout.session.expired', 'checkout.session.async_payment_failed') then
    if v_attempt_workflow.current_state not in ('reserved', 'open')
       or v_selection_workflow.current_state not in ('payment_due', 'checkout_active') then
      v_outcome := 'already_resolved';
      insert into public.checkout_v2_webhook_events values (
        p_event_id, p_event_type, p_stripe_created_at, p_stripe_session_id,
        p_livemode, false, v_outcome, null, coalesce(p_payload_summary, '{}'::jsonb), now()
      );
      return query select null::uuid, false, v_outcome;
      return;
    end if;
    perform public.transition_workflow_instance(
      v_attempt_workflow.id, v_attempt_workflow.revision,
      case when p_event_type = 'checkout.session.expired'
        then case when v_attempt_workflow.current_state = 'open'
          then 'checkout_expire_open' else 'checkout_expire_reserved' end
        else case when v_attempt_workflow.current_state = 'open'
          then 'checkout_fail_open' else 'checkout_fail_reserved' end end,
      'system', null, 'Stripe reported Checkout ended without payment.',
      jsonb_build_object('stripe_event_id', p_event_id),
      'checkout-v2-event:' || p_event_id || ':attempt'
    );
    perform public.transition_workflow_instance(
      v_selection_workflow.id, v_selection_workflow.revision,
      case when v_selection_workflow.current_state = 'checkout_active'
        then 'selection_checkout_failed' else 'selection_payment_deadline_failed' end,
      'system', null, 'Conditional selection failed without payment.',
      jsonb_build_object('stripe_event_id', p_event_id),
      'checkout-v2-event:' || p_event_id || ':selection'
    );
    select * into v_request_workflow from public.workflow_instances
    where id = v_selection.request_workflow_instance_id for update;
    perform public.transition_workflow_instance(
      v_request_workflow.id, v_request_workflow.revision,
      'request_selection_released', 'system', null,
      'Unpaid selection released.', jsonb_build_object('stripe_event_id', p_event_id),
      'checkout-v2-event:' || p_event_id || ':request'
    );
    for v_other_workflow in
      select wi.* from public.workflow_instances wi
      join public.missions proposal on proposal.id = wi.subject_id
      where wi.machine_code = 'proposal_lifecycle' and wi.machine_version = 'v1'
        and wi.financial_flow_version = 'marketplace_v2'
        and proposal.booking_id = v_selection.request_id
        and wi.current_state in ('active', 'frozen')
      for update of wi
    loop
      perform public.transition_workflow_instance(
        v_other_workflow.id, v_other_workflow.revision,
        case when v_other_workflow.current_state = 'frozen'
          then 'proposal_reconfirm_after_failure_frozen'
          else 'proposal_reconfirm_after_failure_active' end,
        'system', null, 'Provider reconfirmation required after non-payment.',
        jsonb_build_object('selection_id', v_selection.id),
        'checkout-v2-event:' || p_event_id || ':proposal:' || v_other_workflow.subject_id::text
      );
    end loop;
    perform set_config('app.checkout_v2_mutation', 'on', true);
    update public.checkout_v2_liquidity_reservations set
      status = 'released', release_reason = case
        when p_event_type = 'checkout.session.expired' then 'checkout_expired'
        else 'payment_failed' end,
      resolved_at = clock_timestamp()
    where attempt_id = v_attempt.id and status = 'active';
    update public.checkout_v2_selections set
      lock_released_at = clock_timestamp(),
      lock_release_reason = case when p_event_type = 'checkout.session.expired'
        then 'checkout_expired' else 'payment_failed' end
    where id = v_selection.id;
    perform set_config('app.checkout_v2_mutation', 'off', true);
    v_outcome := case when p_event_type = 'checkout.session.expired'
      then 'checkout_expired' else 'payment_failed' end;
    insert into public.checkout_v2_webhook_events values (
      p_event_id, p_event_type, p_stripe_created_at, p_stripe_session_id,
      p_livemode, true, v_outcome, null, coalesce(p_payload_summary, '{}'::jsonb), now()
    );
    return query select null::uuid, false, v_outcome;
    return;
  end if;

  if p_event_type not in ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
     or p_payment_status <> 'paid' then
    raise exception 'Unsupported Checkout v2 event outcome' using errcode = '22023';
  end if;
  if p_stripe_payment_intent_id is null or p_stripe_charge_id is null
     or p_amount_total_cents is null
     or lower(p_currency) <> v_terms.currency
     or p_amount_total_cents <> v_terms.client_total_amount_cents
     or v_attempt.amount_total_cents <> v_terms.client_total_amount_cents then
    raise exception 'Stripe payment does not match the immutable financial snapshot'
      using errcode = '23514';
  end if;
  select * into v_payment from public.checkout_v2_payments
  where stripe_session_id = p_stripe_session_id
     or stripe_payment_intent_id = p_stripe_payment_intent_id;
  if found then
    v_outcome := 'already_resolved';
    insert into public.checkout_v2_webhook_events values (
      p_event_id, p_event_type, p_stripe_created_at, p_stripe_session_id,
      p_livemode, false, v_outcome, v_payment.id,
      coalesce(p_payload_summary, '{}'::jsonb), now()
    );
    return query select v_payment.id, false, v_outcome;
    return;
  end if;
  if v_attempt_workflow.current_state <> 'open'
     or v_selection_workflow.current_state <> 'checkout_active'
     or v_selection.lock_released_at is not null then
    raise exception 'Checkout v2 payment is incompatible with local workflow state'
      using errcode = '23514';
  end if;

  -- Proposal publication and payment attribution serialize on the same request
  -- row. The proposal-insert trigger takes this lock before checking the award.
  perform 1 from public.bookings
  where id = v_selection.request_id
  for update;

  v_payment.id := gen_random_uuid();
  v_payment_workflow := public.create_workflow_instance(
    'payment_lifecycle', 'v1', v_payment.id, 'marketplace_v2', 'system', null,
    'Payment awaits signed Stripe confirmation.',
    jsonb_build_object('stripe_session_id', p_stripe_session_id),
    'checkout-v2-payment:' || p_stripe_payment_intent_id || ':workflow'
  );
  insert into public.checkout_v2_payments (
    id, selection_id, attempt_id, request_id, proposal_id, terms_snapshot_id,
    client_id, provider_id, workflow_instance_id, currency, amount_total_cents,
    provider_gross_held_cents, platform_fee_held_cents, client_tax_held_cents,
    stripe_payment_intent_id, stripe_charge_id, stripe_session_id,
    stripe_event_id, livemode, paid_at
  ) values (
    v_payment.id, v_selection.id, v_attempt.id, v_selection.request_id,
    v_selection.selected_proposal_id, v_terms.id, v_selection.client_id,
    v_selection.provider_id, v_payment_workflow.id, v_terms.currency,
    v_terms.client_total_amount_cents, v_terms.provider_initial_gross_amount_cents,
    v_terms.platform_fee_initial_amount_cents, v_terms.client_tax_initial_amount_cents,
    p_stripe_payment_intent_id, p_stripe_charge_id, p_stripe_session_id,
    p_event_id, p_livemode, to_timestamp(extract(epoch from p_stripe_created_at))
  ) returning * into v_payment;
  insert into public.checkout_v2_awards (
    request_id, selection_id, proposal_id, payment_id, client_id, provider_id, awarded_at
  ) values (
    v_selection.request_id, v_selection.id, v_selection.selected_proposal_id,
    v_payment.id, v_selection.client_id, v_selection.provider_id, v_payment.paid_at
  );

  perform set_config('app.checkout_v2_mutation', 'on', true);
  update public.checkout_v2_attempts set
    stripe_payment_intent_id = p_stripe_payment_intent_id,
    stripe_charge_id = p_stripe_charge_id,
    updated_at = clock_timestamp()
  where id = v_attempt.id;
  update public.checkout_v2_liquidity_reservations set
    status = 'consumed', release_reason = 'payment_confirmed',
    resolved_at = clock_timestamp()
  where attempt_id = v_attempt.id and status = 'active';
  perform set_config('app.checkout_v2_mutation', 'off', true);

  perform public.transition_workflow_instance(
    v_attempt_workflow.id, v_attempt_workflow.revision, 'checkout_complete',
    'system', null, 'Signed Stripe webhook confirmed payment.',
    jsonb_build_object('stripe_event_id', p_event_id,
                       'stripe_payment_intent_id', p_stripe_payment_intent_id),
    'checkout-v2-event:' || p_event_id || ':attempt'
  );
  perform public.transition_workflow_instance(
    v_selection_workflow.id, v_selection_workflow.revision, 'selection_fulfilled',
    'system', null, 'Signed Stripe webhook fulfilled the selection.',
    jsonb_build_object('payment_id', v_payment.id),
    'checkout-v2-event:' || p_event_id || ':selection'
  );
  select * into v_request_workflow from public.workflow_instances
  where id = v_selection.request_workflow_instance_id for update;
  perform public.transition_workflow_instance(
    v_request_workflow.id, v_request_workflow.revision, 'request_payment_confirmed',
    'system', null, 'Signed Stripe webhook awarded the request.',
    jsonb_build_object('payment_id', v_payment.id,
                       'proposal_id', v_selection.selected_proposal_id),
    'checkout-v2-event:' || p_event_id || ':request'
  );
  select * into v_proposal_workflow from public.workflow_instances
  where id = v_selection.proposal_workflow_instance_id for update;
  perform public.transition_workflow_instance(
    v_proposal_workflow.id, v_proposal_workflow.revision, 'proposal_accept',
    'system', null, 'Signed Stripe webhook accepted the proposal.',
    jsonb_build_object('payment_id', v_payment.id),
    'checkout-v2-event:' || p_event_id || ':selected_proposal'
  );
  for v_other_workflow in
    select wi.* from public.workflow_instances wi
    join public.missions proposal on proposal.id = wi.subject_id
    where wi.machine_code = 'proposal_lifecycle' and wi.machine_version = 'v1'
      and wi.financial_flow_version = 'marketplace_v2'
      and proposal.booking_id = v_selection.request_id
      and wi.current_state = 'active'
      and wi.subject_id <> v_selection.selected_proposal_id
    for update of wi
  loop
    perform public.transition_workflow_instance(
      v_other_workflow.id, v_other_workflow.revision, 'proposal_not_selected',
      'system', null, 'Another proposal was paid.',
      jsonb_build_object('payment_id', v_payment.id,
                         'selected_proposal_id', v_selection.selected_proposal_id),
      'checkout-v2-event:' || p_event_id || ':not_selected:' || v_other_workflow.subject_id::text
    );
    perform public.enqueue_notification(
      (select pro_id from public.missions where id = v_other_workflow.subject_id),
      'proposal_not_selected', 'Proposition non retenue',
      'Le client a confirmé une autre proposition pour cette demande.',
      'checkout_v2_awards', v_selection.request_id::text, 'booking',
      v_selection.request_id,
      jsonb_build_object('request_id', v_selection.request_id,
                         'proposal_id', v_other_workflow.subject_id,
                         'path', '/prodashboard/missions'),
      'checkout-v2-event:' || p_event_id || ':notification:'
        || v_other_workflow.subject_id::text
    );
  end loop;
  perform public.transition_workflow_instance(
    v_payment_workflow.id, v_payment_workflow.revision, 'payment_confirm_paid',
    'system', null, 'Signed Stripe webhook confirmed platform payment.',
    jsonb_build_object('stripe_event_id', p_event_id),
    'checkout-v2-event:' || p_event_id || ':payment'
  );

  v_stripe_asset := public.get_or_create_financial_ledger_account(
    'stripe_platform_balance', 'asset', 'stripe', null, v_terms.currency);
  v_provider_held := public.get_or_create_financial_ledger_account(
    'provider_gross_held', 'liability', 'provider', v_selection.provider_id, v_terms.currency);
  v_fee_held := public.get_or_create_financial_ledger_account(
    'platform_fee_held', 'liability', 'platform', null, v_terms.currency);
  if v_terms.client_tax_initial_amount_cents > 0 then
    v_tax_held := public.get_or_create_financial_ledger_account(
      'client_tax_held', 'liability', 'platform', null, v_terms.currency);
  end if;
  insert into public.financial_ledger_batches (
    financial_flow_version, operation_type, operation_key, currency,
    external_reference_type, external_reference_id, actor_type, reason
  ) values (
    'marketplace_v2', 'checkout_payment_received',
    'checkout-v2-payment:' || p_stripe_payment_intent_id, v_terms.currency,
    'stripe_payment_intent', p_stripe_payment_intent_id, 'stripe_webhook',
    'Platform charge received; provider funds remain held with no transfer.'
  ) returning id into v_batch_id;
  insert into public.financial_ledger_entries (
    batch_id, line_number, account_id, direction, amount_cents, memo
  ) values
    (v_batch_id, 1, v_stripe_asset, 'debit', v_terms.client_total_amount_cents,
     'Gross Stripe platform balance receivable.'),
    (v_batch_id, 2, v_provider_held, 'credit', v_terms.provider_initial_gross_amount_cents,
     'Provider gross amount held pending release decision.'),
    (v_batch_id, 3, v_fee_held, 'credit', v_terms.platform_fee_initial_amount_cents,
     'Initial Glossed fee held pending final allocation.');
  if v_terms.client_tax_initial_amount_cents > 0 then
    insert into public.financial_ledger_entries (
      batch_id, line_number, account_id, direction, amount_cents, memo
    ) values (
      v_batch_id, 4, v_tax_held, 'credit', v_terms.client_tax_initial_amount_cents,
      'Client tax amount held pending jurisdictional allocation.'
    );
  end if;
  perform public.post_financial_ledger_batch(v_batch_id);
  insert into public.financial_audit_log (
    financial_flow_version, event_type, entity_type, entity_id, actor_type,
    reason, after_state, evidence, deduplication_key
  ) values (
    'marketplace_v2', 'checkout.payment_confirmed', 'checkout_v2_payment',
    v_payment.id::text, 'stripe_webhook',
    'Signed Stripe webhook confirmed the platform charge.',
    jsonb_build_object('payment_id', v_payment.id, 'request_id', v_selection.request_id,
                       'proposal_id', v_selection.selected_proposal_id,
                       'amount_total_cents', v_terms.client_total_amount_cents,
                       'currency', v_terms.currency),
    jsonb_build_object('stripe_event_id', p_event_id,
                       'stripe_session_id', p_stripe_session_id,
                       'stripe_payment_intent_id', p_stripe_payment_intent_id,
                       'stripe_charge_id', p_stripe_charge_id,
                       'ledger_batch_id', v_batch_id),
    'checkout-v2-event:' || p_event_id || ':audit'
  );
  v_outcome := 'payment_confirmed';
  insert into public.checkout_v2_webhook_events values (
    p_event_id, p_event_type, p_stripe_created_at, p_stripe_session_id,
    p_livemode, true, v_outcome, v_payment.id,
    coalesce(p_payload_summary, '{}'::jsonb), now()
  );
  return query select v_payment.id, false, v_outcome;
end
$$;

alter table public.financial_feature_flags enable row level security;
alter table public.financial_feature_flag_events enable row level security;
alter table public.checkout_v2_policy_versions enable row level security;
alter table public.checkout_v2_selections enable row level security;
alter table public.checkout_v2_attempts enable row level security;
alter table public.checkout_v2_liquidity_reservations enable row level security;
alter table public.checkout_v2_payments enable row level security;
alter table public.checkout_v2_awards enable row level security;
alter table public.checkout_v2_webhook_events enable row level security;

revoke all on public.financial_feature_flags from public, anon, authenticated;
revoke all on public.financial_feature_flag_events from public, anon, authenticated;
revoke all on public.checkout_v2_policy_versions from public, anon, authenticated;
revoke all on public.checkout_v2_selections from public, anon, authenticated;
revoke all on public.checkout_v2_attempts from public, anon, authenticated;
revoke all on public.checkout_v2_liquidity_reservations from public, anon, authenticated;
revoke all on public.checkout_v2_payments from public, anon, authenticated;
revoke all on public.checkout_v2_awards from public, anon, authenticated;
revoke all on public.checkout_v2_webhook_events from public, anon, authenticated;
revoke all on sequence public.financial_feature_flag_events_id_seq
from public, anon, authenticated;

grant all on public.financial_feature_flags to service_role;
grant all on public.financial_feature_flag_events to service_role;
grant all on public.checkout_v2_policy_versions to service_role;
grant all on public.checkout_v2_selections to service_role;
grant all on public.checkout_v2_attempts to service_role;
grant all on public.checkout_v2_liquidity_reservations to service_role;
grant all on public.checkout_v2_payments to service_role;
grant all on public.checkout_v2_awards to service_role;
grant all on public.checkout_v2_webhook_events to service_role;
grant usage, select on sequence public.financial_feature_flag_events_id_seq
to service_role;

revoke all on function public.create_checkout_v2_selection(uuid, text, uuid, text)
from public, anon, authenticated;
grant execute on function public.create_checkout_v2_selection(uuid, text, uuid, text)
to service_role;
revoke all on function public.reserve_checkout_v2_attempt(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.reserve_checkout_v2_attempt(uuid, uuid)
to service_role;
revoke all on function public.attach_checkout_v2_session(uuid, text, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.attach_checkout_v2_session(uuid, text, text, timestamptz)
to service_role;
revoke all on function public.get_or_create_financial_ledger_account(text, text, text, uuid, text)
from public, anon, authenticated;
grant execute on function public.get_or_create_financial_ledger_account(text, text, text, uuid, text)
to service_role;
revoke all on function public.process_checkout_v2_event(
  text, text, timestamptz, boolean, text, text, text, text, bigint, text, jsonb
) from public, anon, authenticated;
grant execute on function public.process_checkout_v2_event(
  text, text, timestamptz, boolean, text, text, text, text, bigint, text, jsonb
) to service_role;

commit;
