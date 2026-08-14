-- Cancellations, service disputes, refunds, payment disputes and transfer
-- reversals for marketplace_v2.
--
-- This tranche is additive and disabled by default. legacy_v1 remains active.

begin;

insert into public.financial_feature_flags (flag_code, enabled, reason)
values (
  'financial_remediation_v2', false,
  'Disabled by default. V2 cancellations, disputes, refunds and reversals require an explicit controlled rollout.'
);

insert into public.workflow_transitions (
  transition_code, machine_code, machine_version, from_state, to_state,
  allowed_actor_types, condition_codes, financial_effect_code,
  audit_event_type, description
) values
  ('release_reserve_after_resolution', 'fund_release', 'v1', 'blocked',
   'release_reserved', array['system'],
   array['explicit_financial_resolution', 'complete_allocation'],
   'reserve_provider_allocation', 'release.reserved',
   'An agreed or automatic cancellation allocation explicitly releases the awarded provider share.'),
  ('transfer_reauthorize_after_resolution', 'provider_transfer', 'v1', 'blocked',
   'ready', array['system'],
   array['financial_resolution_recorded', 'remaining_transfer_positive'], null,
   'transfer.ready', 'A final allocation reauthorizes the remaining provider transfer.'),
  ('refund_succeed_from_authorized', 'refund', 'v1', 'authorized',
   'succeeded', array['system'], array['stripe_refund_confirmed'],
   'post_refund', 'refund.succeeded',
   'Stripe confirms a refund that required no provider recovery.'),
  ('payment_dispute_won_from_open', 'payment_dispute', 'v1', 'open',
   'won', array['system'], array['signed_stripe_webhook'],
   'record_dispute_victory', 'payment_dispute.won',
   'Stripe may resolve a dispute before local evidence collection advances.'),
  ('payment_dispute_won_from_recovery', 'payment_dispute', 'v1', 'provisional_recovery',
   'won', array['system'], array['signed_stripe_webhook'],
   'record_dispute_victory', 'payment_dispute.won',
   'Stripe reports a win after provisional recovery.'),
  ('payment_dispute_won_from_evidence', 'payment_dispute', 'v1', 'evidence_collection',
   'won', array['system'], array['signed_stripe_webhook'],
   'record_dispute_victory', 'payment_dispute.won',
   'Stripe reports a win during evidence collection.'),
  ('payment_dispute_lost_from_open', 'payment_dispute', 'v1', 'open',
   'lost', array['system'], array['signed_stripe_webhook'],
   'record_dispute_loss', 'payment_dispute.lost',
   'Stripe may resolve a dispute before local evidence collection advances.'),
  ('payment_dispute_lost_from_recovery', 'payment_dispute', 'v1', 'provisional_recovery',
   'lost', array['system'], array['signed_stripe_webhook'],
   'record_dispute_loss', 'payment_dispute.lost',
   'Stripe reports a loss after provisional recovery.'),
  ('payment_dispute_lost_from_evidence', 'payment_dispute', 'v1', 'evidence_collection',
   'lost', array['system'], array['signed_stripe_webhook'],
   'record_dispute_loss', 'payment_dispute.lost',
   'Stripe reports a loss during evidence collection.');

alter table public.fund_releases_v2 drop constraint fund_release_v2_release_consistent;
alter table public.fund_releases_v2
  add column cancelled_at timestamptz,
  drop constraint fund_releases_v2_release_trigger_check;
alter table public.fund_releases_v2
  add constraint fund_releases_v2_release_trigger_check check (
    release_trigger in ('client_confirmation', 'provider_timeout_48h', 'financial_resolution')
  ),
  add constraint fund_release_v2_release_consistent check (
    (released_at is null and cancelled_at is null and allocation_snapshot_id is null
      and ledger_batch_id is null and release_trigger is null)
    or (released_at is not null and cancelled_at is null and allocation_snapshot_id is not null
      and ledger_batch_id is not null and release_trigger is not null)
    or (released_at is null and cancelled_at is not null and allocation_snapshot_id is not null
      and ledger_batch_id is not null and release_trigger = 'financial_resolution')
  ),
  add constraint fund_release_v2_outcome_exclusive check (
    released_at is null or cancelled_at is null
  );

create table public.financial_security_policy_versions (
  version text primary key,
  admin_mfa_max_age_seconds integer not null
    check (admin_mfa_max_age_seconds between 60 and 3600),
  effective_from timestamptz not null,
  effective_until timestamptz,
  notes text not null check (length(trim(notes)) between 1 and 4000),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint financial_security_policy_version_format check (
    version ~ '^[a-z][a-z0-9_.-]{2,99}$'
  ),
  constraint financial_security_policy_period check (
    effective_until is null or effective_until > effective_from
  )
);

insert into public.financial_security_policy_versions (
  version, admin_mfa_max_age_seconds, effective_from, notes
) values (
  'financial_admin_mfa_v1', 300, '2026-01-01 00:00:00+00',
  'Versioned five-minute reauthentication window for manual financial actions. No browser grant is provided.'
);

create table public.cancellation_cases_v2 (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique
    references public.checkout_v2_payments(id) on delete restrict,
  workflow_instance_id uuid not null unique
    references public.workflow_instances(id) on delete restrict,
  cancellation_type text not null check (cancellation_type in (
    'legal_withdrawal', 'commercial_client', 'provider_cancellation',
    'mutual_cancellation'
  )),
  requested_by_actor_type text not null check (
    requested_by_actor_type in ('client', 'provider', 'system')
  ),
  requested_by uuid references auth.users(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 1 and 4000),
  jurisdiction_policy_version text,
  response_due_at timestamptz,
  financial_resolution_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cancellation_v2_actor_consistent check (
    (requested_by_actor_type = 'system' and requested_by is null)
    or (requested_by_actor_type in ('client', 'provider') and requested_by is not null)
  ),
  constraint cancellation_v2_legal_policy_required check (
    cancellation_type <> 'legal_withdrawal'
    or jurisdiction_policy_version is not null
  )
);

create table public.cancellation_allocation_proposals_v2 (
  id uuid primary key default gen_random_uuid(),
  cancellation_id uuid not null
    references public.cancellation_cases_v2(id) on delete restrict,
  revision integer not null check (revision > 0),
  proposer_actor_type text not null check (proposer_actor_type in ('client', 'provider', 'system')),
  proposer_user_id uuid references auth.users(id) on delete restrict,
  provider_awarded_gross_amount_cents bigint not null check (provider_awarded_gross_amount_cents >= 0),
  provider_statutory_withholding_amount_cents bigint not null default 0
    check (provider_statutory_withholding_amount_cents >= 0),
  client_tax_allocated_amount_cents bigint not null default 0
    check (client_tax_allocated_amount_cents >= 0),
  platform_fee_final_amount_cents bigint not null check (platform_fee_final_amount_cents >= 0),
  client_refund_amount_cents bigint not null check (client_refund_amount_cents >= 0),
  reason text not null check (length(trim(reason)) between 1 and 4000),
  accepted_by_actor_type text check (accepted_by_actor_type in ('client', 'provider', 'system')),
  accepted_by uuid references auth.users(id) on delete restrict,
  accepted_at timestamptz,
  deduplication_key text not null unique,
  created_at timestamptz not null default now(),
  unique (cancellation_id, revision),
  constraint cancellation_allocation_proposer_consistent check (
    (proposer_actor_type = 'system' and proposer_user_id is null)
    or (proposer_actor_type in ('client', 'provider') and proposer_user_id is not null)
  ),
  constraint cancellation_allocation_acceptance_consistent check (
    (accepted_at is null and accepted_by_actor_type is null and accepted_by is null)
    or (accepted_at is not null and accepted_by_actor_type is not null
      and ((accepted_by_actor_type = 'system' and accepted_by is null)
        or (accepted_by_actor_type in ('client', 'provider') and accepted_by is not null)))
  )
);

create table public.service_disputes_v2 (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique
    references public.checkout_v2_payments(id) on delete restrict,
  cancellation_id uuid references public.cancellation_cases_v2(id) on delete restrict,
  workflow_instance_id uuid not null unique
    references public.workflow_instances(id) on delete restrict,
  opened_by_actor_type text not null check (opened_by_actor_type in ('client', 'provider', 'system')),
  opened_by uuid references auth.users(id) on delete restrict,
  issue_code text not null check (length(trim(issue_code)) between 1 and 100),
  reason text not null check (length(trim(reason)) between 1 and 4000),
  evidence_due_at timestamptz,
  decision_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_dispute_v2_actor_consistent check (
    (opened_by_actor_type = 'system' and opened_by is null)
    or (opened_by_actor_type in ('client', 'provider') and opened_by is not null)
  )
);

create table public.service_dispute_evidence_v2 (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.service_disputes_v2(id) on delete restrict,
  submitted_by_actor_type text not null check (submitted_by_actor_type in ('client', 'provider', 'admin')),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  statement text not null check (length(trim(statement)) between 1 and 10000),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  deduplication_key text not null unique,
  created_at timestamptz not null default now()
);

create table public.financial_resolutions_v2 (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.checkout_v2_payments(id) on delete restrict,
  source_type text not null check (source_type in (
    'cancellation', 'service_dispute', 'payment_dispute'
  )),
  source_id uuid not null,
  cancellation_id uuid,
  service_dispute_id uuid,
  payment_dispute_id uuid,
  allocation_snapshot_id uuid not null unique
    references public.financial_allocation_snapshots(id) on delete restrict,
  provider_awarded_gross_amount_cents bigint not null check (provider_awarded_gross_amount_cents >= 0),
  provider_statutory_withholding_amount_cents bigint not null default 0
    check (provider_statutory_withholding_amount_cents >= 0),
  provider_transfer_amount_cents bigint not null check (provider_transfer_amount_cents >= 0),
  platform_fee_final_amount_cents bigint not null check (platform_fee_final_amount_cents >= 0),
  client_tax_allocated_amount_cents bigint not null default 0
    check (client_tax_allocated_amount_cents >= 0),
  client_refund_amount_cents bigint not null check (client_refund_amount_cents >= 0),
  provider_recovery_target_amount_cents bigint not null default 0
    check (provider_recovery_target_amount_cents >= 0),
  status text not null check (status in (
    'reserved', 'recovery_pending', 'refund_pending', 'completed', 'manual_review'
  )),
  decision_reason text not null check (length(trim(decision_reason)) between 1 and 4000),
  decided_by_actor_type text not null check (decided_by_actor_type in ('system', 'admin')),
  decided_by uuid references auth.users(id) on delete restrict,
  mfa_authenticated_at timestamptz,
  security_policy_version text
    references public.financial_security_policy_versions(version) on delete restrict,
  ledger_batch_id uuid not null unique references public.financial_ledger_batches(id) on delete restrict,
  deduplication_key text not null unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (source_type, source_id),
  constraint financial_resolution_v2_actor_consistent check (
    (decided_by_actor_type = 'system' and decided_by is null
      and mfa_authenticated_at is null and security_policy_version is null)
    or (decided_by_actor_type = 'admin' and decided_by is not null
      and mfa_authenticated_at is not null and security_policy_version is not null)
  ),
  constraint financial_resolution_v2_provider_allocation check (
    provider_transfer_amount_cents + provider_statutory_withholding_amount_cents
      = provider_awarded_gross_amount_cents
  )
);

alter table public.cancellation_cases_v2
  add constraint cancellation_v2_resolution_fkey foreign key (financial_resolution_id)
  references public.financial_resolutions_v2(id) on delete restrict;

create table public.service_dispute_decisions_v2 (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null unique references public.service_disputes_v2(id) on delete restrict,
  resolution_id uuid not null unique references public.financial_resolutions_v2(id) on delete restrict,
  administrator_id uuid not null references public.app_admins(user_id) on delete restrict,
  reason text not null check (length(trim(reason)) between 1 and 4000),
  evidence_manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_manifest) = 'object'),
  mfa_authenticated_at timestamptz not null,
  security_policy_version text not null
    references public.financial_security_policy_versions(version) on delete restrict,
  deduplication_key text not null unique,
  decided_at timestamptz not null default now()
);

alter table public.service_disputes_v2
  add constraint service_dispute_v2_decision_fkey foreign key (decision_id)
  references public.service_dispute_decisions_v2(id) on delete restrict;

create table public.refunds_v2 (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.checkout_v2_payments(id) on delete restrict,
  resolution_id uuid not null unique references public.financial_resolutions_v2(id) on delete restrict,
  workflow_instance_id uuid not null unique references public.workflow_instances(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  stripe_payment_intent_id text not null,
  idempotency_key text not null unique,
  stripe_refund_id text unique,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  submitted_at timestamptz,
  succeeded_at timestamptz,
  ledger_batch_id uuid unique references public.financial_ledger_batches(id) on delete restrict,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_disputes_v2 (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.checkout_v2_payments(id) on delete restrict,
  workflow_instance_id uuid not null unique references public.workflow_instances(id) on delete restrict,
  stripe_dispute_id text not null unique,
  stripe_charge_id text not null,
  amount_debited_cents bigint not null check (amount_debited_cents > 0),
  stripe_dispute_fee_amount_cents bigint check (stripe_dispute_fee_amount_cents is null or stripe_dispute_fee_amount_cents >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  stripe_status text not null,
  reason_code text,
  risk_details jsonb not null default '{}'::jsonb check (jsonb_typeof(risk_details) = 'object'),
  provisional_recovery_target_amount_cents bigint not null default 0
    check (provisional_recovery_target_amount_cents >= 0),
  provisional_recovered_amount_cents bigint not null default 0
    check (provisional_recovered_amount_cents >= 0),
  definitive_provider_liability_amount_cents bigint not null default 0
    check (definitive_provider_liability_amount_cents >= 0),
  platform_final_loss_amount_cents bigint not null default 0
    check (platform_final_loss_amount_cents >= 0),
  provider_retransferred_amount_cents bigint not null default 0
    check (provider_retransferred_amount_cents >= 0),
  recovery_deficit_amount_cents bigint not null default 0
    check (recovery_deficit_amount_cents >= 0),
  opened_ledger_batch_id uuid unique references public.financial_ledger_batches(id) on delete restrict,
  won_ledger_batch_id uuid unique references public.financial_ledger_batches(id) on delete restrict,
  opened_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_dispute_v2_recovery_cap check (
    provisional_recovered_amount_cents <= provisional_recovery_target_amount_cents
  )
);

alter table public.financial_resolutions_v2
  add constraint financial_resolution_v2_cancellation_fkey
    foreign key (cancellation_id) references public.cancellation_cases_v2(id) on delete restrict,
  add constraint financial_resolution_v2_service_dispute_fkey
    foreign key (service_dispute_id) references public.service_disputes_v2(id) on delete restrict,
  add constraint financial_resolution_v2_payment_dispute_fkey
    foreign key (payment_dispute_id) references public.payment_disputes_v2(id) on delete restrict,
  add constraint financial_resolution_v2_source_fkey_consistent check (
    (source_type = 'cancellation' and cancellation_id = source_id
      and service_dispute_id is null and payment_dispute_id is null)
    or (source_type = 'service_dispute' and service_dispute_id = source_id
      and cancellation_id is null and payment_dispute_id is null)
    or (source_type = 'payment_dispute' and payment_dispute_id = source_id
      and cancellation_id is null and service_dispute_id is null)
  );

create table public.transfer_reversals_v2 (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.checkout_v2_payments(id) on delete restrict,
  provider_transfer_id uuid not null references public.provider_transfers_v2(id) on delete restrict,
  resolution_id uuid references public.financial_resolutions_v2(id) on delete restrict,
  payment_dispute_id uuid references public.payment_disputes_v2(id) on delete restrict,
  workflow_instance_id uuid not null unique references public.workflow_instances(id) on delete restrict,
  recovery_type text not null check (recovery_type in ('final_refund', 'provisional_chargeback')),
  requested_amount_cents bigint not null check (requested_amount_cents > 0),
  recovered_amount_cents bigint not null default 0 check (recovered_amount_cents >= 0),
  recovery_deficit_amount_cents bigint not null default 0 check (recovery_deficit_amount_cents >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  stripe_transfer_id text not null,
  idempotency_key text not null unique,
  stripe_reversal_id text unique,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  submitted_at timestamptz,
  completed_at timestamptz,
  ledger_batch_id uuid unique references public.financial_ledger_batches(id) on delete restrict,
  retransfer_idempotency_key text unique,
  stripe_retransfer_id text unique,
  retransfer_ledger_batch_id uuid unique references public.financial_ledger_batches(id) on delete restrict,
  retransferred_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfer_reversal_v2_source_exactly_one check (
    (resolution_id is not null)::integer + (payment_dispute_id is not null)::integer = 1
  ),
  constraint transfer_reversal_v2_recovery_consistent check (
    recovered_amount_cents <= requested_amount_cents
    and recovery_deficit_amount_cents = requested_amount_cents - recovered_amount_cents
  )
);

create unique index transfer_reversals_v2_resolution_uidx
  on public.transfer_reversals_v2(resolution_id) where resolution_id is not null;
create unique index transfer_reversals_v2_dispute_uidx
  on public.transfer_reversals_v2(payment_dispute_id) where payment_dispute_id is not null;

create table public.financial_recovery_deficits_v2 (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.checkout_v2_payments(id) on delete restrict,
  transfer_reversal_id uuid not null unique references public.transfer_reversals_v2(id) on delete restrict,
  deficit_type text not null check (deficit_type in ('final_refund', 'provisional_chargeback')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  future_earnings_offset_enabled boolean not null default false
    check (future_earnings_offset_enabled = false),
  status text not null default 'admin_review' check (status = 'admin_review'),
  reason text not null check (length(trim(reason)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.financial_remediation_attempts_v2 (
  id bigint generated always as identity primary key,
  operation_type text not null check (operation_type in ('refund', 'transfer_reversal', 'provider_retransfer')),
  operation_id uuid not null,
  refund_id uuid references public.refunds_v2(id) on delete restrict,
  transfer_reversal_id uuid references public.transfer_reversals_v2(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  outcome text not null check (outcome in ('succeeded', 'pending', 'retryable_failure', 'manual_review')),
  stripe_object_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (operation_type, operation_id, attempt_number),
  constraint financial_remediation_attempt_v2_source_consistent check (
    (operation_type = 'refund' and refund_id = operation_id
      and transfer_reversal_id is null)
    or (operation_type in ('transfer_reversal', 'provider_retransfer')
      and transfer_reversal_id = operation_id and refund_id is null)
  )
);

create table public.stripe_financial_v2_webhook_events (
  event_id text primary key,
  event_type text not null,
  stripe_created_at timestamptz not null,
  stripe_object_id text not null,
  payment_id uuid references public.checkout_v2_payments(id) on delete restrict,
  applied boolean not null,
  outcome text not null,
  payload_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_summary) = 'object'),
  processed_at timestamptz not null default now()
);

create or replace function public.protect_financial_remediation_v2_record()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Financial remediation v2 records cannot be deleted' using errcode = '55000';
  end if;
  if current_setting('app.financial_remediation_v2_mutation', true) is distinct from 'on' then
    raise exception 'Financial remediation v2 records are server-managed' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger protect_cancellation_cases_v2 before update or delete on public.cancellation_cases_v2
for each row execute function public.protect_financial_remediation_v2_record();
create trigger protect_cancellation_allocations_v2 before update or delete on public.cancellation_allocation_proposals_v2
for each row execute function public.protect_financial_remediation_v2_record();
create trigger protect_service_disputes_v2 before update or delete on public.service_disputes_v2
for each row execute function public.protect_financial_remediation_v2_record();
create trigger protect_financial_resolutions_v2 before update or delete on public.financial_resolutions_v2
for each row execute function public.protect_financial_remediation_v2_record();
create trigger protect_refunds_v2 before update or delete on public.refunds_v2
for each row execute function public.protect_financial_remediation_v2_record();
create trigger protect_payment_disputes_v2 before update or delete on public.payment_disputes_v2
for each row execute function public.protect_financial_remediation_v2_record();
create trigger protect_transfer_reversals_v2 before update or delete on public.transfer_reversals_v2
for each row execute function public.protect_financial_remediation_v2_record();

create trigger financial_security_policies_immutable before update or delete on public.financial_security_policy_versions
for each row execute function public.reject_financial_definition_mutation();
create trigger service_dispute_evidence_v2_immutable before update or delete on public.service_dispute_evidence_v2
for each row execute function public.reject_financial_definition_mutation();
create trigger service_dispute_decisions_v2_immutable before update or delete on public.service_dispute_decisions_v2
for each row execute function public.reject_financial_definition_mutation();
create trigger financial_recovery_deficits_v2_immutable before update or delete on public.financial_recovery_deficits_v2
for each row execute function public.reject_financial_definition_mutation();
create trigger financial_remediation_attempts_v2_immutable before update or delete on public.financial_remediation_attempts_v2
for each row execute function public.reject_financial_definition_mutation();
create trigger stripe_financial_v2_webhook_events_immutable before update or delete on public.stripe_financial_v2_webhook_events
for each row execute function public.reject_financial_definition_mutation();

create or replace function public.require_financial_remediation_v2_enabled()
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if not coalesce((select enabled from public.financial_feature_flags
                   where flag_code = 'financial_remediation_v2'), false) then
    raise exception 'Financial remediation v2 is disabled' using errcode = '55000';
  end if;
end
$$;

create or replace function public.assert_recent_financial_admin_mfa_v2(
  p_admin_id uuid,
  p_mfa_authenticated_at timestamptz,
  p_security_policy_version text
)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_policy public.financial_security_policy_versions%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.app_admins where user_id = p_admin_id) then
    raise exception 'Financial administrator permission required' using errcode = '42501';
  end if;
  select * into v_policy from public.financial_security_policy_versions
  where version = p_security_policy_version
    and effective_from <= clock_timestamp()
    and (effective_until is null or effective_until > clock_timestamp());
  if not found or p_mfa_authenticated_at is null
     or p_mfa_authenticated_at > clock_timestamp() + interval '5 seconds'
     or p_mfa_authenticated_at < clock_timestamp()
       - make_interval(secs => v_policy.admin_mfa_max_age_seconds) then
    raise exception 'Recent MFA authentication required' using errcode = '42501';
  end if;
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
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hold public.checkout_v2_financial_holds%rowtype;
  v_release public.fund_releases_v2%rowtype;
  v_release_workflow public.workflow_instances%rowtype;
  v_transfer public.provider_transfers_v2%rowtype;
  v_transfer_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_hold_type not in ('service_dispute', 'refund', 'payment_dispute', 'payment_issue', 'compliance', 'manual')
     or p_actor_type not in ('client', 'provider', 'system', 'admin')
     or (p_actor_type = 'system' and p_actor_user_id is not null)
     or (p_actor_type <> 'system' and p_actor_user_id is null) then
    raise exception 'Invalid financial hold input' using errcode = '22023';
  end if;
  select * into v_release from public.fund_releases_v2
  where payment_id = p_payment_id for update;
  if not found then raise exception 'Fund release not found' using errcode = 'P0002'; end if;
  select * into v_hold from public.checkout_v2_financial_holds
  where payment_id = p_payment_id and hold_type = p_hold_type
    and source_reference = p_source_reference and released_at is null;
  if found then return v_hold; end if;

  insert into public.checkout_v2_financial_holds (
    payment_id, hold_type, source_reference, reason, opened_by_actor_type, opened_by
  ) values (
    p_payment_id, p_hold_type, p_source_reference, p_reason, p_actor_type, p_actor_user_id
  ) returning * into v_hold;
  insert into public.checkout_v2_financial_hold_events (
    hold_id, payment_id, event_type, actor_type, actor_user_id, reason, deduplication_key
  ) values (
    v_hold.id, p_payment_id, 'opened', p_actor_type, p_actor_user_id,
    p_reason, p_deduplication_key
  );

  select * into v_release_workflow from public.workflow_instances
  where id = v_release.workflow_instance_id for update;
  if v_release_workflow.current_state in ('held', 'eligible') then
    perform public.transition_workflow_instance(
      v_release_workflow.id, v_release_workflow.revision,
      case when v_release_workflow.current_state = 'held'
        then 'release_block_held' else 'release_block_eligible' end,
      'system', null, 'Financial hold blocks provider release.',
      jsonb_build_object('hold_id', v_hold.id, 'hold_type', p_hold_type),
      p_deduplication_key || ':release_block'
    );
  end if;

  select * into v_transfer from public.provider_transfers_v2
  where payment_id = p_payment_id for update;
  if found and v_transfer.succeeded_at is null then
    select * into v_transfer_workflow from public.workflow_instances
    where id = v_transfer.workflow_instance_id for update;
    if v_transfer_workflow.current_state in ('not_eligible', 'ready', 'reserved') then
      perform public.transition_workflow_instance(
        v_transfer_workflow.id, v_transfer_workflow.revision,
        case v_transfer_workflow.current_state
          when 'not_eligible' then 'transfer_block_not_eligible'
          when 'ready' then 'transfer_block_ready'
          else 'transfer_block_reserved' end,
        'system', null, 'Financial hold blocks an unsettled provider transfer.',
        jsonb_build_object('hold_id', v_hold.id, 'hold_type', p_hold_type),
        p_deduplication_key || ':transfer_block'
      );
    end if;
  end if;

  perform set_config('app.completion_release_v2_mutation', 'on', true);
  update public.fund_releases_v2 set
    blocked_at = coalesce(blocked_at, clock_timestamp()),
    blocker_codes = (select array_agg(distinct value order by value)
      from unnest(blocker_codes || p_hold_type) value),
    updated_at = clock_timestamp()
  where payment_id = p_payment_id;
  perform set_config('app.completion_release_v2_mutation', 'off', true);
  return v_hold;
end
$$;

create or replace function public.create_cancellation_allocation_proposal_v2(
  p_cancellation_id uuid,
  p_actor_type text,
  p_actor_user_id uuid,
  p_provider_awarded_gross_amount_cents bigint,
  p_provider_statutory_withholding_amount_cents bigint,
  p_client_tax_allocated_amount_cents bigint,
  p_reason text,
  p_deduplication_key text
)
returns public.cancellation_allocation_proposals_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case public.cancellation_cases_v2%rowtype;
  v_payment public.checkout_v2_payments%rowtype;
  v_terms public.financial_terms_snapshots%rowtype;
  v_proposal public.cancellation_allocation_proposals_v2%rowtype;
  v_revision integer;
  v_fee bigint;
  v_refund bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into v_proposal from public.cancellation_allocation_proposals_v2
  where deduplication_key = p_deduplication_key;
  if found then
    if v_proposal.cancellation_id <> p_cancellation_id then
      raise exception 'Allocation operation identity belongs to another cancellation'
        using errcode = '23505';
    end if;
    return v_proposal;
  end if;
  select * into v_case from public.cancellation_cases_v2 where id = p_cancellation_id for update;
  if not found then raise exception 'Cancellation case not found' using errcode = 'P0002'; end if;
  select * into v_payment from public.checkout_v2_payments where id = v_case.payment_id;
  select * into v_terms from public.financial_terms_snapshots where id = v_payment.terms_snapshot_id;
  if p_provider_awarded_gross_amount_cents < 0
     or p_provider_awarded_gross_amount_cents > v_terms.provider_initial_gross_amount_cents
     or p_provider_statutory_withholding_amount_cents < 0
     or p_provider_statutory_withholding_amount_cents > p_provider_awarded_gross_amount_cents
     or p_client_tax_allocated_amount_cents < 0
     or p_client_tax_allocated_amount_cents > v_terms.client_tax_initial_amount_cents then
    raise exception 'Invalid cancellation allocation' using errcode = '23514';
  end if;
  v_fee := round(p_provider_awarded_gross_amount_cents::numeric
    * v_terms.platform_fee_rate_bps::numeric / 10000)::bigint;
  v_refund := v_terms.client_total_amount_cents
    - p_provider_awarded_gross_amount_cents - v_fee - p_client_tax_allocated_amount_cents;
  select coalesce(max(revision), 0) + 1 into v_revision
  from public.cancellation_allocation_proposals_v2 where cancellation_id = v_case.id;
  insert into public.cancellation_allocation_proposals_v2 (
    cancellation_id, revision, proposer_actor_type, proposer_user_id,
    provider_awarded_gross_amount_cents,
    provider_statutory_withholding_amount_cents,
    client_tax_allocated_amount_cents, platform_fee_final_amount_cents,
    client_refund_amount_cents, reason, deduplication_key
  ) values (
    v_case.id, v_revision, p_actor_type, p_actor_user_id,
    p_provider_awarded_gross_amount_cents,
    p_provider_statutory_withholding_amount_cents,
    p_client_tax_allocated_amount_cents, v_fee, v_refund, p_reason,
    p_deduplication_key
  ) returning * into v_proposal;
  return v_proposal;
end
$$;

create or replace function public.request_client_cancellation_v2(
  p_payment_id uuid,
  p_client_id uuid,
  p_reason text,
  p_deduplication_key text
)
returns public.cancellation_cases_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_payment public.checkout_v2_payments%rowtype;
  v_case public.cancellation_cases_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  select * into v_payment from public.checkout_v2_payments where id = p_payment_id for update;
  if not found or v_payment.client_id <> p_client_id then
    raise exception 'Client payment not found' using errcode = '42501';
  end if;
  select * into v_case from public.cancellation_cases_v2 where payment_id = p_payment_id;
  if found then return v_case; end if;
  v_case.id := gen_random_uuid();
  v_workflow := public.create_workflow_instance(
    'cancellation', 'v1', v_case.id, 'marketplace_v2', 'client', p_client_id,
    p_reason, jsonb_build_object('payment_id', p_payment_id),
    p_deduplication_key || ':workflow'
  );
  insert into public.cancellation_cases_v2 (
    id, payment_id, workflow_instance_id, cancellation_type,
    requested_by_actor_type, requested_by, reason
  ) values (
    v_case.id, p_payment_id, v_workflow.id, 'commercial_client',
    'client', p_client_id, p_reason
  ) returning * into v_case;
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'cancellation_client_requests_full',
    'client', p_client_id, p_reason, jsonb_build_object('requested_refund', 'full'),
    p_deduplication_key || ':requested'
  );
  perform public.create_cancellation_allocation_proposal_v2(
    v_case.id, 'client', p_client_id, 0, 0, 0, p_reason,
    p_deduplication_key || ':full_refund_allocation'
  );
  perform public.open_checkout_v2_financial_hold(
    p_payment_id, 'refund', v_case.id::text, p_reason,
    'client', p_client_id, p_deduplication_key || ':hold'
  );
  insert into public.financial_audit_log (
    financial_flow_version, event_type, entity_type, entity_id, actor_type,
    actor_user_id, reason, after_state, evidence, deduplication_key
  ) values (
    'marketplace_v2', 'cancellation.client_full_refund_requested',
    'cancellation_case_v2', v_case.id::text, 'user', p_client_id, p_reason,
    jsonb_build_object('payment_id', p_payment_id, 'requested_refund', 'full'),
    '{}'::jsonb, p_deduplication_key || ':audit'
  );
  return v_case;
end
$$;

create or replace function public.open_service_dispute_v2(
  p_payment_id uuid,
  p_actor_type text,
  p_actor_user_id uuid,
  p_issue_code text,
  p_reason text,
  p_deduplication_key text
)
returns public.service_disputes_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_payment public.checkout_v2_payments%rowtype;
  v_dispute public.service_disputes_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  if p_actor_type not in ('client', 'provider') then raise exception 'Invalid dispute actor' using errcode = '22023'; end if;
  select * into v_payment from public.checkout_v2_payments where id = p_payment_id for update;
  if not found or (p_actor_type = 'client' and v_payment.client_id <> p_actor_user_id)
     or (p_actor_type = 'provider' and v_payment.provider_id <> p_actor_user_id) then
    raise exception 'Dispute payment not found for actor' using errcode = '42501';
  end if;
  select * into v_dispute from public.service_disputes_v2 where payment_id = p_payment_id;
  if found then return v_dispute; end if;
  v_dispute.id := gen_random_uuid();
  v_workflow := public.create_workflow_instance(
    'service_dispute', 'v1', v_dispute.id, 'marketplace_v2', p_actor_type,
    p_actor_user_id, p_reason, jsonb_build_object('payment_id', p_payment_id,
      'issue_code', p_issue_code), p_deduplication_key || ':workflow'
  );
  insert into public.service_disputes_v2 (
    id, payment_id, workflow_instance_id, opened_by_actor_type,
    opened_by, issue_code, reason
  ) values (
    v_dispute.id, p_payment_id, v_workflow.id, p_actor_type,
    p_actor_user_id, p_issue_code, p_reason
  ) returning * into v_dispute;
  v_workflow := public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'service_dispute_open',
    p_actor_type, p_actor_user_id, p_reason,
    jsonb_build_object('issue_code', p_issue_code), p_deduplication_key || ':opened'
  );
  perform public.open_checkout_v2_financial_hold(
    p_payment_id, 'service_dispute', v_dispute.id::text, p_reason,
    p_actor_type, p_actor_user_id, p_deduplication_key || ':hold'
  );
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'service_dispute_collect_evidence',
    'system', null, 'Fund release is blocked while evidence is collected.',
    '{}'::jsonb, p_deduplication_key || ':evidence_collection'
  );
  insert into public.financial_audit_log (
    financial_flow_version, event_type, entity_type, entity_id, actor_type,
    actor_user_id, reason, after_state, evidence, deduplication_key
  ) values (
    'marketplace_v2', 'service_dispute.opened', 'service_dispute_v2',
    v_dispute.id::text, 'user', p_actor_user_id, p_reason,
    jsonb_build_object('payment_id', p_payment_id, 'issue_code', p_issue_code),
    '{}'::jsonb, p_deduplication_key || ':audit'
  );
  return v_dispute;
end
$$;

create or replace function public.provider_respond_cancellation_v2(
  p_cancellation_id uuid,
  p_provider_id uuid,
  p_action text,
  p_provider_awarded_gross_amount_cents bigint,
  p_provider_statutory_withholding_amount_cents bigint,
  p_client_tax_allocated_amount_cents bigint,
  p_reason text,
  p_deduplication_key text
)
returns public.cancellation_cases_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case public.cancellation_cases_v2%rowtype;
  v_payment public.checkout_v2_payments%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_dispute public.service_disputes_v2%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  select * into v_case from public.cancellation_cases_v2 where id = p_cancellation_id for update;
  select * into v_payment from public.checkout_v2_payments where id = v_case.payment_id;
  if not found or v_payment.provider_id <> p_provider_id then
    raise exception 'Provider cancellation case not found' using errcode = '42501';
  end if;
  select * into v_workflow from public.workflow_instances where id = v_case.workflow_instance_id for update;
  if p_action = 'accept_full_refund' then
    perform public.transition_workflow_instance(v_workflow.id, v_workflow.revision,
      'cancellation_provider_accepts_full', 'provider', p_provider_id, p_reason,
      '{}'::jsonb, p_deduplication_key);
    perform set_config('app.financial_remediation_v2_mutation', 'on', true);
    update public.cancellation_allocation_proposals_v2 set
      accepted_by_actor_type = 'provider', accepted_by = p_provider_id,
      accepted_at = clock_timestamp()
    where id = (select id from public.cancellation_allocation_proposals_v2
      where cancellation_id = v_case.id order by revision desc limit 1);
    perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  elsif p_action = 'counter_partial' then
    perform public.create_cancellation_allocation_proposal_v2(
      v_case.id, 'provider', p_provider_id,
      p_provider_awarded_gross_amount_cents,
      p_provider_statutory_withholding_amount_cents,
      p_client_tax_allocated_amount_cents, p_reason,
      p_deduplication_key || ':allocation'
    );
    perform public.transition_workflow_instance(v_workflow.id, v_workflow.revision,
      'cancellation_provider_counteroffers_partial', 'provider', p_provider_id,
      p_reason, jsonb_build_object('provider_awarded_gross_amount_cents',
        p_provider_awarded_gross_amount_cents), p_deduplication_key);
  elsif p_action = 'reject' then
    perform public.transition_workflow_instance(v_workflow.id, v_workflow.revision,
      'cancellation_provider_rejects_full', 'provider', p_provider_id,
      p_reason, '{}'::jsonb, p_deduplication_key);
    v_dispute := public.open_service_dispute_v2(
      v_case.payment_id, 'provider', p_provider_id, 'cancellation_disagreement',
      p_reason, p_deduplication_key || ':service_dispute'
    );
    perform set_config('app.financial_remediation_v2_mutation', 'on', true);
    update public.service_disputes_v2 set cancellation_id = v_case.id,
      updated_at = clock_timestamp()
    where id = v_dispute.id and cancellation_id is null;
    perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  else
    raise exception 'Unsupported provider cancellation action' using errcode = '22023';
  end if;
  return v_case;
end
$$;

create or replace function public.client_respond_cancellation_v2(
  p_cancellation_id uuid,
  p_client_id uuid,
  p_accept boolean,
  p_reason text,
  p_deduplication_key text
)
returns public.cancellation_cases_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case public.cancellation_cases_v2%rowtype;
  v_payment public.checkout_v2_payments%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_proposal public.cancellation_allocation_proposals_v2%rowtype;
  v_dispute public.service_disputes_v2%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  select * into v_case from public.cancellation_cases_v2 where id = p_cancellation_id for update;
  select * into v_payment from public.checkout_v2_payments where id = v_case.payment_id;
  if not found or v_payment.client_id <> p_client_id then
    raise exception 'Client cancellation case not found' using errcode = '42501';
  end if;
  select * into v_workflow from public.workflow_instances where id = v_case.workflow_instance_id for update;
  select * into v_proposal from public.cancellation_allocation_proposals_v2
  where cancellation_id = v_case.id order by revision desc limit 1;
  perform public.transition_workflow_instance(v_workflow.id, v_workflow.revision,
    case when p_accept then 'cancellation_client_accepts_partial'
      else 'cancellation_client_rejects_partial' end,
    'client', p_client_id, p_reason, jsonb_build_object('allocation_id', v_proposal.id),
    p_deduplication_key);
  if p_accept then
    perform set_config('app.financial_remediation_v2_mutation', 'on', true);
    update public.cancellation_allocation_proposals_v2 set
      accepted_by_actor_type = 'client', accepted_by = p_client_id,
      accepted_at = clock_timestamp() where id = v_proposal.id;
    perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  else
    v_dispute := public.open_service_dispute_v2(
      v_case.payment_id, 'client', p_client_id, 'cancellation_disagreement',
      p_reason, p_deduplication_key || ':service_dispute'
    );
    perform set_config('app.financial_remediation_v2_mutation', 'on', true);
    update public.service_disputes_v2 set cancellation_id = v_case.id,
      updated_at = clock_timestamp()
    where id = v_dispute.id and cancellation_id is null;
    perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  end if;
  return v_case;
end
$$;

create or replace function public.reserve_financial_resolution_v2(
  p_payment_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_provider_awarded_gross_amount_cents bigint,
  p_provider_statutory_withholding_amount_cents bigint,
  p_client_tax_allocated_amount_cents bigint,
  p_decision_reason text,
  p_actor_type text,
  p_actor_user_id uuid,
  p_mfa_authenticated_at timestamptz,
  p_security_policy_version text,
  p_expected_connect_revision bigint,
  p_deduplication_key text
)
returns table (
  resolution_id uuid, refund_id uuid, reversal_id uuid,
  provider_transfer_id uuid, resolution_status text
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_payment public.checkout_v2_payments%rowtype;
  v_terms public.financial_terms_snapshots%rowtype;
  v_release public.fund_releases_v2%rowtype;
  v_release_workflow public.workflow_instances%rowtype;
  v_previous public.financial_allocation_snapshots%rowtype;
  v_allocation public.financial_allocation_snapshots%rowtype;
  v_resolution public.financial_resolutions_v2%rowtype;
  v_transfer public.provider_transfers_v2%rowtype;
  v_transfer_workflow public.workflow_instances%rowtype;
  v_connect public.provider_connect_accounts%rowtype;
  v_eligibility_policy public.provider_eligibility_policy_versions%rowtype;
  v_eligibility_assessment public.provider_eligibility_assessments%rowtype;
  v_refund public.refunds_v2%rowtype;
  v_refund_workflow public.workflow_instances%rowtype;
  v_reversal public.transfer_reversals_v2%rowtype;
  v_reversal_workflow public.workflow_instances%rowtype;
  v_batch_id uuid;
  v_provider_held uuid;
  v_provider_payable uuid;
  v_withholding_payable uuid;
  v_fee_held uuid;
  v_fee_revenue uuid;
  v_tax_held uuid;
  v_tax_payable uuid;
  v_refund_payable uuid;
  v_recovery_receivable uuid;
  v_provider_transfer_amount bigint;
  v_fee bigint;
  v_refund_amount bigint;
  v_refund_delta bigint;
  v_recovery_target bigint := 0;
  v_revision integer;
  v_line smallint := 1;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  if p_source_type not in ('cancellation', 'service_dispute', 'payment_dispute')
     or p_actor_type not in ('system', 'admin') then
    raise exception 'Invalid financial resolution source or actor' using errcode = '22023';
  end if;
  if p_actor_type = 'admin' then
    perform public.assert_recent_financial_admin_mfa_v2(
      p_actor_user_id, p_mfa_authenticated_at, p_security_policy_version
    );
  elsif p_actor_user_id is not null or p_mfa_authenticated_at is not null
        or p_security_policy_version is not null then
    raise exception 'System resolution cannot carry administrator identity' using errcode = '22023';
  end if;
  select * into v_resolution from public.financial_resolutions_v2
  where source_type = p_source_type and source_id = p_source_id;
  if found then
    return query select v_resolution.id,
      (select refund.id from public.refunds_v2 refund
       where refund.resolution_id = v_resolution.id),
      (select reversal.id from public.transfer_reversals_v2 reversal
       where reversal.resolution_id = v_resolution.id),
      (select transfer.id from public.provider_transfers_v2 transfer
       where transfer.payment_id = v_resolution.payment_id),
      v_resolution.status;
    return;
  end if;

  select * into v_payment from public.checkout_v2_payments where id = p_payment_id for update;
  if not found then raise exception 'Checkout v2 payment not found' using errcode = 'P0002'; end if;
  select * into v_terms from public.financial_terms_snapshots where id = v_payment.terms_snapshot_id;
  select * into v_release from public.fund_releases_v2 where payment_id = p_payment_id for update;
  select * into v_release_workflow from public.workflow_instances
  where id = v_release.workflow_instance_id for update;
  select * into v_previous from public.financial_allocation_snapshots
  where terms_snapshot_id = v_terms.id order by revision desc limit 1;

  if p_provider_awarded_gross_amount_cents < 0
     or p_provider_awarded_gross_amount_cents > v_terms.provider_initial_gross_amount_cents
     or p_provider_statutory_withholding_amount_cents < 0
     or p_provider_statutory_withholding_amount_cents > p_provider_awarded_gross_amount_cents
     or p_client_tax_allocated_amount_cents < 0
     or p_client_tax_allocated_amount_cents > v_terms.client_tax_initial_amount_cents then
    raise exception 'Invalid final allocation' using errcode = '23514';
  end if;
  v_provider_transfer_amount := p_provider_awarded_gross_amount_cents
    - p_provider_statutory_withholding_amount_cents;
  v_fee := round(p_provider_awarded_gross_amount_cents::numeric
    * v_terms.platform_fee_rate_bps::numeric / 10000)::bigint;
  v_refund_amount := v_terms.client_total_amount_cents
    - p_provider_awarded_gross_amount_cents - v_fee - p_client_tax_allocated_amount_cents;
  if v_previous.id is not null and (
    p_provider_awarded_gross_amount_cents > v_previous.provider_awarded_gross_amount_cents
    or v_fee > v_previous.platform_fee_final_amount_cents
    or p_client_tax_allocated_amount_cents > v_previous.client_tax_allocated_amount_cents
    or v_refund_amount < v_previous.client_refund_amount_cents
  ) then
    raise exception 'A remediation allocation cannot increase a prior award' using errcode = '23514';
  end if;
  v_revision := coalesce(v_previous.revision, 0) + 1;
  v_refund_delta := v_refund_amount - coalesce(v_previous.client_refund_amount_cents, 0);
  if v_refund_delta < 0 then raise exception 'Refund delta cannot be negative' using errcode = '23514'; end if;

  insert into public.financial_allocation_snapshots (
    terms_snapshot_id, previous_snapshot_id, revision, allocation_reason,
    currency, provider_awarded_gross_amount_cents,
    platform_fee_final_amount_cents, client_refund_amount_cents,
    client_tax_allocated_amount_cents,
    provider_statutory_withholding_amount_cents,
    provider_transfer_amount_cents, is_final, created_by_actor_type, created_by,
    decision_reason, evidence, deduplication_key
  ) values (
    v_terms.id, v_previous.id, v_revision, p_source_type || '_resolution',
    v_terms.currency, p_provider_awarded_gross_amount_cents, v_fee,
    v_refund_amount, p_client_tax_allocated_amount_cents,
    p_provider_statutory_withholding_amount_cents,
    v_provider_transfer_amount, true, p_actor_type, p_actor_user_id,
    p_decision_reason, jsonb_build_object('source_type', p_source_type,
      'source_id', p_source_id), p_deduplication_key || ':allocation'
  ) returning * into v_allocation;

  v_provider_payable := public.get_or_create_financial_ledger_account(
    'provider_transfer_payable', 'liability', 'provider', v_payment.provider_id, v_terms.currency);
  v_withholding_payable := public.get_or_create_financial_ledger_account(
    'provider_statutory_withholding_payable', 'liability', 'tax_authority', null, v_terms.currency);
  v_fee_revenue := public.get_or_create_financial_ledger_account(
    'platform_fee_revenue', 'revenue', 'platform', null, v_terms.currency);
  v_tax_payable := public.get_or_create_financial_ledger_account(
    'client_tax_payable', 'liability', 'tax_authority', null, v_terms.currency);
  v_refund_payable := public.get_or_create_financial_ledger_account(
    'client_refund_payable', 'liability', 'client', v_payment.client_id, v_terms.currency);

  insert into public.financial_ledger_batches (
    financial_flow_version, operation_type, operation_key, currency,
    external_reference_type, external_reference_id, actor_type, actor_user_id, reason
  ) values (
    'marketplace_v2', 'financial_resolution_reserved', p_deduplication_key,
    v_terms.currency, p_source_type, p_source_id::text,
    case when p_actor_type = 'admin' then 'admin' else 'system' end,
    p_actor_user_id, p_decision_reason
  ) returning id into v_batch_id;

  if v_previous.id is null then
    v_provider_held := public.get_or_create_financial_ledger_account(
      'provider_gross_held', 'liability', 'provider', v_payment.provider_id, v_terms.currency);
    v_fee_held := public.get_or_create_financial_ledger_account(
      'platform_fee_held', 'liability', 'platform', null, v_terms.currency);
    v_tax_held := public.get_or_create_financial_ledger_account(
      'client_tax_held', 'liability', 'platform', null, v_terms.currency);
    insert into public.financial_ledger_entries values
      (default, v_batch_id, v_line, v_provider_held, 'debit',
       v_terms.provider_initial_gross_amount_cents, 'Allocate held provider gross.', default);
    v_line := v_line + 1;
    if v_terms.platform_fee_initial_amount_cents > 0 then
      insert into public.financial_ledger_entries values
        (default, v_batch_id, v_line, v_fee_held, 'debit',
         v_terms.platform_fee_initial_amount_cents, 'Allocate held platform fee.', default);
      v_line := v_line + 1;
    end if;
    if v_terms.client_tax_initial_amount_cents > 0 then
      insert into public.financial_ledger_entries values
        (default, v_batch_id, v_line, v_tax_held, 'debit',
         v_terms.client_tax_initial_amount_cents, 'Allocate held client tax.', default);
      v_line := v_line + 1;
    end if;
  else
    select * into v_transfer from public.provider_transfers_v2 where payment_id = p_payment_id for update;
    if found and v_transfer.succeeded_at is not null then
      v_recovery_target := greatest(0, v_previous.provider_transfer_amount_cents
        - v_provider_transfer_amount);
      if v_recovery_target > 0 then
        v_recovery_receivable := public.get_or_create_financial_ledger_account(
          'provider_recovery_receivable', 'asset', 'provider', v_payment.provider_id, v_terms.currency);
        insert into public.financial_ledger_entries values
          (default, v_batch_id, v_line, v_recovery_receivable, 'debit',
           v_recovery_target, 'Recognize provider recovery target after final allocation.', default);
        v_line := v_line + 1;
      end if;
    elsif found then
      if v_previous.provider_transfer_amount_cents > v_provider_transfer_amount then
        insert into public.financial_ledger_entries values
          (default, v_batch_id, v_line, v_provider_payable, 'debit',
           v_previous.provider_transfer_amount_cents - v_provider_transfer_amount,
           'Reduce unsettled provider transfer payable.', default);
        v_line := v_line + 1;
      end if;
      if v_provider_transfer_amount > 0 then
        perform set_config('app.completion_release_v2_mutation', 'on', true);
        update public.provider_transfers_v2 set amount_cents = v_provider_transfer_amount,
          allocation_snapshot_id = v_allocation.id,
          idempotency_key = 'transfer-v2:' || p_payment_id::text || ':resolution:' || v_revision::text,
          updated_at = clock_timestamp() where id = v_transfer.id;
        perform set_config('app.completion_release_v2_mutation', 'off', true);
      end if;
    end if;
    if v_previous.provider_statutory_withholding_amount_cents
       > p_provider_statutory_withholding_amount_cents then
      insert into public.financial_ledger_entries values
        (default, v_batch_id, v_line, v_withholding_payable, 'debit',
         v_previous.provider_statutory_withholding_amount_cents
           - p_provider_statutory_withholding_amount_cents,
         'Reduce provider withholding payable without reducing the client refund twice.', default);
      v_line := v_line + 1;
    end if;
    if v_previous.platform_fee_final_amount_cents > v_fee then
      insert into public.financial_ledger_entries values
        (default, v_batch_id, v_line, v_fee_revenue, 'debit',
         v_previous.platform_fee_final_amount_cents - v_fee,
         'Reduce platform fee to the rate applied to the final provider award.', default);
      v_line := v_line + 1;
    end if;
    if v_previous.client_tax_allocated_amount_cents > p_client_tax_allocated_amount_cents then
      insert into public.financial_ledger_entries values
        (default, v_batch_id, v_line, v_tax_payable, 'debit',
         v_previous.client_tax_allocated_amount_cents - p_client_tax_allocated_amount_cents,
         'Reduce allocated client tax.', default);
      v_line := v_line + 1;
    end if;
  end if;

  if v_previous.id is null then
    if v_provider_transfer_amount > 0 then
      insert into public.financial_ledger_entries values
        (default, v_batch_id, v_line, v_provider_payable, 'credit',
         v_provider_transfer_amount, 'Recognize final provider transfer payable.', default);
      v_line := v_line + 1;
    end if;
    if p_provider_statutory_withholding_amount_cents > 0 then
      insert into public.financial_ledger_entries values
        (default, v_batch_id, v_line, v_withholding_payable, 'credit',
         p_provider_statutory_withholding_amount_cents,
         'Recognize withholding inside provider gross award.', default);
      v_line := v_line + 1;
    end if;
    if v_fee > 0 then
      insert into public.financial_ledger_entries values
        (default, v_batch_id, v_line, v_fee_revenue, 'credit', v_fee,
         'Recognize final proportional platform fee.', default);
      v_line := v_line + 1;
    end if;
    if p_client_tax_allocated_amount_cents > 0 then
      insert into public.financial_ledger_entries values
        (default, v_batch_id, v_line, v_tax_payable, 'credit',
         p_client_tax_allocated_amount_cents, 'Recognize final allocated client tax.', default);
      v_line := v_line + 1;
    end if;
  end if;
  if v_refund_delta > 0 then
    insert into public.financial_ledger_entries values
      (default, v_batch_id, v_line, v_refund_payable, 'credit', v_refund_delta,
       'Recognize unconditional client refund obligation.', default);
  end if;
  perform public.post_financial_ledger_batch(v_batch_id);

  insert into public.financial_resolutions_v2 (
    payment_id, source_type, source_id, cancellation_id, service_dispute_id,
    payment_dispute_id, allocation_snapshot_id,
    provider_awarded_gross_amount_cents,
    provider_statutory_withholding_amount_cents, provider_transfer_amount_cents,
    platform_fee_final_amount_cents, client_tax_allocated_amount_cents,
    client_refund_amount_cents, provider_recovery_target_amount_cents,
    status, decision_reason, decided_by_actor_type, decided_by,
    mfa_authenticated_at, security_policy_version, ledger_batch_id,
    deduplication_key
  ) values (
    p_payment_id, p_source_type, p_source_id,
    case when p_source_type = 'cancellation' then p_source_id end,
    case when p_source_type = 'service_dispute' then p_source_id end,
    case when p_source_type = 'payment_dispute' then p_source_id end,
    v_allocation.id,
    p_provider_awarded_gross_amount_cents,
    p_provider_statutory_withholding_amount_cents, v_provider_transfer_amount,
    v_fee, p_client_tax_allocated_amount_cents, v_refund_amount,
    v_recovery_target,
    case when v_recovery_target > 0 then 'recovery_pending'
      when v_refund_delta > 0 then 'refund_pending' else 'completed' end,
    p_decision_reason, p_actor_type, p_actor_user_id,
    p_mfa_authenticated_at, p_security_policy_version, v_batch_id,
    p_deduplication_key
  ) returning * into v_resolution;

  if v_previous.id is null then
    if v_provider_transfer_amount > 0 then
      if p_expected_connect_revision is null then
        raise exception 'Current Connect revision required for provider award' using errcode = '22023';
      end if;
      select * into v_connect from public.provider_connect_accounts
      where provider_id = v_payment.provider_id for update;
      if not found or v_connect.revision <> p_expected_connect_revision
         or v_connect.closed or not v_connect.connection_enabled
         or v_connect.stripe_transfers_status <> 'active' then
        raise exception 'Current Connect capability blocks provider allocation' using errcode = '55000';
      end if;
      select * into v_eligibility_policy from public.provider_eligibility_policy_versions
      where version = v_terms.eligibility_policy_version
        and effective_from <= clock_timestamp()
        and (effective_until is null or effective_until > clock_timestamp());
      select * into v_eligibility_assessment
      from public.provider_eligibility_assessments assessment
      where assessment.provider_id = v_payment.provider_id
        and assessment.policy_version = v_terms.eligibility_policy_version
        and assessment.service_country_code = left(v_terms.jurisdiction_code, 2)
        and assessment.service_category_code in (
          v_terms.eligibility_service_category_code, '*'
        )
      order by (assessment.service_category_code
        = v_terms.eligibility_service_category_code) desc, assessment.revision desc
      limit 1;
      if v_eligibility_policy.version is null
         or v_eligibility_assessment.status <> 'eligible'
         or (v_eligibility_assessment.valid_until is not null
           and v_eligibility_assessment.valid_until <= clock_timestamp()) then
        raise exception 'Provider eligibility blocks final provider allocation' using errcode = '55000';
      end if;
      v_release_workflow := public.transition_workflow_instance(
        v_release_workflow.id, v_release_workflow.revision,
        'release_reserve_after_resolution', 'system', null,
        p_decision_reason, jsonb_build_object('resolution_id', v_resolution.id),
        p_deduplication_key || ':release_reserved'
      );
      perform public.transition_workflow_instance(
        v_release_workflow.id, v_release_workflow.revision, 'release_post',
        'system', null, 'Final resolution allocation posted.',
        jsonb_build_object('ledger_batch_id', v_batch_id),
        p_deduplication_key || ':release_posted'
      );
      v_transfer.id := gen_random_uuid();
      v_transfer_workflow := public.create_workflow_instance(
        'provider_transfer', 'v1', v_transfer.id, 'marketplace_v2', 'system', null,
        'Provider transfer initialized from final financial resolution.',
        jsonb_build_object('resolution_id', v_resolution.id),
        p_deduplication_key || ':transfer_workflow'
      );
      insert into public.provider_transfers_v2 (
        id, payment_id, release_payment_id, allocation_snapshot_id,
        workflow_instance_id, provider_id, stripe_account_id,
        source_transaction_charge_id, amount_cents, currency, idempotency_key
      ) values (
        v_transfer.id, p_payment_id, p_payment_id, v_allocation.id,
        v_transfer_workflow.id, v_payment.provider_id, v_connect.stripe_account_id,
        v_payment.stripe_charge_id, v_provider_transfer_amount, v_terms.currency,
        'transfer-v2:' || p_payment_id::text || ':resolution:' || v_revision::text
      ) returning * into v_transfer;
      v_transfer_workflow := public.transition_workflow_instance(
        v_transfer_workflow.id, v_transfer_workflow.revision,
        'transfer_become_ready', 'system', null, 'Final provider award is transferable.',
        jsonb_build_object('connect_revision', v_connect.revision),
        p_deduplication_key || ':transfer_ready'
      );
      perform public.transition_workflow_instance(
        v_transfer_workflow.id, v_transfer_workflow.revision,
        'transfer_reserve', 'system', null, 'Final provider transfer reserved.',
        '{}'::jsonb, p_deduplication_key || ':transfer_reserved'
      );
      perform set_config('app.completion_release_v2_mutation', 'on', true);
      update public.fund_releases_v2 set allocation_snapshot_id = v_allocation.id,
        ledger_batch_id = v_batch_id, release_trigger = 'financial_resolution',
        released_at = clock_timestamp(), updated_at = clock_timestamp()
      where payment_id = p_payment_id;
      perform set_config('app.completion_release_v2_mutation', 'off', true);
    else
      perform public.transition_workflow_instance(
        v_release_workflow.id, v_release_workflow.revision,
        case when v_release_workflow.current_state = 'blocked'
          then 'release_cancel_blocked' else 'release_cancel_held' end,
        'system', null, p_decision_reason,
        jsonb_build_object('resolution_id', v_resolution.id),
        p_deduplication_key || ':release_cancelled'
      );
      perform set_config('app.completion_release_v2_mutation', 'on', true);
      update public.fund_releases_v2 set allocation_snapshot_id = v_allocation.id,
        ledger_batch_id = v_batch_id, release_trigger = 'financial_resolution',
        cancelled_at = clock_timestamp(), updated_at = clock_timestamp()
      where payment_id = p_payment_id;
      perform set_config('app.completion_release_v2_mutation', 'off', true);
    end if;
  end if;

  if v_recovery_target > 0 then
    v_reversal.id := gen_random_uuid();
    v_reversal_workflow := public.create_workflow_instance(
      'transfer_reversal', 'v1', v_reversal.id, 'marketplace_v2', 'system', null,
      'Final customer refund requires provider transfer recovery.',
      jsonb_build_object('resolution_id', v_resolution.id),
      p_deduplication_key || ':reversal_workflow'
    );
    insert into public.transfer_reversals_v2 (
      id, payment_id, provider_transfer_id, resolution_id, workflow_instance_id,
      recovery_type, requested_amount_cents, recovery_deficit_amount_cents,
      currency, stripe_transfer_id, idempotency_key
    ) values (
      v_reversal.id, p_payment_id, v_transfer.id, v_resolution.id,
      v_reversal_workflow.id, 'final_refund', v_recovery_target,
      v_recovery_target, v_terms.currency, v_transfer.stripe_transfer_id,
      'reversal-v2:resolution:' || v_resolution.id::text
    ) returning * into v_reversal;
    perform public.transition_workflow_instance(
      v_reversal_workflow.id, v_reversal_workflow.revision,
      'reversal_request_final', 'system', null,
      'Final allocation requests transfer recovery before refund.',
      jsonb_build_object('requested_amount_cents', v_recovery_target),
      p_deduplication_key || ':reversal_requested'
    );
  end if;

  if v_refund_delta > 0 then
    v_refund.id := gen_random_uuid();
    v_refund_workflow := public.create_workflow_instance(
      'refund', 'v1', v_refund.id, 'marketplace_v2', 'system', null,
      'Final financial resolution authorizes a client refund.',
      jsonb_build_object('resolution_id', v_resolution.id),
      p_deduplication_key || ':refund_workflow'
    );
    insert into public.refunds_v2 (
      id, payment_id, resolution_id, workflow_instance_id, amount_cents,
      currency, stripe_payment_intent_id, idempotency_key
    ) values (
      v_refund.id, p_payment_id, v_resolution.id, v_refund_workflow.id,
      v_refund_delta, v_terms.currency, v_payment.stripe_payment_intent_id,
      'refund-v2:resolution:' || v_resolution.id::text
    ) returning * into v_refund;
    v_refund_workflow := public.transition_workflow_instance(
      v_refund_workflow.id, v_refund_workflow.revision, 'refund_authorize',
      'system', null, p_decision_reason,
      jsonb_build_object('amount_cents', v_refund_delta),
      p_deduplication_key || ':refund_authorized'
    );
    if v_reversal.id is not null then
      perform public.transition_workflow_instance(
        v_refund_workflow.id, v_refund_workflow.revision,
        'refund_attempt_recovery', 'system', null,
        'Transfer recovery is attempted first but cannot block the refund.',
        jsonb_build_object('transfer_reversal_id', v_reversal.id),
        p_deduplication_key || ':refund_recovery_attempted'
      );
    end if;
  end if;

  insert into public.financial_audit_log (
    financial_flow_version, event_type, entity_type, entity_id, actor_type,
    actor_user_id, reason, after_state, evidence, deduplication_key
  ) values (
    'marketplace_v2', 'financial_resolution.reserved', 'financial_resolution_v2',
    v_resolution.id::text,
    case when p_actor_type = 'admin' then 'admin' else 'system' end,
    p_actor_user_id, p_decision_reason,
    jsonb_build_object('provider_awarded_gross_amount_cents',
      p_provider_awarded_gross_amount_cents,
      'provider_statutory_withholding_amount_cents',
      p_provider_statutory_withholding_amount_cents,
      'platform_fee_final_amount_cents', v_fee,
      'client_refund_amount_cents', v_refund_amount,
      'provider_recovery_target_amount_cents', v_recovery_target,
      'currency', v_terms.currency),
    jsonb_build_object('allocation_snapshot_id', v_allocation.id,
      'ledger_batch_id', v_batch_id, 'source_type', p_source_type,
      'source_id', p_source_id), p_deduplication_key || ':audit'
  );
  return query select v_resolution.id, v_refund.id, v_reversal.id,
    v_transfer.id, v_resolution.status;
end
$$;

create or replace function public.execute_agreed_cancellation_v2(
  p_cancellation_id uuid,
  p_expected_connect_revision bigint,
  p_deduplication_key text
)
returns table (
  resolution_id uuid, refund_id uuid, reversal_id uuid,
  provider_transfer_id uuid, resolution_status text
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case public.cancellation_cases_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_allocation public.cancellation_allocation_proposals_v2%rowtype;
  v_result record;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  select * into v_case from public.cancellation_cases_v2 where id = p_cancellation_id for update;
  if not found then raise exception 'Cancellation case not found' using errcode = 'P0002'; end if;
  select * into v_workflow from public.workflow_instances where id = v_case.workflow_instance_id for update;
  if v_workflow.current_state = 'financial_resolution_pending' then
    select * into v_result from public.reserve_financial_resolution_v2(
      v_case.payment_id, 'cancellation', v_case.id,
      (select provider_awarded_gross_amount_cents from public.cancellation_allocation_proposals_v2
       where cancellation_id = v_case.id and accepted_at is not null order by revision desc limit 1),
      (select provider_statutory_withholding_amount_cents from public.cancellation_allocation_proposals_v2
       where cancellation_id = v_case.id and accepted_at is not null order by revision desc limit 1),
      (select client_tax_allocated_amount_cents from public.cancellation_allocation_proposals_v2
       where cancellation_id = v_case.id and accepted_at is not null order by revision desc limit 1),
      v_case.reason, 'system', null, null, null, p_expected_connect_revision,
      p_deduplication_key
    );
    return query select v_result.resolution_id, v_result.refund_id,
      v_result.reversal_id, v_result.provider_transfer_id, v_result.resolution_status;
    return;
  end if;
  if v_workflow.current_state not in ('mutually_agreed', 'provider_cancelled', 'legal_policy_applied') then
    raise exception 'Cancellation has no executable allocation' using errcode = '23514';
  end if;
  select * into v_allocation from public.cancellation_allocation_proposals_v2
  where cancellation_id = v_case.id and accepted_at is not null
  order by revision desc limit 1;
  if not found then raise exception 'Cancellation allocation is not accepted' using errcode = '23514'; end if;
  v_workflow := public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision,
    case v_workflow.current_state
      when 'mutually_agreed' then 'cancellation_execute_mutual'
      when 'provider_cancelled' then 'cancellation_execute_provider'
      else 'cancellation_execute_legal' end,
    'system', null, 'Execute explicit cancellation allocation.',
    jsonb_build_object('allocation_proposal_id', v_allocation.id),
    p_deduplication_key || ':execute'
  );
  select * into v_result from public.reserve_financial_resolution_v2(
    v_case.payment_id, 'cancellation', v_case.id,
    v_allocation.provider_awarded_gross_amount_cents,
    v_allocation.provider_statutory_withholding_amount_cents,
    v_allocation.client_tax_allocated_amount_cents,
    v_allocation.reason, 'system', null, null, null,
    p_expected_connect_revision, p_deduplication_key
  );
  perform set_config('app.financial_remediation_v2_mutation', 'on', true);
  update public.cancellation_cases_v2 set financial_resolution_id = v_result.resolution_id,
    updated_at = clock_timestamp() where id = v_case.id;
  perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  return query select v_result.resolution_id, v_result.refund_id,
    v_result.reversal_id, v_result.provider_transfer_id, v_result.resolution_status;
end
$$;

create or replace function public.provider_cancel_service_v2(
  p_payment_id uuid,
  p_provider_id uuid,
  p_reason text,
  p_deduplication_key text
)
returns public.cancellation_cases_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_payment public.checkout_v2_payments%rowtype;
  v_case public.cancellation_cases_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_proposal public.cancellation_allocation_proposals_v2%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  select * into v_payment from public.checkout_v2_payments where id = p_payment_id for update;
  if not found or v_payment.provider_id <> p_provider_id then
    raise exception 'Provider payment not found' using errcode = '42501';
  end if;
  select * into v_case from public.cancellation_cases_v2 where payment_id = p_payment_id;
  if found then return v_case; end if;
  v_case.id := gen_random_uuid();
  v_workflow := public.create_workflow_instance(
    'cancellation', 'v1', v_case.id, 'marketplace_v2', 'provider', p_provider_id,
    p_reason, jsonb_build_object('payment_id', p_payment_id),
    p_deduplication_key || ':workflow'
  );
  insert into public.cancellation_cases_v2 (
    id, payment_id, workflow_instance_id, cancellation_type,
    requested_by_actor_type, requested_by, reason
  ) values (
    v_case.id, p_payment_id, v_workflow.id, 'provider_cancellation',
    'provider', p_provider_id, p_reason
  ) returning * into v_case;
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'cancellation_provider_cancels',
    'provider', p_provider_id, p_reason, '{}'::jsonb,
    p_deduplication_key || ':cancelled'
  );
  v_proposal := public.create_cancellation_allocation_proposal_v2(
    v_case.id, 'system', null, 0, 0, 0,
    'Provider cancellation requires a full customer refund.',
    p_deduplication_key || ':full_refund_allocation'
  );
  perform set_config('app.financial_remediation_v2_mutation', 'on', true);
  update public.cancellation_allocation_proposals_v2 set
    accepted_by_actor_type = 'system', accepted_at = clock_timestamp()
  where id = v_proposal.id;
  perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  perform public.open_checkout_v2_financial_hold(
    p_payment_id, 'refund', v_case.id::text, p_reason,
    'provider', p_provider_id, p_deduplication_key || ':hold'
  );
  return v_case;
end
$$;

create or replace function public.propose_mutual_cancellation_v2(
  p_payment_id uuid,
  p_actor_type text,
  p_actor_user_id uuid,
  p_provider_awarded_gross_amount_cents bigint,
  p_provider_statutory_withholding_amount_cents bigint,
  p_client_tax_allocated_amount_cents bigint,
  p_reason text,
  p_deduplication_key text
)
returns public.cancellation_cases_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_payment public.checkout_v2_payments%rowtype;
  v_case public.cancellation_cases_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  if p_actor_type not in ('client', 'provider') then raise exception 'Invalid cancellation actor' using errcode = '22023'; end if;
  select * into v_payment from public.checkout_v2_payments where id = p_payment_id for update;
  if not found or (p_actor_type = 'client' and v_payment.client_id <> p_actor_user_id)
     or (p_actor_type = 'provider' and v_payment.provider_id <> p_actor_user_id) then
    raise exception 'Cancellation payment not found for actor' using errcode = '42501';
  end if;
  select * into v_case from public.cancellation_cases_v2 where payment_id = p_payment_id;
  if found then return v_case; end if;
  v_case.id := gen_random_uuid();
  v_workflow := public.create_workflow_instance(
    'cancellation', 'v1', v_case.id, 'marketplace_v2', p_actor_type,
    p_actor_user_id, p_reason, jsonb_build_object('payment_id', p_payment_id),
    p_deduplication_key || ':workflow'
  );
  insert into public.cancellation_cases_v2 (
    id, payment_id, workflow_instance_id, cancellation_type,
    requested_by_actor_type, requested_by, reason
  ) values (
    v_case.id, p_payment_id, v_workflow.id, 'mutual_cancellation',
    p_actor_type, p_actor_user_id, p_reason
  ) returning * into v_case;
  perform public.create_cancellation_allocation_proposal_v2(
    v_case.id, p_actor_type, p_actor_user_id,
    p_provider_awarded_gross_amount_cents,
    p_provider_statutory_withholding_amount_cents,
    p_client_tax_allocated_amount_cents, p_reason,
    p_deduplication_key || ':allocation'
  );
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'cancellation_propose_mutual',
    p_actor_type, p_actor_user_id, p_reason,
    jsonb_build_object('provider_awarded_gross_amount_cents',
      p_provider_awarded_gross_amount_cents), p_deduplication_key || ':proposed'
  );
  perform public.open_checkout_v2_financial_hold(
    p_payment_id, 'refund', v_case.id::text, p_reason,
    p_actor_type, p_actor_user_id, p_deduplication_key || ':hold'
  );
  return v_case;
end
$$;

create or replace function public.respond_mutual_cancellation_v2(
  p_cancellation_id uuid,
  p_actor_type text,
  p_actor_user_id uuid,
  p_accept boolean,
  p_reason text,
  p_deduplication_key text
)
returns public.cancellation_cases_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case public.cancellation_cases_v2%rowtype;
  v_payment public.checkout_v2_payments%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_proposal public.cancellation_allocation_proposals_v2%rowtype;
  v_dispute public.service_disputes_v2%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  select * into v_case from public.cancellation_cases_v2 where id = p_cancellation_id for update;
  select * into v_payment from public.checkout_v2_payments where id = v_case.payment_id;
  select * into v_proposal from public.cancellation_allocation_proposals_v2
  where cancellation_id = v_case.id order by revision desc limit 1;
  if not found or p_actor_type = v_proposal.proposer_actor_type
     or (p_actor_type = 'client' and v_payment.client_id <> p_actor_user_id)
     or (p_actor_type = 'provider' and v_payment.provider_id <> p_actor_user_id) then
    raise exception 'Mutual cancellation response is not authorized' using errcode = '42501';
  end if;
  select * into v_workflow from public.workflow_instances where id = v_case.workflow_instance_id for update;
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision,
    case when p_accept then 'cancellation_accept_mutual'
      else 'cancellation_reject_mutual' end,
    p_actor_type, p_actor_user_id, p_reason,
    jsonb_build_object('allocation_proposal_id', v_proposal.id), p_deduplication_key
  );
  if p_accept then
    perform set_config('app.financial_remediation_v2_mutation', 'on', true);
    update public.cancellation_allocation_proposals_v2 set
      accepted_by_actor_type = p_actor_type, accepted_by = p_actor_user_id,
      accepted_at = clock_timestamp() where id = v_proposal.id;
    perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  else
    v_dispute := public.open_service_dispute_v2(
      v_case.payment_id, p_actor_type, p_actor_user_id,
      'cancellation_disagreement', p_reason,
      p_deduplication_key || ':service_dispute'
    );
    perform set_config('app.financial_remediation_v2_mutation', 'on', true);
    update public.service_disputes_v2 set cancellation_id = v_case.id,
      updated_at = clock_timestamp()
    where id = v_dispute.id and cancellation_id is null;
    perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  end if;
  return v_case;
end
$$;

create or replace function public.add_service_dispute_evidence_v2(
  p_dispute_id uuid,
  p_actor_type text,
  p_actor_user_id uuid,
  p_statement text,
  p_attachments jsonb,
  p_deduplication_key text
)
returns public.service_dispute_evidence_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_dispute public.service_disputes_v2%rowtype;
  v_payment public.checkout_v2_payments%rowtype;
  v_evidence public.service_dispute_evidence_v2%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  select * into v_dispute from public.service_disputes_v2 where id = p_dispute_id;
  select * into v_payment from public.checkout_v2_payments where id = v_dispute.payment_id;
  if not found or (p_actor_type = 'client' and v_payment.client_id <> p_actor_user_id)
     or (p_actor_type = 'provider' and v_payment.provider_id <> p_actor_user_id)
     or (p_actor_type = 'admin' and not exists (
       select 1 from public.app_admins where user_id = p_actor_user_id)) then
    raise exception 'Evidence actor is not authorized' using errcode = '42501';
  end if;
  insert into public.service_dispute_evidence_v2 (
    dispute_id, submitted_by_actor_type, submitted_by,
    statement, attachments, deduplication_key
  ) values (
    p_dispute_id, p_actor_type, p_actor_user_id, p_statement,
    coalesce(p_attachments, '[]'::jsonb), p_deduplication_key
  ) on conflict (deduplication_key) do update
    set deduplication_key = excluded.deduplication_key
  returning * into v_evidence;
  return v_evidence;
end
$$;

create or replace function public.decide_service_dispute_v2(
  p_dispute_id uuid,
  p_admin_id uuid,
  p_provider_awarded_gross_amount_cents bigint,
  p_provider_statutory_withholding_amount_cents bigint,
  p_client_tax_allocated_amount_cents bigint,
  p_reason text,
  p_evidence_manifest jsonb,
  p_mfa_authenticated_at timestamptz,
  p_security_policy_version text,
  p_expected_connect_revision bigint,
  p_deduplication_key text
)
returns table (
  decision_id uuid, resolution_id uuid, refund_id uuid,
  reversal_id uuid, provider_transfer_id uuid
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_dispute public.service_disputes_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_decision public.service_dispute_decisions_v2%rowtype;
  v_result record;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  perform public.assert_recent_financial_admin_mfa_v2(
    p_admin_id, p_mfa_authenticated_at, p_security_policy_version
  );
  select * into v_dispute from public.service_disputes_v2 where id = p_dispute_id for update;
  if not found then raise exception 'Service dispute not found' using errcode = 'P0002'; end if;
  select * into v_decision from public.service_dispute_decisions_v2 where dispute_id = p_dispute_id;
  if found then
    return query select v_decision.id, v_decision.resolution_id,
      (select refund.id from public.refunds_v2 refund
       where refund.resolution_id = v_decision.resolution_id),
      (select reversal.id from public.transfer_reversals_v2 reversal
       where reversal.resolution_id = v_decision.resolution_id),
      (select transfer.id from public.provider_transfers_v2 transfer
       where transfer.payment_id = v_dispute.payment_id);
    return;
  end if;
  select * into v_workflow from public.workflow_instances where id = v_dispute.workflow_instance_id for update;
  if v_workflow.current_state = 'evidence_collection' then
    v_workflow := public.transition_workflow_instance(
      v_workflow.id, v_workflow.revision, 'service_dispute_start_review',
      'admin', p_admin_id, 'Administrator started final review.',
      p_evidence_manifest, p_deduplication_key || ':admin_review'
    );
  end if;
  if v_workflow.current_state <> 'admin_review' then
    raise exception 'Service dispute is not ready for decision' using errcode = '23514';
  end if;
  v_workflow := public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'service_dispute_decide',
    'admin', p_admin_id, p_reason,
    jsonb_build_object('provider_awarded_gross_amount_cents',
      p_provider_awarded_gross_amount_cents, 'evidence_manifest', p_evidence_manifest),
    p_deduplication_key || ':decided'
  );
  select * into v_result from public.reserve_financial_resolution_v2(
    v_dispute.payment_id, 'service_dispute', v_dispute.id,
    p_provider_awarded_gross_amount_cents,
    p_provider_statutory_withholding_amount_cents,
    p_client_tax_allocated_amount_cents, p_reason, 'admin', p_admin_id,
    p_mfa_authenticated_at, p_security_policy_version,
    p_expected_connect_revision, p_deduplication_key || ':resolution'
  );
  insert into public.service_dispute_decisions_v2 (
    dispute_id, resolution_id, administrator_id, reason, evidence_manifest,
    mfa_authenticated_at, security_policy_version, deduplication_key
  ) values (
    v_dispute.id, v_result.resolution_id, p_admin_id, p_reason,
    coalesce(p_evidence_manifest, '{}'::jsonb), p_mfa_authenticated_at,
    p_security_policy_version, p_deduplication_key
  ) returning * into v_decision;
  perform set_config('app.financial_remediation_v2_mutation', 'on', true);
  update public.service_disputes_v2 set decision_id = v_decision.id,
    updated_at = clock_timestamp() where id = v_dispute.id;
  perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'service_dispute_execute',
    'system', null, 'The explicit allocation is reserved for execution.',
    jsonb_build_object('resolution_id', v_result.resolution_id),
    p_deduplication_key || ':executing'
  );
  return query select v_decision.id, v_result.resolution_id,
    v_result.refund_id, v_result.reversal_id, v_result.provider_transfer_id;
end
$$;

create or replace function public.reserve_transfer_reversal_dispatch_v2(
  p_reversal_id uuid
)
returns table (
  reversal_id uuid, operation_status text, stripe_transfer_id text,
  amount_cents bigint, currency text, idempotency_key text, attempt_number integer
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reversal public.transfer_reversals_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  select * into v_reversal from public.transfer_reversals_v2 where id = p_reversal_id for update;
  if not found then raise exception 'Transfer reversal not found' using errcode = 'P0002'; end if;
  select * into v_workflow from public.workflow_instances where id = v_reversal.workflow_instance_id for update;
  if v_workflow.current_state in ('fully_recovered', 'partially_recovered', 'retransferred') then
    return query select v_reversal.id, v_workflow.current_state,
      v_reversal.stripe_transfer_id, v_reversal.requested_amount_cents,
      v_reversal.currency, v_reversal.idempotency_key, v_reversal.attempt_count;
    return;
  end if;
  if v_workflow.current_state not in ('requested_provisional', 'requested_final', 'submitted') then
    raise exception 'Transfer reversal is not dispatchable' using errcode = '23514';
  end if;
  return query select v_reversal.id, v_workflow.current_state,
    v_reversal.stripe_transfer_id, v_reversal.requested_amount_cents,
    v_reversal.currency, v_reversal.idempotency_key,
    case when v_workflow.current_state = 'submitted' then v_reversal.attempt_count
      else v_reversal.attempt_count + 1 end;
end
$$;

create or replace function public.mark_transfer_reversal_submitted_v2(p_reversal_id uuid)
returns public.transfer_reversals_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reversal public.transfer_reversals_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into v_reversal from public.transfer_reversals_v2 where id = p_reversal_id for update;
  select * into v_workflow from public.workflow_instances where id = v_reversal.workflow_instance_id for update;
  if v_workflow.current_state = 'submitted' then return v_reversal; end if;
  if v_workflow.current_state not in ('requested_provisional', 'requested_final') then
    raise exception 'Transfer reversal is not reserved' using errcode = '23514';
  end if;
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision,
    case when v_workflow.current_state = 'requested_provisional'
      then 'reversal_submit_provisional' else 'reversal_submit_final' end,
    'system', null, 'Stripe transfer reversal submitted with stable idempotency.',
    jsonb_build_object('idempotency_key', v_reversal.idempotency_key),
    'reversal-v2:' || v_reversal.id::text || ':submitted'
  );
  perform set_config('app.financial_remediation_v2_mutation', 'on', true);
  update public.transfer_reversals_v2 set attempt_count = attempt_count + 1,
    submitted_at = coalesce(submitted_at, clock_timestamp()),
    last_error_code = null, last_error_message = null,
    updated_at = clock_timestamp() where id = p_reversal_id returning * into v_reversal;
  perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  return v_reversal;
end
$$;

create or replace function public.complete_transfer_reversal_v2(
  p_reversal_id uuid,
  p_stripe_reversal_id text,
  p_recovered_amount_cents bigint
)
returns public.transfer_reversals_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reversal public.transfer_reversals_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_batch_id uuid;
  v_stripe_asset uuid;
  v_counter_account uuid;
  v_deficit bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into v_reversal from public.transfer_reversals_v2 where id = p_reversal_id for update;
  select * into v_workflow from public.workflow_instances where id = v_reversal.workflow_instance_id for update;
  if v_workflow.current_state in ('fully_recovered', 'partially_recovered', 'retransferred') then
    if v_reversal.stripe_reversal_id <> p_stripe_reversal_id
       or v_reversal.recovered_amount_cents <> p_recovered_amount_cents then
      raise exception 'Transfer reversal already completed differently' using errcode = '23505';
    end if;
    return v_reversal;
  end if;
  if v_workflow.current_state <> 'submitted'
     or p_recovered_amount_cents <= 0
     or p_recovered_amount_cents > v_reversal.requested_amount_cents then
    raise exception 'Invalid transfer reversal completion' using errcode = '23514';
  end if;
  v_deficit := v_reversal.requested_amount_cents - p_recovered_amount_cents;
  v_stripe_asset := public.get_or_create_financial_ledger_account(
    'stripe_platform_balance', 'asset', 'stripe', null, v_reversal.currency);
  if v_reversal.recovery_type = 'final_refund' then
    v_counter_account := public.get_or_create_financial_ledger_account(
      'provider_recovery_receivable', 'asset', 'provider',
      (select provider_id from public.checkout_v2_payments where id = v_reversal.payment_id),
      v_reversal.currency);
  else
    v_counter_account := public.get_or_create_financial_ledger_account(
      'provider_provisional_recovery_liability', 'liability', 'provider',
      (select provider_id from public.checkout_v2_payments where id = v_reversal.payment_id),
      v_reversal.currency);
  end if;
  insert into public.financial_ledger_batches (
    financial_flow_version, operation_type, operation_key, currency,
    external_reference_type, external_reference_id, actor_type, reason
  ) values (
    'marketplace_v2', 'transfer_reversal_recovered',
    'reversal-v2:' || v_reversal.id::text, v_reversal.currency,
    'stripe_transfer_reversal', p_stripe_reversal_id, 'system',
    case when v_reversal.recovery_type = 'provisional_chargeback'
      then 'Provisional chargeback recovery without final provider liability.'
      else 'Final allocation recovery from an earlier provider transfer.' end
  ) returning id into v_batch_id;
  insert into public.financial_ledger_entries (
    batch_id, line_number, account_id, direction, amount_cents, memo
  ) values
    (v_batch_id, 1, v_stripe_asset, 'debit', p_recovered_amount_cents,
     'Recovered amount returned to the Stripe platform balance.'),
    (v_batch_id, 2, v_counter_account,
     case when v_reversal.recovery_type = 'final_refund' then 'credit' else 'credit' end,
     p_recovered_amount_cents,
     case when v_reversal.recovery_type = 'final_refund'
       then 'Reduce provider recovery receivable.'
       else 'Recognize amount provisionally owed back to provider if Glossed wins.' end);
  perform public.post_financial_ledger_batch(v_batch_id);
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision,
    case when v_deficit = 0 then 'reversal_full' else 'reversal_partial' end,
    'system', null, 'Stripe confirmed transfer reversal recovery.',
    jsonb_build_object('stripe_reversal_id', p_stripe_reversal_id,
      'recovered_amount_cents', p_recovered_amount_cents,
      'recovery_deficit_amount_cents', v_deficit),
    'reversal-v2:' || v_reversal.id::text || ':completed'
  );
  perform set_config('app.financial_remediation_v2_mutation', 'on', true);
  update public.transfer_reversals_v2 set stripe_reversal_id = p_stripe_reversal_id,
    recovered_amount_cents = p_recovered_amount_cents,
    recovery_deficit_amount_cents = v_deficit, completed_at = clock_timestamp(),
    ledger_batch_id = v_batch_id, updated_at = clock_timestamp()
  where id = p_reversal_id returning * into v_reversal;
  if v_reversal.resolution_id is not null then
    update public.financial_resolutions_v2 set status = 'refund_pending'
    where id = v_reversal.resolution_id;
  else
    update public.payment_disputes_v2 set
      provisional_recovered_amount_cents = p_recovered_amount_cents,
      recovery_deficit_amount_cents = v_deficit,
      updated_at = clock_timestamp() where id = v_reversal.payment_dispute_id;
  end if;
  perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  if v_deficit > 0 then
    insert into public.financial_recovery_deficits_v2 (
      payment_id, transfer_reversal_id, deficit_type, amount_cents,
      currency, reason
    ) values (
      v_reversal.payment_id, v_reversal.id, v_reversal.recovery_type,
      v_deficit, v_reversal.currency,
      'Stripe recovered only part of the requested transfer reversal; no future-earnings offset is enabled.'
    ) on conflict (transfer_reversal_id) do nothing;
  end if;
  insert into public.financial_remediation_attempts_v2 (
    operation_type, operation_id, transfer_reversal_id,
    attempt_number, outcome, stripe_object_id
  ) values (
    'transfer_reversal', v_reversal.id, v_reversal.id, v_reversal.attempt_count,
    'succeeded', p_stripe_reversal_id
  ) on conflict (operation_type, operation_id, attempt_number) do nothing;
  insert into public.financial_audit_log (
    financial_flow_version, event_type, entity_type, entity_id, actor_type,
    reason, after_state, evidence, deduplication_key
  ) values (
    'marketplace_v2', 'transfer_reversal.recovered', 'transfer_reversal_v2',
    v_reversal.id::text, 'system',
    'Stripe confirmed provider transfer recovery.',
    jsonb_build_object('recovery_type', v_reversal.recovery_type,
      'requested_amount_cents', v_reversal.requested_amount_cents,
      'recovered_amount_cents', p_recovered_amount_cents,
      'recovery_deficit_amount_cents', v_deficit,
      'currency', v_reversal.currency),
    jsonb_build_object('stripe_reversal_id', p_stripe_reversal_id,
      'ledger_batch_id', v_batch_id),
    'reversal-v2:' || v_reversal.id::text || ':audit:recovered'
  );
  return v_reversal;
end
$$;

create or replace function public.fail_transfer_reversal_v2(
  p_reversal_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
)
returns public.transfer_reversals_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reversal public.transfer_reversals_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into v_reversal from public.transfer_reversals_v2 where id = p_reversal_id for update;
  select * into v_workflow from public.workflow_instances where id = v_reversal.workflow_instance_id for update;
  if v_workflow.current_state in ('fully_recovered', 'partially_recovered', 'failed', 'retransferred') then
    return v_reversal;
  end if;
  if v_workflow.current_state <> 'submitted' then
    raise exception 'Transfer reversal is not submitted' using errcode = '23514';
  end if;
  if not p_retryable then
    perform public.transition_workflow_instance(
      v_workflow.id, v_workflow.revision, 'reversal_fail', 'system', null,
      p_error_message, jsonb_build_object('error_code', p_error_code),
      'reversal-v2:' || v_reversal.id::text || ':failed'
    );
  end if;
  perform set_config('app.financial_remediation_v2_mutation', 'on', true);
  update public.transfer_reversals_v2 set last_error_code = p_error_code,
    last_error_message = p_error_message,
    recovery_deficit_amount_cents = case when p_retryable
      then recovery_deficit_amount_cents else requested_amount_cents end,
    completed_at = case when p_retryable then completed_at else clock_timestamp() end,
    updated_at = clock_timestamp() where id = p_reversal_id returning * into v_reversal;
  if not p_retryable and v_reversal.resolution_id is not null then
    update public.financial_resolutions_v2 set status = 'refund_pending'
    where id = v_reversal.resolution_id;
  elsif not p_retryable then
    update public.payment_disputes_v2 set
      recovery_deficit_amount_cents = v_reversal.requested_amount_cents,
      updated_at = clock_timestamp() where id = v_reversal.payment_dispute_id;
  end if;
  perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  insert into public.financial_remediation_attempts_v2 (
    operation_type, operation_id, transfer_reversal_id, attempt_number, outcome,
    error_code, error_message
  ) values (
    'transfer_reversal', v_reversal.id, v_reversal.id, v_reversal.attempt_count,
    case when p_retryable then 'retryable_failure' else 'manual_review' end,
    p_error_code, p_error_message
  ) on conflict (operation_type, operation_id, attempt_number) do nothing;
  if not p_retryable then
    insert into public.financial_recovery_deficits_v2 (
      payment_id, transfer_reversal_id, deficit_type, amount_cents,
      currency, reason
    ) values (
      v_reversal.payment_id, v_reversal.id, v_reversal.recovery_type,
      v_reversal.requested_amount_cents, v_reversal.currency,
      'Stripe could not recover the provider transfer; Glossed advances the client obligation and no future-earnings offset is enabled.'
    ) on conflict (transfer_reversal_id) do nothing;
  end if;
  insert into public.financial_audit_log (
    financial_flow_version, event_type, entity_type, entity_id, actor_type,
    reason, after_state, evidence, deduplication_key
  ) values (
    'marketplace_v2', case when p_retryable
      then 'transfer_reversal.retryable_failure'
      else 'transfer_reversal.recovery_deficit' end,
    'transfer_reversal_v2', v_reversal.id::text, 'system', p_error_message,
    jsonb_build_object('requested_amount_cents', v_reversal.requested_amount_cents,
      'recovery_deficit_amount_cents', v_reversal.recovery_deficit_amount_cents,
      'future_earnings_offset_enabled', false),
    jsonb_build_object('error_code', p_error_code),
    'reversal-v2:' || v_reversal.id::text || ':audit:failure:'
      || v_reversal.attempt_count::text
  ) on conflict (deduplication_key) do nothing;
  return v_reversal;
end
$$;

create or replace function public.reserve_refund_dispatch_v2(p_refund_id uuid)
returns table (
  refund_id uuid, operation_status text, stripe_payment_intent_id text,
  amount_cents bigint, currency text, idempotency_key text, attempt_number integer
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_refund public.refunds_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_reversal public.transfer_reversals_v2%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  select * into v_refund from public.refunds_v2 where id = p_refund_id for update;
  if not found then raise exception 'Refund not found' using errcode = 'P0002'; end if;
  select * into v_workflow from public.workflow_instances where id = v_refund.workflow_instance_id for update;
  select * into v_reversal from public.transfer_reversals_v2 where resolution_id = v_refund.resolution_id;
  if found and v_reversal.completed_at is null and v_reversal.last_error_code is null then
    raise exception 'Transfer recovery must be attempted before refund' using errcode = '55000';
  end if;
  if v_workflow.current_state = 'succeeded' then
    return query select v_refund.id, 'succeeded'::text,
      v_refund.stripe_payment_intent_id, v_refund.amount_cents,
      v_refund.currency, v_refund.idempotency_key, v_refund.attempt_count;
    return;
  end if;
  if v_workflow.current_state = 'failed_retryable' then
    perform public.transition_workflow_instance(
      v_workflow.id, v_workflow.revision, 'refund_retry', 'system', null,
      'Retry customer refund with the same operation identity.', '{}'::jsonb,
      'refund-v2:' || v_refund.id::text || ':retry:' || (v_refund.attempt_count + 1)::text
    );
    select * into v_workflow from public.workflow_instances where id = v_refund.workflow_instance_id;
  end if;
  if v_workflow.current_state not in ('authorized', 'recovery_attempted', 'submitted') then
    raise exception 'Refund is not dispatchable' using errcode = '23514';
  end if;
  return query select v_refund.id, v_workflow.current_state,
    v_refund.stripe_payment_intent_id, v_refund.amount_cents,
    v_refund.currency, v_refund.idempotency_key,
    case when v_workflow.current_state = 'submitted' then v_refund.attempt_count
      else v_refund.attempt_count + 1 end;
end
$$;

create or replace function public.mark_refund_submitted_v2(p_refund_id uuid)
returns public.refunds_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_refund public.refunds_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into v_refund from public.refunds_v2 where id = p_refund_id for update;
  select * into v_workflow from public.workflow_instances where id = v_refund.workflow_instance_id for update;
  if v_workflow.current_state = 'submitted' then return v_refund; end if;
  if v_workflow.current_state not in ('authorized', 'recovery_attempted') then
    raise exception 'Refund is not reserved' using errcode = '23514';
  end if;
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision,
    case when v_workflow.current_state = 'authorized'
      then 'refund_submit_without_transfer' else 'refund_submit_after_recovery' end,
    'system', null, 'Stripe refund submitted; client refund is not conditional on recovery.',
    jsonb_build_object('idempotency_key', v_refund.idempotency_key),
    'refund-v2:' || v_refund.id::text || ':submitted:' || (v_refund.attempt_count + 1)::text
  );
  perform set_config('app.financial_remediation_v2_mutation', 'on', true);
  update public.refunds_v2 set attempt_count = attempt_count + 1,
    submitted_at = coalesce(submitted_at, clock_timestamp()),
    last_error_code = null, last_error_message = null, updated_at = clock_timestamp()
  where id = p_refund_id returning * into v_refund;
  perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  return v_refund;
end
$$;

create or replace function public.complete_refund_v2(
  p_refund_id uuid,
  p_stripe_refund_id text,
  p_refunded_amount_cents bigint
)
returns public.refunds_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_refund public.refunds_v2%rowtype;
  v_payment public.checkout_v2_payments%rowtype;
  v_refund_workflow public.workflow_instances%rowtype;
  v_payment_workflow public.workflow_instances%rowtype;
  v_batch_id uuid;
  v_refund_payable uuid;
  v_stripe_asset uuid;
  v_total_refunded bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into v_refund from public.refunds_v2 where id = p_refund_id for update;
  select * into v_refund_workflow from public.workflow_instances where id = v_refund.workflow_instance_id for update;
  if v_refund_workflow.current_state = 'succeeded' then
    if v_refund.stripe_refund_id <> p_stripe_refund_id then
      raise exception 'Refund already completed with another Stripe identity' using errcode = '23505';
    end if;
    return v_refund;
  end if;
  if v_refund_workflow.current_state <> 'submitted'
     or p_refunded_amount_cents <> v_refund.amount_cents then
    raise exception 'Invalid Stripe refund completion' using errcode = '23514';
  end if;
  select * into v_payment from public.checkout_v2_payments where id = v_refund.payment_id for update;
  select * into v_payment_workflow from public.workflow_instances where id = v_payment.workflow_instance_id for update;
  v_refund_payable := public.get_or_create_financial_ledger_account(
    'client_refund_payable', 'liability', 'client', v_payment.client_id, v_refund.currency);
  v_stripe_asset := public.get_or_create_financial_ledger_account(
    'stripe_platform_balance', 'asset', 'stripe', null, v_refund.currency);
  insert into public.financial_ledger_batches (
    financial_flow_version, operation_type, operation_key, currency,
    external_reference_type, external_reference_id, actor_type, reason
  ) values (
    'marketplace_v2', 'client_refund_succeeded',
    'refund-v2:' || v_refund.id::text, v_refund.currency,
    'stripe_refund', p_stripe_refund_id, 'system',
    'Stripe confirmed the customer refund independently of provider recovery.'
  ) returning id into v_batch_id;
  insert into public.financial_ledger_entries (
    batch_id, line_number, account_id, direction, amount_cents, memo
  ) values
    (v_batch_id, 1, v_refund_payable, 'debit', v_refund.amount_cents,
     'Settle client refund payable.'),
    (v_batch_id, 2, v_stripe_asset, 'credit', v_refund.amount_cents,
     'Reduce Stripe platform balance by customer refund.');
  perform public.post_financial_ledger_batch(v_batch_id);
  perform public.transition_workflow_instance(
    v_refund_workflow.id, v_refund_workflow.revision, 'refund_succeed',
    'system', null, 'Stripe confirmed customer refund.',
    jsonb_build_object('stripe_refund_id', p_stripe_refund_id,
      'ledger_batch_id', v_batch_id),
    'refund-v2:' || v_refund.id::text || ':succeeded'
  );
  select coalesce(sum(amount_cents), 0) + v_refund.amount_cents into v_total_refunded
  from public.refunds_v2 where payment_id = v_payment.id and succeeded_at is not null;
  if v_payment_workflow.current_state = 'paid' then
    perform public.transition_workflow_instance(
      v_payment_workflow.id, v_payment_workflow.revision,
      case when v_total_refunded >= v_payment.amount_total_cents
        then 'payment_full_refund' else 'payment_partial_refund' end,
      'system', null, 'Stripe confirmed refund against the v2 platform payment.',
      jsonb_build_object('stripe_refund_id', p_stripe_refund_id,
        'cumulative_refunded_amount_cents', v_total_refunded),
      'refund-v2:' || v_refund.id::text || ':payment'
    );
  elsif v_payment_workflow.current_state = 'partially_refunded'
        and v_total_refunded >= v_payment.amount_total_cents then
    perform public.transition_workflow_instance(
      v_payment_workflow.id, v_payment_workflow.revision,
      'payment_complete_remaining_refund', 'system', null,
      'Stripe confirmed the remaining refund.',
      jsonb_build_object('stripe_refund_id', p_stripe_refund_id),
      'refund-v2:' || v_refund.id::text || ':payment'
    );
  end if;
  perform set_config('app.financial_remediation_v2_mutation', 'on', true);
  update public.refunds_v2 set stripe_refund_id = p_stripe_refund_id,
    succeeded_at = clock_timestamp(), ledger_batch_id = v_batch_id,
    updated_at = clock_timestamp() where id = p_refund_id returning * into v_refund;
  update public.financial_resolutions_v2 set status = 'completed',
    completed_at = clock_timestamp() where id = v_refund.resolution_id;
  perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  insert into public.financial_remediation_attempts_v2 (
    operation_type, operation_id, refund_id, attempt_number, outcome, stripe_object_id
  ) values ('refund', v_refund.id, v_refund.id, v_refund.attempt_count, 'succeeded', p_stripe_refund_id)
  on conflict (operation_type, operation_id, attempt_number) do nothing;
  insert into public.financial_audit_log (
    financial_flow_version, event_type, entity_type, entity_id, actor_type,
    reason, after_state, evidence, deduplication_key
  ) values (
    'marketplace_v2', 'refund.succeeded', 'refund_v2', v_refund.id::text,
    'system', 'Stripe confirmed customer refund.',
    jsonb_build_object('amount_cents', v_refund.amount_cents,
      'currency', v_refund.currency, 'stripe_refund_id', p_stripe_refund_id),
    jsonb_build_object('ledger_batch_id', v_batch_id),
    'refund-v2:' || v_refund.id::text || ':audit'
  );
  return v_refund;
end
$$;

create or replace function public.fail_refund_v2(
  p_refund_id uuid, p_error_code text, p_error_message text, p_retryable boolean
)
returns public.refunds_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_refund public.refunds_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into v_refund from public.refunds_v2 where id = p_refund_id for update;
  select * into v_workflow from public.workflow_instances where id = v_refund.workflow_instance_id for update;
  if v_workflow.current_state in ('succeeded', 'failed_retryable', 'manual_review') then return v_refund; end if;
  if v_workflow.current_state <> 'submitted' then raise exception 'Refund is not submitted' using errcode = '23514'; end if;
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision,
    case when p_retryable then 'refund_fail_retryable' else 'refund_manual_from_submitted' end,
    'system', null, p_error_message, jsonb_build_object('error_code', p_error_code),
    'refund-v2:' || v_refund.id::text || ':failure:' || v_refund.attempt_count::text
  );
  perform set_config('app.financial_remediation_v2_mutation', 'on', true);
  update public.refunds_v2 set last_error_code = p_error_code,
    last_error_message = p_error_message, updated_at = clock_timestamp()
  where id = p_refund_id returning * into v_refund;
  if not p_retryable then update public.financial_resolutions_v2 set status = 'manual_review'
    where id = v_refund.resolution_id; end if;
  perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  insert into public.financial_remediation_attempts_v2 (
    operation_type, operation_id, refund_id, attempt_number, outcome, error_code, error_message
  ) values (
    'refund', v_refund.id, v_refund.id, v_refund.attempt_count,
    case when p_retryable then 'retryable_failure' else 'manual_review' end,
    p_error_code, p_error_message
  ) on conflict (operation_type, operation_id, attempt_number) do nothing;
  return v_refund;
end
$$;

create or replace function public.record_refund_submission_v2(
  p_refund_id uuid, p_stripe_refund_id text
)
returns public.refunds_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_refund public.refunds_v2%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into v_refund from public.refunds_v2 where id = p_refund_id for update;
  if v_refund.stripe_refund_id is not null and v_refund.stripe_refund_id <> p_stripe_refund_id then
    raise exception 'Refund already has another Stripe identity' using errcode = '23505';
  end if;
  perform set_config('app.financial_remediation_v2_mutation', 'on', true);
  update public.refunds_v2 set stripe_refund_id = p_stripe_refund_id,
    updated_at = clock_timestamp() where id = p_refund_id returning * into v_refund;
  perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  return v_refund;
end
$$;

create or replace function public.process_payment_dispute_v2_event(
  p_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz,
  p_stripe_dispute_id text,
  p_stripe_charge_id text,
  p_stripe_status text,
  p_reason_code text,
  p_amount_debited_cents bigint,
  p_stripe_dispute_fee_amount_cents bigint,
  p_currency text,
  p_risk_details jsonb,
  p_payload_summary jsonb
)
returns table (
  payment_dispute_id uuid, reversal_id uuid,
  retransfer_reversal_id uuid, duplicate boolean, outcome text
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_event public.stripe_financial_v2_webhook_events%rowtype;
  v_payment public.checkout_v2_payments%rowtype;
  v_dispute public.payment_disputes_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_transfer public.provider_transfers_v2%rowtype;
  v_reversal public.transfer_reversals_v2%rowtype;
  v_reversal_workflow public.workflow_instances%rowtype;
  v_batch_id uuid;
  v_stripe_asset uuid;
  v_at_risk uuid;
  v_fee_expense uuid;
  v_target bigint := 0;
  v_outcome text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  select * into v_event from public.stripe_financial_v2_webhook_events where event_id = p_event_id;
  if found then
    return query select
      (select id from public.payment_disputes_v2 where stripe_dispute_id = p_stripe_dispute_id),
      (select reversal.id from public.transfer_reversals_v2 reversal
       where reversal.payment_dispute_id =
        (select id from public.payment_disputes_v2 where stripe_dispute_id = p_stripe_dispute_id)),
      null::uuid, true, v_event.outcome;
    return;
  end if;
  select * into v_payment from public.checkout_v2_payments
  where stripe_charge_id = p_stripe_charge_id for update;
  if not found then
    insert into public.stripe_financial_v2_webhook_events values (
      p_event_id, p_event_type, p_stripe_created_at, p_stripe_dispute_id,
      null, false, 'not_v2_payment', coalesce(p_payload_summary, '{}'::jsonb), now()
    );
    return query select null::uuid, null::uuid, null::uuid, false, 'not_v2_payment'::text;
    return;
  end if;
  if lower(p_currency) <> v_payment.currency
     or p_amount_debited_cents <= 0
     or p_amount_debited_cents > v_payment.amount_total_cents
     or coalesce(p_stripe_dispute_fee_amount_cents, 0) < 0 then
    raise exception 'Stripe dispute does not match the v2 payment' using errcode = '23514';
  end if;
  select * into v_dispute from public.payment_disputes_v2
  where stripe_dispute_id = p_stripe_dispute_id for update;
  if not found then
    v_dispute.id := gen_random_uuid();
    v_workflow := public.create_workflow_instance(
      'payment_dispute', 'v1', v_dispute.id, 'marketplace_v2', 'system', null,
      'Signed Stripe webhook opened a banking dispute.',
      jsonb_build_object('stripe_dispute_id', p_stripe_dispute_id),
      'payment-dispute-v2:' || p_stripe_dispute_id || ':workflow'
    );
    select * into v_transfer from public.provider_transfers_v2
    where payment_id = v_payment.id and succeeded_at is not null;
    if found then
      v_target := least(v_transfer.amount_cents,
        round(v_transfer.amount_cents::numeric * p_amount_debited_cents::numeric
          / v_payment.amount_total_cents::numeric)::bigint);
    end if;
    insert into public.payment_disputes_v2 (
      id, payment_id, workflow_instance_id, stripe_dispute_id, stripe_charge_id,
      amount_debited_cents, stripe_dispute_fee_amount_cents, currency,
      stripe_status, reason_code, risk_details,
      provisional_recovery_target_amount_cents, opened_at
    ) values (
      v_dispute.id, v_payment.id, v_workflow.id, p_stripe_dispute_id,
      p_stripe_charge_id, p_amount_debited_cents,
      p_stripe_dispute_fee_amount_cents, lower(p_currency), p_stripe_status,
      p_reason_code, coalesce(p_risk_details, '{}'::jsonb), v_target,
      p_stripe_created_at
    ) returning * into v_dispute;
    v_workflow := public.transition_workflow_instance(
      v_workflow.id, v_workflow.revision, 'payment_dispute_open',
      'system', null, 'Signed Stripe webhook opened a banking dispute.',
      jsonb_build_object('stripe_event_id', p_event_id,
        'amount_debited_cents', p_amount_debited_cents,
        'stripe_dispute_fee_amount_cents', p_stripe_dispute_fee_amount_cents),
      'payment-dispute-v2:' || p_stripe_dispute_id || ':opened'
    );
    perform public.open_checkout_v2_financial_hold(
      v_payment.id, 'payment_dispute', v_dispute.id::text,
      'Stripe banking dispute blocks release and new provider transfer.',
      'system', null, 'payment-dispute-v2:' || p_stripe_dispute_id || ':hold'
    );
    v_stripe_asset := public.get_or_create_financial_ledger_account(
      'stripe_platform_balance', 'asset', 'stripe', null, v_payment.currency);
    v_at_risk := public.get_or_create_financial_ledger_account(
      'payment_dispute_at_risk', 'asset', 'platform', null, v_payment.currency);
    if coalesce(p_stripe_dispute_fee_amount_cents, 0) > 0 then
      v_fee_expense := public.get_or_create_financial_ledger_account(
        'stripe_dispute_fee_expense', 'expense', 'platform', null, v_payment.currency);
    end if;
    insert into public.financial_ledger_batches (
      financial_flow_version, operation_type, operation_key, currency,
      external_reference_type, external_reference_id, actor_type, reason
    ) values (
      'marketplace_v2', 'payment_dispute_opened',
      'payment-dispute-v2:' || p_stripe_dispute_id || ':opened', v_payment.currency,
      'stripe_dispute', p_stripe_dispute_id, 'stripe_webhook',
      'Stripe debited the platform for a banking dispute and its fee.'
    ) returning id into v_batch_id;
    insert into public.financial_ledger_entries (
      batch_id, line_number, account_id, direction, amount_cents, memo
    ) values
      (v_batch_id, 1, v_at_risk, 'debit', p_amount_debited_cents,
       'Record disputed principal financially at risk.'),
      (v_batch_id, 2, v_stripe_asset, 'credit', p_amount_debited_cents,
       'Record Stripe debit for disputed principal.');
    if coalesce(p_stripe_dispute_fee_amount_cents, 0) > 0 then
      insert into public.financial_ledger_entries (
        batch_id, line_number, account_id, direction, amount_cents, memo
      ) values
        (v_batch_id, 3, v_fee_expense, 'debit', p_stripe_dispute_fee_amount_cents,
         'Stripe dispute fee borne by Glossed.'),
        (v_batch_id, 4, v_stripe_asset, 'credit', p_stripe_dispute_fee_amount_cents,
         'Reduce Stripe platform balance by dispute fee.');
    end if;
    perform public.post_financial_ledger_batch(v_batch_id);
    perform set_config('app.financial_remediation_v2_mutation', 'on', true);
    update public.payment_disputes_v2 set opened_ledger_batch_id = v_batch_id
    where id = v_dispute.id returning * into v_dispute;
    perform set_config('app.financial_remediation_v2_mutation', 'off', true);
    if v_target > 0 then
      v_reversal.id := gen_random_uuid();
      v_reversal_workflow := public.create_workflow_instance(
        'transfer_reversal', 'v1', v_reversal.id, 'marketplace_v2', 'system', null,
        'Banking dispute requests provisional provider recovery only.',
        jsonb_build_object('payment_dispute_id', v_dispute.id),
        'payment-dispute-v2:' || p_stripe_dispute_id || ':reversal_workflow'
      );
      insert into public.transfer_reversals_v2 (
        id, payment_id, provider_transfer_id, payment_dispute_id,
        workflow_instance_id, recovery_type, requested_amount_cents,
        recovery_deficit_amount_cents, currency, stripe_transfer_id,
        idempotency_key, retransfer_idempotency_key
      ) values (
        v_reversal.id, v_payment.id, v_transfer.id, v_dispute.id,
        v_reversal_workflow.id, 'provisional_chargeback', v_target, v_target,
        v_payment.currency, v_transfer.stripe_transfer_id,
        'reversal-v2:dispute:' || p_stripe_dispute_id,
        'retransfer-v2:dispute:' || p_stripe_dispute_id
      ) returning * into v_reversal;
      perform public.transition_workflow_instance(
        v_reversal_workflow.id, v_reversal_workflow.revision,
        'reversal_request_provisional', 'system', null,
        'Immediate provisional recovery protects liquidity without assigning final liability.',
        jsonb_build_object('requested_amount_cents', v_target),
        'payment-dispute-v2:' || p_stripe_dispute_id || ':reversal_requested'
      );
      perform public.transition_workflow_instance(
        v_workflow.id, v_workflow.revision,
        'payment_dispute_recover_provisionally', 'system', null,
        'Provisional transfer reversal requested.',
        jsonb_build_object('transfer_reversal_id', v_reversal.id),
        'payment-dispute-v2:' || p_stripe_dispute_id || ':provisional_recovery'
      );
    else
      perform public.transition_workflow_instance(
        v_workflow.id, v_workflow.revision,
        'payment_dispute_collect_from_open', 'system', null,
        'No recoverable provider transfer exists; collect evidence.', '{}'::jsonb,
        'payment-dispute-v2:' || p_stripe_dispute_id || ':evidence_collection'
      );
    end if;
    v_outcome := 'opened';
  else
    select * into v_workflow from public.workflow_instances where id = v_dispute.workflow_instance_id for update;
    perform set_config('app.financial_remediation_v2_mutation', 'on', true);
    update public.payment_disputes_v2 set stripe_status = p_stripe_status,
      reason_code = coalesce(p_reason_code, reason_code),
      risk_details = risk_details || coalesce(p_risk_details, '{}'::jsonb),
      updated_at = clock_timestamp() where id = v_dispute.id returning * into v_dispute;
    perform set_config('app.financial_remediation_v2_mutation', 'off', true);
    select * into v_reversal from public.transfer_reversals_v2 reversal
    where reversal.payment_dispute_id = v_dispute.id;
    if p_stripe_status = 'won' and v_workflow.current_state not in ('won', 'resolved') then
      v_stripe_asset := public.get_or_create_financial_ledger_account(
        'stripe_platform_balance', 'asset', 'stripe', null, v_payment.currency);
      v_at_risk := public.get_or_create_financial_ledger_account(
        'payment_dispute_at_risk', 'asset', 'platform', null, v_payment.currency);
      insert into public.financial_ledger_batches (
        financial_flow_version, operation_type, operation_key, currency,
        external_reference_type, external_reference_id, actor_type, reason
      ) values (
        'marketplace_v2', 'payment_dispute_won',
        'payment-dispute-v2:' || p_stripe_dispute_id || ':won', v_payment.currency,
        'stripe_dispute', p_stripe_dispute_id || ':won', 'stripe_webhook',
        'Stripe returned disputed principal to Glossed.'
      ) returning id into v_batch_id;
      insert into public.financial_ledger_entries (
        batch_id, line_number, account_id, direction, amount_cents, memo
      ) values
        (v_batch_id, 1, v_stripe_asset, 'debit', v_dispute.amount_debited_cents,
         'Stripe returned won dispute principal.'),
        (v_batch_id, 2, v_at_risk, 'credit', v_dispute.amount_debited_cents,
         'Clear disputed principal at risk.');
      perform public.post_financial_ledger_batch(v_batch_id);
      perform public.transition_workflow_instance(
        v_workflow.id, v_workflow.revision,
        case v_workflow.current_state
          when 'open' then 'payment_dispute_won_from_open'
          when 'provisional_recovery' then 'payment_dispute_won_from_recovery'
          when 'evidence_collection' then 'payment_dispute_won_from_evidence'
          else 'payment_dispute_won' end,
        'system', null, 'Signed Stripe webhook reported a dispute victory.',
        jsonb_build_object('stripe_event_id', p_event_id),
        'payment-dispute-v2:' || p_stripe_dispute_id || ':won_transition'
      );
      perform set_config('app.financial_remediation_v2_mutation', 'on', true);
      update public.payment_disputes_v2 set won_ledger_batch_id = v_batch_id,
        resolved_at = case when coalesce(v_dispute.provisional_recovered_amount_cents, 0) = 0
          then clock_timestamp() else null end,
        updated_at = clock_timestamp() where id = v_dispute.id returning * into v_dispute;
      perform set_config('app.financial_remediation_v2_mutation', 'off', true);
      if coalesce(v_dispute.provisional_recovered_amount_cents, 0) = 0 then
        select * into v_workflow from public.workflow_instances where id = v_dispute.workflow_instance_id;
        perform public.transition_workflow_instance(
          v_workflow.id, v_workflow.revision, 'payment_dispute_resolve_win',
          'system', null, 'Won dispute required no provider retransfer.', '{}'::jsonb,
          'payment-dispute-v2:' || p_stripe_dispute_id || ':resolved'
        );
      end if;
      v_outcome := 'won';
    elsif p_stripe_status = 'lost' and v_workflow.current_state not in ('lost', 'liability_admin_review', 'resolved') then
      perform public.transition_workflow_instance(
        v_workflow.id, v_workflow.revision,
        case v_workflow.current_state
          when 'open' then 'payment_dispute_lost_from_open'
          when 'provisional_recovery' then 'payment_dispute_lost_from_recovery'
          when 'evidence_collection' then 'payment_dispute_lost_from_evidence'
          else 'payment_dispute_lost' end,
        'system', null, 'Signed Stripe webhook reported a dispute loss.',
        jsonb_build_object('stripe_event_id', p_event_id),
        'payment-dispute-v2:' || p_stripe_dispute_id || ':lost_transition'
      );
      select * into v_workflow from public.workflow_instances where id = v_dispute.workflow_instance_id;
      perform public.transition_workflow_instance(
        v_workflow.id, v_workflow.revision, 'payment_dispute_review_liability',
        'system', null,
        'No provider liability is inferred without a validated policy or decision.',
        '{}'::jsonb, 'payment-dispute-v2:' || p_stripe_dispute_id || ':liability_review'
      );
      v_outcome := 'lost_admin_review';
    else
      v_outcome := 'updated';
    end if;
  end if;
  insert into public.stripe_financial_v2_webhook_events values (
    p_event_id, p_event_type, p_stripe_created_at, p_stripe_dispute_id,
    v_payment.id, true, v_outcome, coalesce(p_payload_summary, '{}'::jsonb), now()
  );
  insert into public.financial_audit_log (
    financial_flow_version, event_type, entity_type, entity_id, actor_type,
    reason, after_state, evidence, deduplication_key
  ) values (
    'marketplace_v2', 'payment_dispute.' || v_outcome,
    'payment_dispute_v2', v_dispute.id::text, 'stripe_webhook',
    'Signed Stripe webhook synchronized the banking dispute.',
    jsonb_build_object('stripe_status', p_stripe_status,
      'amount_debited_cents', p_amount_debited_cents,
      'stripe_dispute_fee_amount_cents', p_stripe_dispute_fee_amount_cents,
      'provisional_recovery_target_amount_cents',
      v_dispute.provisional_recovery_target_amount_cents),
    jsonb_build_object('stripe_event_id', p_event_id,
      'stripe_dispute_id', p_stripe_dispute_id),
    'payment-dispute-v2:event:' || p_event_id || ':audit'
  );
  return query select v_dispute.id, v_reversal.id,
    case when p_stripe_status = 'won' and v_reversal.recovered_amount_cents > 0
      then v_reversal.id else null end, false, v_outcome;
end
$$;

create or replace function public.reserve_provider_retransfer_v2(
  p_reversal_id uuid, p_expected_connect_revision bigint
)
returns table (
  reversal_id uuid, amount_cents bigint, currency text,
  destination_account_id text, source_transaction_charge_id text,
  idempotency_key text
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reversal public.transfer_reversals_v2%rowtype;
  v_dispute public.payment_disputes_v2%rowtype;
  v_payment public.checkout_v2_payments%rowtype;
  v_connect public.provider_connect_accounts%rowtype;
  v_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  select * into v_reversal from public.transfer_reversals_v2 where id = p_reversal_id for update;
  if v_reversal.recovery_type <> 'provisional_chargeback' then
    raise exception 'Only provisional recovery can be retransferred' using errcode = '23514';
  end if;
  if v_reversal.retransferred_at is not null then
    return query select v_reversal.id, v_reversal.recovered_amount_cents,
      v_reversal.currency, (select stripe_account_id from public.provider_transfers_v2
        where id = v_reversal.provider_transfer_id),
      (select stripe_charge_id from public.checkout_v2_payments where id = v_reversal.payment_id),
      v_reversal.retransfer_idempotency_key;
    return;
  end if;
  select * into v_dispute from public.payment_disputes_v2 where id = v_reversal.payment_dispute_id;
  if v_dispute.stripe_status <> 'won' or v_reversal.recovered_amount_cents <= 0 then
    raise exception 'Dispute victory and provisional recovery are required' using errcode = '23514';
  end if;
  select * into v_payment from public.checkout_v2_payments where id = v_reversal.payment_id;
  select * into v_connect from public.provider_connect_accounts
  where provider_id = v_payment.provider_id for update;
  if not found or v_connect.revision <> p_expected_connect_revision
     or v_connect.closed or not v_connect.connection_enabled
     or v_connect.stripe_transfers_status <> 'active' then
    raise exception 'Current Connect capability blocks provider retransfer' using errcode = '55000';
  end if;
  select * into v_workflow from public.workflow_instances where id = v_reversal.workflow_instance_id;
  if v_workflow.current_state not in ('fully_recovered', 'partially_recovered') then
    raise exception 'Provisional recovery is not ready for retransfer' using errcode = '23514';
  end if;
  return query select v_reversal.id, v_reversal.recovered_amount_cents,
    v_reversal.currency, v_connect.stripe_account_id, v_payment.stripe_charge_id,
    v_reversal.retransfer_idempotency_key;
end
$$;

create or replace function public.complete_provider_retransfer_v2(
  p_reversal_id uuid, p_stripe_retransfer_id text
)
returns public.transfer_reversals_v2
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reversal public.transfer_reversals_v2%rowtype;
  v_dispute public.payment_disputes_v2%rowtype;
  v_payment public.checkout_v2_payments%rowtype;
  v_reversal_workflow public.workflow_instances%rowtype;
  v_dispute_workflow public.workflow_instances%rowtype;
  v_batch_id uuid;
  v_liability uuid;
  v_stripe_asset uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into v_reversal from public.transfer_reversals_v2 where id = p_reversal_id for update;
  if v_reversal.retransferred_at is not null then
    if v_reversal.stripe_retransfer_id <> p_stripe_retransfer_id then
      raise exception 'Provider retransfer already completed differently' using errcode = '23505';
    end if;
    return v_reversal;
  end if;
  select * into v_dispute from public.payment_disputes_v2 where id = v_reversal.payment_dispute_id for update;
  select * into v_payment from public.checkout_v2_payments where id = v_reversal.payment_id;
  select * into v_reversal_workflow from public.workflow_instances
  where id = v_reversal.workflow_instance_id for update;
  if v_dispute.stripe_status <> 'won'
     or v_reversal_workflow.current_state not in ('fully_recovered', 'partially_recovered') then
    raise exception 'Provider retransfer is not authorized' using errcode = '23514';
  end if;
  v_liability := public.get_or_create_financial_ledger_account(
    'provider_provisional_recovery_liability', 'liability', 'provider',
    v_payment.provider_id, v_reversal.currency);
  v_stripe_asset := public.get_or_create_financial_ledger_account(
    'stripe_platform_balance', 'asset', 'stripe', null, v_reversal.currency);
  insert into public.financial_ledger_batches (
    financial_flow_version, operation_type, operation_key, currency,
    external_reference_type, external_reference_id, actor_type, reason
  ) values (
    'marketplace_v2', 'provider_provisional_recovery_retransferred',
    'retransfer-v2:' || v_reversal.id::text, v_reversal.currency,
    'stripe_transfer', p_stripe_retransfer_id, 'system',
    'Won banking dispute returns provisional recovery to the provider.'
  ) returning id into v_batch_id;
  insert into public.financial_ledger_entries (
    batch_id, line_number, account_id, direction, amount_cents, memo
  ) values
    (v_batch_id, 1, v_liability, 'debit', v_reversal.recovered_amount_cents,
     'Settle provisional amount owed back to provider.'),
    (v_batch_id, 2, v_stripe_asset, 'credit', v_reversal.recovered_amount_cents,
     'Reduce Stripe platform balance by provider retransfer.');
  perform public.post_financial_ledger_batch(v_batch_id);
  perform public.transition_workflow_instance(
    v_reversal_workflow.id, v_reversal_workflow.revision,
    case when v_reversal_workflow.current_state = 'fully_recovered'
      then 'reversal_retransfer_full' else 'reversal_retransfer_partial' end,
    'system', null, 'Provider provisional recovery retransferred after dispute victory.',
    jsonb_build_object('stripe_retransfer_id', p_stripe_retransfer_id),
    'retransfer-v2:' || v_reversal.id::text || ':completed'
  );
  select * into v_dispute_workflow from public.workflow_instances
  where id = v_dispute.workflow_instance_id for update;
  perform public.transition_workflow_instance(
    v_dispute_workflow.id, v_dispute_workflow.revision,
    'payment_dispute_resolve_win', 'system', null,
    'Won dispute reconciled and provisional recovery returned.',
    jsonb_build_object('stripe_retransfer_id', p_stripe_retransfer_id),
    'payment-dispute-v2:' || v_dispute.stripe_dispute_id || ':resolved'
  );
  perform set_config('app.financial_remediation_v2_mutation', 'on', true);
  update public.transfer_reversals_v2 set stripe_retransfer_id = p_stripe_retransfer_id,
    retransfer_ledger_batch_id = v_batch_id, retransferred_at = clock_timestamp(),
    updated_at = clock_timestamp() where id = p_reversal_id returning * into v_reversal;
  update public.payment_disputes_v2 set
    provider_retransferred_amount_cents = v_reversal.recovered_amount_cents,
    resolved_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = v_dispute.id;
  perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  insert into public.financial_remediation_attempts_v2 (
    operation_type, operation_id, transfer_reversal_id,
    attempt_number, outcome, stripe_object_id
  ) values (
    'provider_retransfer', v_reversal.id, v_reversal.id, 1,
    'succeeded', p_stripe_retransfer_id
  ) on conflict (operation_type, operation_id, attempt_number) do nothing;
  insert into public.financial_audit_log (
    financial_flow_version, event_type, entity_type, entity_id, actor_type,
    reason, after_state, evidence, deduplication_key
  ) values (
    'marketplace_v2', 'transfer_reversal.provisional_retransferred',
    'transfer_reversal_v2', v_reversal.id::text, 'system',
    'Won banking dispute returned provisional recovery to the provider.',
    jsonb_build_object('amount_cents', v_reversal.recovered_amount_cents,
      'currency', v_reversal.currency,
      'stripe_retransfer_id', p_stripe_retransfer_id),
    jsonb_build_object('ledger_batch_id', v_batch_id,
      'payment_dispute_id', v_dispute.id),
    'retransfer-v2:' || v_reversal.id::text || ':audit'
  );
  return v_reversal;
end
$$;

create or replace function public.process_refund_v2_event(
  p_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz,
  p_local_refund_id uuid,
  p_stripe_refund_id text,
  p_refund_status text,
  p_amount_cents bigint,
  p_failure_reason text,
  p_payload_summary jsonb
)
returns table (refund_id uuid, duplicate boolean, outcome text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_event public.stripe_financial_v2_webhook_events%rowtype;
  v_refund public.refunds_v2%rowtype;
  v_outcome text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  select * into v_event from public.stripe_financial_v2_webhook_events where event_id = p_event_id;
  if found then
    return query select (select id from public.refunds_v2
      where stripe_refund_id = p_stripe_refund_id), true, v_event.outcome;
    return;
  end if;
  select * into v_refund from public.refunds_v2
  where stripe_refund_id = p_stripe_refund_id or id = p_local_refund_id
  order by (stripe_refund_id = p_stripe_refund_id) desc limit 1 for update;
  if not found then
    insert into public.stripe_financial_v2_webhook_events values (
      p_event_id, p_event_type, p_stripe_created_at, p_stripe_refund_id,
      null, false, 'not_v2_refund', coalesce(p_payload_summary, '{}'::jsonb), now()
    );
    return query select null::uuid, false, 'not_v2_refund'::text;
    return;
  end if;
  if v_refund.stripe_refund_id is null then
    perform set_config('app.financial_remediation_v2_mutation', 'on', true);
    update public.refunds_v2 set stripe_refund_id = p_stripe_refund_id,
      updated_at = clock_timestamp() where id = v_refund.id returning * into v_refund;
    perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  elsif v_refund.stripe_refund_id <> p_stripe_refund_id then
    raise exception 'Refund webhook carries another Stripe identity' using errcode = '23505';
  end if;
  if p_amount_cents <> v_refund.amount_cents then
    raise exception 'Stripe refund amount does not match reservation' using errcode = '23514';
  end if;
  if p_refund_status = 'succeeded' then
    perform public.complete_refund_v2(v_refund.id, p_stripe_refund_id, p_amount_cents);
    v_outcome := 'succeeded';
  elsif p_refund_status in ('failed', 'canceled') then
    perform public.fail_refund_v2(v_refund.id, 'stripe_refund_' || p_refund_status,
      coalesce(p_failure_reason, 'Stripe reported a definitive refund failure.'), false);
    v_outcome := 'manual_review';
  else
    v_outcome := 'pending';
  end if;
  insert into public.stripe_financial_v2_webhook_events values (
    p_event_id, p_event_type, p_stripe_created_at, p_stripe_refund_id,
    v_refund.payment_id, true, v_outcome,
    coalesce(p_payload_summary, '{}'::jsonb), now()
  );
  return query select v_refund.id, false, v_outcome;
end
$$;

create or replace function public.finalize_financial_resolution_v2(
  p_resolution_id uuid,
  p_expected_connect_revision bigint,
  p_deduplication_key text
)
returns table (resolution_status text, provider_transfer_id uuid, provider_transfer_status text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_resolution public.financial_resolutions_v2%rowtype;
  v_refund public.refunds_v2%rowtype;
  v_reversal public.transfer_reversals_v2%rowtype;
  v_transfer public.provider_transfers_v2%rowtype;
  v_transfer_workflow public.workflow_instances%rowtype;
  v_connect public.provider_connect_accounts%rowtype;
  v_hold public.checkout_v2_financial_holds%rowtype;
  v_case public.cancellation_cases_v2%rowtype;
  v_dispute public.service_disputes_v2%rowtype;
  v_source_workflow public.workflow_instances%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  perform public.require_financial_remediation_v2_enabled();
  select * into v_resolution from public.financial_resolutions_v2
  where id = p_resolution_id for update;
  if not found then raise exception 'Financial resolution not found' using errcode = 'P0002'; end if;
  select * into v_refund from public.refunds_v2 where resolution_id = v_resolution.id;
  select * into v_reversal from public.transfer_reversals_v2 where resolution_id = v_resolution.id;
  if v_refund.id is not null and v_refund.succeeded_at is null then
    return query select v_resolution.status, null::uuid, 'refund_pending'::text;
    return;
  end if;
  if v_reversal.id is not null and v_reversal.completed_at is null
     and v_reversal.last_error_code is null then
    return query select v_resolution.status, null::uuid, 'recovery_pending'::text;
    return;
  end if;

  for v_hold in select * from public.checkout_v2_financial_holds
    where payment_id = v_resolution.payment_id and released_at is null
      and ((v_resolution.source_type = 'cancellation' and hold_type = 'refund')
        or (v_resolution.source_type = 'service_dispute'
          and hold_type = 'service_dispute'))
    for update
  loop
    perform set_config('app.completion_release_v2_mutation', 'on', true);
    update public.checkout_v2_financial_holds set released_at = clock_timestamp(),
      released_by_actor_type = 'system', release_reason = 'Explicit financial resolution completed.'
    where id = v_hold.id;
    perform set_config('app.completion_release_v2_mutation', 'off', true);
    insert into public.checkout_v2_financial_hold_events (
      hold_id, payment_id, event_type, actor_type, reason, deduplication_key
    ) values (
      v_hold.id, v_hold.payment_id, 'released', 'system',
      'Explicit financial resolution completed.',
      p_deduplication_key || ':hold:' || v_hold.id::text
    );
  end loop;

  select * into v_transfer from public.provider_transfers_v2
  where payment_id = v_resolution.payment_id for update;
  if found and v_transfer.succeeded_at is null
     and v_resolution.provider_transfer_amount_cents > 0 then
    select * into v_connect from public.provider_connect_accounts
    where provider_id = v_transfer.provider_id for update;
    if not found or v_connect.revision <> p_expected_connect_revision
       or v_connect.closed or not v_connect.connection_enabled
       or v_connect.stripe_transfers_status <> 'active' then
      return query select v_resolution.status, v_transfer.id, 'connect_blocked'::text;
      return;
    end if;
    select * into v_transfer_workflow from public.workflow_instances
    where id = v_transfer.workflow_instance_id for update;
    if v_transfer_workflow.current_state = 'blocked' then
      v_transfer_workflow := public.transition_workflow_instance(
        v_transfer_workflow.id, v_transfer_workflow.revision,
        'transfer_reauthorize_after_resolution', 'system', null,
        'Explicit financial resolution authorizes the remaining provider amount.',
        jsonb_build_object('resolution_id', v_resolution.id),
        p_deduplication_key || ':transfer_ready'
      );
      perform public.transition_workflow_instance(
        v_transfer_workflow.id, v_transfer_workflow.revision,
        'transfer_reserve', 'system', null,
        'Remaining provider transfer atomically reserved.', '{}'::jsonb,
        p_deduplication_key || ':transfer_reserved'
      );
    end if;
  end if;

  if v_resolution.source_type = 'cancellation' then
    select * into v_case from public.cancellation_cases_v2 where id = v_resolution.source_id for update;
    select * into v_source_workflow from public.workflow_instances where id = v_case.workflow_instance_id for update;
    if (v_transfer.id is null or v_transfer.succeeded_at is not null
        or v_resolution.provider_transfer_amount_cents = 0)
       and v_source_workflow.current_state = 'financial_resolution_pending' then
      perform public.transition_workflow_instance(
        v_source_workflow.id, v_source_workflow.revision, 'cancellation_resolve',
        'system', null, 'Cancellation financial operations completed.', '{}'::jsonb,
        p_deduplication_key || ':cancellation_resolved'
      );
      perform set_config('app.financial_remediation_v2_mutation', 'on', true);
      update public.cancellation_cases_v2 set resolved_at = clock_timestamp(),
        updated_at = clock_timestamp() where id = v_case.id;
      perform set_config('app.financial_remediation_v2_mutation', 'off', true);
    end if;
  elsif v_resolution.source_type = 'service_dispute' then
    select * into v_dispute from public.service_disputes_v2 where id = v_resolution.source_id for update;
    select * into v_source_workflow from public.workflow_instances where id = v_dispute.workflow_instance_id for update;
    if (v_transfer.id is null or v_transfer.succeeded_at is not null
        or v_resolution.provider_transfer_amount_cents = 0)
       and v_source_workflow.current_state = 'executing_allocation' then
      perform public.transition_workflow_instance(
        v_source_workflow.id, v_source_workflow.revision, 'service_dispute_resolve',
        'system', null, 'Service dispute financial operations completed.', '{}'::jsonb,
        p_deduplication_key || ':service_dispute_resolved'
      );
      perform set_config('app.financial_remediation_v2_mutation', 'on', true);
      update public.service_disputes_v2 set resolved_at = clock_timestamp(),
        updated_at = clock_timestamp() where id = v_dispute.id;
      perform set_config('app.financial_remediation_v2_mutation', 'off', true);
    end if;
  end if;
  perform set_config('app.financial_remediation_v2_mutation', 'on', true);
  update public.financial_resolutions_v2 set status = 'completed',
    completed_at = coalesce(completed_at, clock_timestamp()) where id = v_resolution.id
  returning * into v_resolution;
  perform set_config('app.financial_remediation_v2_mutation', 'off', true);
  return query select v_resolution.status, v_transfer.id,
    coalesce((select current_state from public.workflow_instances
      where id = v_transfer.workflow_instance_id), 'not_required');
end
$$;

alter table public.financial_security_policy_versions enable row level security;
alter table public.cancellation_cases_v2 enable row level security;
alter table public.cancellation_allocation_proposals_v2 enable row level security;
alter table public.service_disputes_v2 enable row level security;
alter table public.service_dispute_evidence_v2 enable row level security;
alter table public.financial_resolutions_v2 enable row level security;
alter table public.service_dispute_decisions_v2 enable row level security;
alter table public.refunds_v2 enable row level security;
alter table public.payment_disputes_v2 enable row level security;
alter table public.transfer_reversals_v2 enable row level security;
alter table public.financial_recovery_deficits_v2 enable row level security;
alter table public.financial_remediation_attempts_v2 enable row level security;
alter table public.stripe_financial_v2_webhook_events enable row level security;

revoke all on public.financial_security_policy_versions from public, anon, authenticated;
revoke all on public.cancellation_cases_v2 from public, anon, authenticated;
revoke all on public.cancellation_allocation_proposals_v2 from public, anon, authenticated;
revoke all on public.service_disputes_v2 from public, anon, authenticated;
revoke all on public.service_dispute_evidence_v2 from public, anon, authenticated;
revoke all on public.financial_resolutions_v2 from public, anon, authenticated;
revoke all on public.service_dispute_decisions_v2 from public, anon, authenticated;
revoke all on public.refunds_v2 from public, anon, authenticated;
revoke all on public.payment_disputes_v2 from public, anon, authenticated;
revoke all on public.transfer_reversals_v2 from public, anon, authenticated;
revoke all on public.financial_recovery_deficits_v2 from public, anon, authenticated;
revoke all on public.financial_remediation_attempts_v2 from public, anon, authenticated;
revoke all on public.stripe_financial_v2_webhook_events from public, anon, authenticated;
revoke all on sequence public.financial_remediation_attempts_v2_id_seq from public, anon, authenticated;

grant all on public.financial_security_policy_versions to service_role;
grant all on public.cancellation_cases_v2 to service_role;
grant all on public.cancellation_allocation_proposals_v2 to service_role;
grant all on public.service_disputes_v2 to service_role;
grant all on public.service_dispute_evidence_v2 to service_role;
grant all on public.financial_resolutions_v2 to service_role;
grant all on public.service_dispute_decisions_v2 to service_role;
grant all on public.refunds_v2 to service_role;
grant all on public.payment_disputes_v2 to service_role;
grant all on public.transfer_reversals_v2 to service_role;
grant all on public.financial_recovery_deficits_v2 to service_role;
grant all on public.financial_remediation_attempts_v2 to service_role;
grant all on public.stripe_financial_v2_webhook_events to service_role;
grant usage, select on sequence public.financial_remediation_attempts_v2_id_seq to service_role;

revoke all on function public.protect_financial_remediation_v2_record() from public, anon, authenticated;
revoke all on function public.require_financial_remediation_v2_enabled() from public, anon, authenticated;
revoke all on function public.assert_recent_financial_admin_mfa_v2(uuid,timestamptz,text) from public, anon, authenticated;
revoke all on function public.create_cancellation_allocation_proposal_v2(uuid,text,uuid,bigint,bigint,bigint,text,text) from public, anon, authenticated;
revoke all on function public.request_client_cancellation_v2(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.provider_respond_cancellation_v2(uuid,uuid,text,bigint,bigint,bigint,text,text) from public, anon, authenticated;
revoke all on function public.client_respond_cancellation_v2(uuid,uuid,boolean,text,text) from public, anon, authenticated;
revoke all on function public.reserve_financial_resolution_v2(uuid,text,uuid,bigint,bigint,bigint,text,text,uuid,timestamptz,text,bigint,text) from public, anon, authenticated;
revoke all on function public.execute_agreed_cancellation_v2(uuid,bigint,text) from public, anon, authenticated;
revoke all on function public.provider_cancel_service_v2(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.propose_mutual_cancellation_v2(uuid,text,uuid,bigint,bigint,bigint,text,text) from public, anon, authenticated;
revoke all on function public.respond_mutual_cancellation_v2(uuid,text,uuid,boolean,text,text) from public, anon, authenticated;
revoke all on function public.open_service_dispute_v2(uuid,text,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.add_service_dispute_evidence_v2(uuid,text,uuid,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.decide_service_dispute_v2(uuid,uuid,bigint,bigint,bigint,text,jsonb,timestamptz,text,bigint,text) from public, anon, authenticated;
revoke all on function public.reserve_transfer_reversal_dispatch_v2(uuid) from public, anon, authenticated;
revoke all on function public.mark_transfer_reversal_submitted_v2(uuid) from public, anon, authenticated;
revoke all on function public.complete_transfer_reversal_v2(uuid,text,bigint) from public, anon, authenticated;
revoke all on function public.fail_transfer_reversal_v2(uuid,text,text,boolean) from public, anon, authenticated;
revoke all on function public.reserve_refund_dispatch_v2(uuid) from public, anon, authenticated;
revoke all on function public.mark_refund_submitted_v2(uuid) from public, anon, authenticated;
revoke all on function public.complete_refund_v2(uuid,text,bigint) from public, anon, authenticated;
revoke all on function public.fail_refund_v2(uuid,text,text,boolean) from public, anon, authenticated;
revoke all on function public.record_refund_submission_v2(uuid,text) from public, anon, authenticated;
revoke all on function public.process_payment_dispute_v2_event(text,text,timestamptz,text,text,text,text,bigint,bigint,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.reserve_provider_retransfer_v2(uuid,bigint) from public, anon, authenticated;
revoke all on function public.complete_provider_retransfer_v2(uuid,text) from public, anon, authenticated;
revoke all on function public.process_refund_v2_event(text,text,timestamptz,uuid,text,text,bigint,text,jsonb) from public, anon, authenticated;
revoke all on function public.finalize_financial_resolution_v2(uuid,bigint,text) from public, anon, authenticated;

grant execute on function public.create_cancellation_allocation_proposal_v2(uuid,text,uuid,bigint,bigint,bigint,text,text) to service_role;
grant execute on function public.request_client_cancellation_v2(uuid,uuid,text,text) to service_role;
grant execute on function public.provider_respond_cancellation_v2(uuid,uuid,text,bigint,bigint,bigint,text,text) to service_role;
grant execute on function public.client_respond_cancellation_v2(uuid,uuid,boolean,text,text) to service_role;
grant execute on function public.reserve_financial_resolution_v2(uuid,text,uuid,bigint,bigint,bigint,text,text,uuid,timestamptz,text,bigint,text) to service_role;
grant execute on function public.execute_agreed_cancellation_v2(uuid,bigint,text) to service_role;
grant execute on function public.provider_cancel_service_v2(uuid,uuid,text,text) to service_role;
grant execute on function public.propose_mutual_cancellation_v2(uuid,text,uuid,bigint,bigint,bigint,text,text) to service_role;
grant execute on function public.respond_mutual_cancellation_v2(uuid,text,uuid,boolean,text,text) to service_role;
grant execute on function public.open_service_dispute_v2(uuid,text,uuid,text,text,text) to service_role;
grant execute on function public.add_service_dispute_evidence_v2(uuid,text,uuid,text,jsonb,text) to service_role;
grant execute on function public.decide_service_dispute_v2(uuid,uuid,bigint,bigint,bigint,text,jsonb,timestamptz,text,bigint,text) to service_role;
grant execute on function public.reserve_transfer_reversal_dispatch_v2(uuid) to service_role;
grant execute on function public.mark_transfer_reversal_submitted_v2(uuid) to service_role;
grant execute on function public.complete_transfer_reversal_v2(uuid,text,bigint) to service_role;
grant execute on function public.fail_transfer_reversal_v2(uuid,text,text,boolean) to service_role;
grant execute on function public.reserve_refund_dispatch_v2(uuid) to service_role;
grant execute on function public.mark_refund_submitted_v2(uuid) to service_role;
grant execute on function public.complete_refund_v2(uuid,text,bigint) to service_role;
grant execute on function public.fail_refund_v2(uuid,text,text,boolean) to service_role;
grant execute on function public.record_refund_submission_v2(uuid,text) to service_role;
grant execute on function public.process_payment_dispute_v2_event(text,text,timestamptz,text,text,text,text,bigint,bigint,text,jsonb,jsonb) to service_role;
grant execute on function public.reserve_provider_retransfer_v2(uuid,bigint) to service_role;
grant execute on function public.complete_provider_retransfer_v2(uuid,text) to service_role;
grant execute on function public.process_refund_v2_event(text,text,timestamptz,uuid,text,text,bigint,text,jsonb) to service_role;
grant execute on function public.finalize_financial_resolution_v2(uuid,bigint,text) to service_role;

commit;
