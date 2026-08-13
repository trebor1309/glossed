-- Frozen v1 state-machine model and immutable financial snapshots.
--
-- This migration is deliberately additive. It does not create or activate a
-- separate-charges-and-transfers financial flow, does not attach instances to
-- existing rows, and does not change the legacy_v1 Stripe functions.

begin;

create table public.workflow_machine_versions (
  machine_code text not null,
  version text not null,
  subject_type text not null,
  initial_state text not null,
  description text not null,
  created_at timestamptz not null default now(),
  primary key (machine_code, version),
  constraint workflow_machine_code_format check (
    machine_code ~ '^[a-z][a-z0-9_]{2,63}$'
  ),
  constraint workflow_machine_version_format check (
    version ~ '^v[1-9][0-9]*$'
  ),
  constraint workflow_subject_type_format check (
    subject_type ~ '^[a-z][a-z0-9_]{2,63}$'
  ),
  constraint workflow_initial_state_format check (
    initial_state ~ '^[a-z][a-z0-9_]{1,63}$'
  ),
  constraint workflow_machine_description_length check (
    length(description) between 1 and 2000
  )
);

create table public.workflow_states (
  machine_code text not null,
  machine_version text not null,
  state_code text not null,
  is_terminal boolean not null default false,
  description text not null,
  primary key (machine_code, machine_version, state_code),
  foreign key (machine_code, machine_version)
    references public.workflow_machine_versions(machine_code, version)
    on delete restrict,
  constraint workflow_state_code_format check (
    state_code ~ '^[a-z][a-z0-9_]{1,63}$'
  ),
  constraint workflow_state_description_length check (
    length(description) between 1 and 2000
  )
);

alter table public.workflow_machine_versions
  add constraint workflow_machine_initial_state_fkey
  foreign key (machine_code, version, initial_state)
  references public.workflow_states(machine_code, machine_version, state_code)
  deferrable initially deferred;

create function public.financial_text_array_is_unique(p_values text[])
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select cardinality(p_values) = count(distinct value)
  from unnest(p_values) as value;
$$;

create function public.financial_text_array_matches(
  p_values text[],
  p_pattern text
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select coalesce(bool_and(value ~ p_pattern), true)
  from unnest(p_values) as value;
$$;

create table public.workflow_transitions (
  transition_code text primary key,
  machine_code text not null,
  machine_version text not null,
  from_state text not null,
  to_state text not null,
  allowed_actor_types text[] not null,
  condition_codes text[] not null default '{}'::text[],
  financial_effect_code text,
  audit_event_type text not null,
  description text not null,
  foreign key (machine_code, machine_version, from_state)
    references public.workflow_states(machine_code, machine_version, state_code)
    on delete restrict,
  foreign key (machine_code, machine_version, to_state)
    references public.workflow_states(machine_code, machine_version, state_code)
    on delete restrict,
  constraint workflow_transition_code_format check (
    transition_code ~ '^[a-z][a-z0-9_]{2,100}$'
  ),
  constraint workflow_transition_changes_state check (from_state <> to_state),
  constraint workflow_transition_actors_nonempty check (
    cardinality(allowed_actor_types) > 0
  ),
  constraint workflow_transition_actors_valid check (
    allowed_actor_types <@ array['client', 'provider', 'system', 'admin']::text[]
  ),
  constraint workflow_transition_actors_unique check (
    public.financial_text_array_is_unique(allowed_actor_types)
  ),
  constraint workflow_condition_codes_valid check (
    public.financial_text_array_matches(
      condition_codes,
      '^[a-z][a-z0-9_]{2,100}$'
    )
  ),
  constraint workflow_financial_effect_format check (
    financial_effect_code is null
    or financial_effect_code ~ '^[a-z][a-z0-9_]{2,100}$'
  ),
  constraint workflow_audit_event_format check (
    audit_event_type ~ '^[a-z][a-z0-9_.]{2,100}$'
  ),
  constraint workflow_transition_description_length check (
    length(description) between 1 and 2000
  )
);

create unique index workflow_transition_identity_uidx
  on public.workflow_transitions (
    machine_code,
    machine_version,
    from_state,
    to_state,
    transition_code
  );

create trigger workflow_machine_versions_immutable
before update or delete on public.workflow_machine_versions
for each row execute function public.reject_financial_definition_mutation();

create trigger workflow_states_immutable
before update or delete on public.workflow_states
for each row execute function public.reject_financial_definition_mutation();

create trigger workflow_transitions_immutable
before update or delete on public.workflow_transitions
for each row execute function public.reject_financial_definition_mutation();

insert into public.workflow_machine_versions (
  machine_code, version, subject_type, initial_state, description
) values
  ('request_lifecycle', 'v1', 'request', 'draft', 'Commercial request availability and award lifecycle.'),
  ('mission_lifecycle', 'v1', 'mission', 'active', 'Coarse mission aggregate lifecycle; detailed states remain independent.'),
  ('proposal_lifecycle', 'v1', 'proposal', 'draft', 'Versioned provider proposal publication lifecycle.'),
  ('conditional_selection', 'v1', 'conditional_selection', 'none', 'Exclusive conditional commitment before payment.'),
  ('checkout_attempt', 'v1', 'checkout_attempt', 'reserved', 'Atomic Stripe Checkout attempt lifecycle.'),
  ('payment_lifecycle', 'v1', 'payment', 'awaiting_confirmation', 'Webhook-confirmed customer payment lifecycle.'),
  ('service_execution', 'v1', 'mission', 'planned', 'Service completion and customer protection lifecycle.'),
  ('fund_release', 'v1', 'mission', 'held', 'Decision to release or allocate held provider funds.'),
  ('cancellation', 'v1', 'cancellation_case', 'none', 'Legal, provider, mutual and commercial cancellation lifecycle.'),
  ('service_dispute', 'v1', 'service_dispute', 'none', 'Glossed service-dispute adjudication lifecycle.'),
  ('refund', 'v1', 'refund', 'not_requested', 'Customer refund execution lifecycle.'),
  ('provider_transfer', 'v1', 'provider_transfer', 'not_eligible', 'Transfer from the platform balance to the connected account.'),
  ('transfer_reversal', 'v1', 'transfer_reversal', 'none', 'Provisional or final recovery of a provider transfer.'),
  ('payment_dispute', 'v1', 'payment_dispute', 'none', 'Stripe and card-network payment-dispute lifecycle.'),
  ('payout', 'v1', 'payout', 'not_eligible', 'Standard or instant payout from Connect to a bank account.');

insert into public.workflow_states (
  machine_code, machine_version, state_code, is_terminal, description
) values
  ('request_lifecycle', 'v1', 'draft', false, 'Request is private and editable.'),
  ('request_lifecycle', 'v1', 'open', false, 'Request accepts provider proposals.'),
  ('request_lifecycle', 'v1', 'conditionally_locked', false, 'One proposal is exclusively selected before payment.'),
  ('request_lifecycle', 'v1', 'awarded', false, 'Payment selected the definitive proposal.'),
  ('request_lifecycle', 'v1', 'closed', true, 'Mission and financial obligations are closed.'),
  ('request_lifecycle', 'v1', 'cancelled', true, 'Request was cancelled before award.'),
  ('request_lifecycle', 'v1', 'closed_unfilled', true, 'Request closed without an awarded proposal.'),

  ('mission_lifecycle', 'v1', 'active', false, 'Paid mission is operational.'),
  ('mission_lifecycle', 'v1', 'financially_resolved', false, 'Every mission amount has an explicit allocation.'),
  ('mission_lifecycle', 'v1', 'closed', true, 'No financial or dispute obligation remains.'),
  ('mission_lifecycle', 'v1', 'cancelled', true, 'Cancellation workflow reached its financial result.'),

  ('proposal_lifecycle', 'v1', 'draft', false, 'Proposal is private and editable.'),
  ('proposal_lifecycle', 'v1', 'blocked_requirements', false, 'Draft is preserved while eligibility requirements are missing.'),
  ('proposal_lifecycle', 'v1', 'active', false, 'Proposal is visible and selectable.'),
  ('proposal_lifecycle', 'v1', 'frozen', false, 'Conditionally selected proposal is immutable.'),
  ('proposal_lifecycle', 'v1', 'superseded', false, 'A newer mutually accepted proposal version replaces this one.'),
  ('proposal_lifecycle', 'v1', 'withdrawn', false, 'Provider withdrew an unselected proposal.'),
  ('proposal_lifecycle', 'v1', 'accepted', false, 'Webhook-confirmed payment accepted this proposal.'),
  ('proposal_lifecycle', 'v1', 'not_selected', false, 'Another proposal was accepted.'),
  ('proposal_lifecycle', 'v1', 'reconfirmation_required', false, 'Provider must reconfirm after an unpaid selection failed.'),
  ('proposal_lifecycle', 'v1', 'archived', true, 'Proposal version is retained only for history.'),

  ('conditional_selection', 'v1', 'none', false, 'No conditional selection exists.'),
  ('conditional_selection', 'v1', 'committed_waiting_window', false, 'Parties are committed while waiting for the payment window.'),
  ('conditional_selection', 'v1', 'payment_due', false, 'Configured payment window is open.'),
  ('conditional_selection', 'v1', 'checkout_active', false, 'A payable Checkout session holds the exclusive lock.'),
  ('conditional_selection', 'v1', 'fulfilled', true, 'Webhook-confirmed payment fulfilled the selection.'),
  ('conditional_selection', 'v1', 'failed_unpaid', true, 'Payment deadline or Checkout expired without payment.'),
  ('conditional_selection', 'v1', 'cancelled', true, 'Selection ended through the cancellation workflow.'),

  ('checkout_attempt', 'v1', 'reserved', false, 'Atomic Checkout reservation exists locally.'),
  ('checkout_attempt', 'v1', 'open', false, 'Stripe Checkout session is payable.'),
  ('checkout_attempt', 'v1', 'completed', true, 'Signed webhook confirmed payment.'),
  ('checkout_attempt', 'v1', 'expired', true, 'Checkout expired normally.'),
  ('checkout_attempt', 'v1', 'failed', true, 'Checkout failed definitively.'),
  ('checkout_attempt', 'v1', 'abandoned', true, 'Checkout was deliberately invalidated before payment.'),

  ('payment_lifecycle', 'v1', 'awaiting_confirmation', false, 'Browser result is not yet financially authoritative.'),
  ('payment_lifecycle', 'v1', 'paid', false, 'Signed Stripe webhook confirmed payment.'),
  ('payment_lifecycle', 'v1', 'partially_refunded', false, 'Part of the customer payment was refunded.'),
  ('payment_lifecycle', 'v1', 'refunded', true, 'Customer payment was fully refunded.'),
  ('payment_lifecycle', 'v1', 'failed', true, 'Payment failed without a successful charge.'),

  ('service_execution', 'v1', 'planned', false, 'Service has not reached its completion threshold.'),
  ('service_execution', 'v1', 'completion_eligible', false, 'Completion may now be declared or confirmed.'),
  ('service_execution', 'v1', 'provider_completed_waiting_client', false, 'Provider declaration started the 48-hour protection window.'),
  ('service_execution', 'v1', 'client_confirmed', false, 'Client explicitly confirmed completion.'),
  ('service_execution', 'v1', 'problem_reported', false, 'Client reported a problem or no-show.'),
  ('service_execution', 'v1', 'stale_admin_review', false, 'Neither party acted within the configured operational delay.'),
  ('service_execution', 'v1', 'concluded', true, 'Execution outcome has an explicit financial path.'),

  ('fund_release', 'v1', 'held', false, 'Provider funds are retained by Glossed.'),
  ('fund_release', 'v1', 'eligible', false, 'Release trigger occurred and invariants must be revalidated.'),
  ('fund_release', 'v1', 'blocked', false, 'A dispute, refund, payment issue or compliance condition blocks release.'),
  ('fund_release', 'v1', 'release_reserved', false, 'Atomic release allocation is reserved.'),
  ('fund_release', 'v1', 'released', true, 'Allocation is posted and a provider transfer may proceed.'),
  ('fund_release', 'v1', 'cancelled', true, 'Final allocation awards no provider funds.'),

  ('cancellation', 'v1', 'none', false, 'No cancellation is active.'),
  ('cancellation', 'v1', 'client_full_refund_requested', false, 'Client commercial request defaults to a full refund.'),
  ('cancellation', 'v1', 'provider_partial_allocation_proposed', false, 'Provider counter-proposed a partial allocation.'),
  ('cancellation', 'v1', 'mutual_allocation_proposed', false, 'One party proposed a mutual allocation.'),
  ('cancellation', 'v1', 'mutually_agreed', false, 'Both parties explicitly accepted the same allocation.'),
  ('cancellation', 'v1', 'legal_policy_applied', false, 'A validated jurisdictional policy determined the allocation.'),
  ('cancellation', 'v1', 'provider_cancelled', false, 'Provider cancelled; the client receives a full refund.'),
  ('cancellation', 'v1', 'routed_to_dispute', false, 'No allocation agreement exists; administrative adjudication is required.'),
  ('cancellation', 'v1', 'financial_resolution_pending', false, 'Cancellation allocation awaits financial execution.'),
  ('cancellation', 'v1', 'resolved', true, 'Cancellation allocation is fully executed.'),
  ('cancellation', 'v1', 'rejected', true, 'A valid policy or adjudication maintained the mission.'),

  ('service_dispute', 'v1', 'none', false, 'No Glossed service dispute exists.'),
  ('service_dispute', 'v1', 'open', false, 'Dispute is open and release is frozen.'),
  ('service_dispute', 'v1', 'evidence_collection', false, 'Both parties may submit evidence.'),
  ('service_dispute', 'v1', 'admin_review', false, 'Administrative review is in progress.'),
  ('service_dispute', 'v1', 'decided', false, 'Administrator recorded a complete allocation decision.'),
  ('service_dispute', 'v1', 'executing_allocation', false, 'Decision is being executed idempotently.'),
  ('service_dispute', 'v1', 'resolved', true, 'Decision and resulting operations are complete.'),

  ('refund', 'v1', 'not_requested', false, 'No refund was authorized.'),
  ('refund', 'v1', 'authorized', false, 'A valid workflow authorized the customer refund.'),
  ('refund', 'v1', 'recovery_attempted', false, 'Any available provider transfer recovery was attempted first.'),
  ('refund', 'v1', 'submitted', false, 'Idempotent refund request was submitted to Stripe.'),
  ('refund', 'v1', 'succeeded', true, 'Stripe confirmed the refund.'),
  ('refund', 'v1', 'failed_retryable', false, 'Transient failure allows a controlled retry.'),
  ('refund', 'v1', 'manual_review', false, 'Definitive or ambiguous failure requires review.'),

  ('provider_transfer', 'v1', 'not_eligible', false, 'Funds or connected account are not eligible.'),
  ('provider_transfer', 'v1', 'ready', false, 'Released funds and current capabilities allow transfer.'),
  ('provider_transfer', 'v1', 'reserved', false, 'Atomic transfer operation is reserved.'),
  ('provider_transfer', 'v1', 'submitted', false, 'Transfer with source_transaction was submitted.'),
  ('provider_transfer', 'v1', 'succeeded', true, 'Stripe confirmed the connected-account transfer.'),
  ('provider_transfer', 'v1', 'failed_retryable', false, 'Transient transfer failure allows a retry.'),
  ('provider_transfer', 'v1', 'blocked', false, 'Compliance or financial state blocks transfer.'),
  ('provider_transfer', 'v1', 'manual_review', false, 'Transfer requires administrative review.'),

  ('transfer_reversal', 'v1', 'none', false, 'No transfer reversal exists.'),
  ('transfer_reversal', 'v1', 'requested_provisional', false, 'Chargeback triggered provisional recovery.'),
  ('transfer_reversal', 'v1', 'requested_final', false, 'Final refund or allocation requires recovery.'),
  ('transfer_reversal', 'v1', 'submitted', false, 'Reversal was submitted to Stripe.'),
  ('transfer_reversal', 'v1', 'partially_recovered', false, 'Only part of the requested amount was recovered.'),
  ('transfer_reversal', 'v1', 'fully_recovered', false, 'Requested amount was fully recovered.'),
  ('transfer_reversal', 'v1', 'failed', false, 'Recovery failed and its deficit is recorded.'),
  ('transfer_reversal', 'v1', 'retransferred', true, 'Provisional recovery was returned after a won chargeback.'),

  ('payment_dispute', 'v1', 'none', false, 'No Stripe payment dispute exists.'),
  ('payment_dispute', 'v1', 'open', false, 'Signed Stripe webhook opened the dispute.'),
  ('payment_dispute', 'v1', 'provisional_recovery', false, 'Provider transfer recovery is provisional.'),
  ('payment_dispute', 'v1', 'evidence_collection', false, 'Glossed is collecting evidence for Stripe.'),
  ('payment_dispute', 'v1', 'stripe_review', false, 'Stripe or the card network is deciding the dispute.'),
  ('payment_dispute', 'v1', 'won', false, 'Stripe reported a platform victory.'),
  ('payment_dispute', 'v1', 'lost', false, 'Stripe reported a platform loss.'),
  ('payment_dispute', 'v1', 'liability_admin_review', false, 'Final provider liability requires a validated policy or review.'),
  ('payment_dispute', 'v1', 'resolved', true, 'Dispute recovery and final allocation are complete.'),

  ('payout', 'v1', 'not_eligible', false, 'No released Connect balance is eligible.'),
  ('payout', 'v1', 'available', false, 'Released funds are available on the connected account.'),
  ('payout', 'v1', 'scheduled', false, 'Funds are queued for the configured standard payout schedule.'),
  ('payout', 'v1', 'instant_quote', false, 'Exact Stripe Instant Payout fee is displayed.'),
  ('payout', 'v1', 'instant_confirmed', false, 'Provider accepted the exact Instant Payout fee.'),
  ('payout', 'v1', 'submitted', false, 'Payout request was submitted to Stripe.'),
  ('payout', 'v1', 'paid', true, 'Stripe confirmed the bank payout.'),
  ('payout', 'v1', 'failed', false, 'Payout failed and funds remain reconcilable.'),
  ('payout', 'v1', 'cancelled', true, 'Payout was cancelled before completion.');

insert into public.workflow_transitions (
  transition_code, machine_code, machine_version, from_state, to_state,
  allowed_actor_types, condition_codes, financial_effect_code,
  audit_event_type, description
) values
  ('request_publish', 'request_lifecycle', 'v1', 'draft', 'open', array['client'], array['request_complete'], null, 'request.published', 'Client publishes a complete request.'),
  ('request_select', 'request_lifecycle', 'v1', 'open', 'conditionally_locked', array['client'], array['active_proposal', 'no_active_selection'], null, 'request.conditionally_locked', 'Client exclusively selects one proposal.'),
  ('request_payment_confirmed', 'request_lifecycle', 'v1', 'conditionally_locked', 'awarded', array['system'], array['signed_webhook', 'payment_amounts_match'], 'award_request', 'request.awarded', 'Signed webhook awards the request.'),
  ('request_selection_released', 'request_lifecycle', 'v1', 'conditionally_locked', 'open', array['system'], array['selection_failed_or_cancelled'], 'release_liquidity_reservation', 'request.reopened', 'Failed conditional selection reopens the request.'),
  ('request_cancel_draft', 'request_lifecycle', 'v1', 'draft', 'cancelled', array['client'], array['no_active_selection'], null, 'request.cancelled', 'Client cancels a draft.'),
  ('request_cancel_open', 'request_lifecycle', 'v1', 'open', 'cancelled', array['client'], array['no_active_selection'], null, 'request.cancelled', 'Client cancels an uncommitted request.'),
  ('request_close_unfilled', 'request_lifecycle', 'v1', 'open', 'closed_unfilled', array['client', 'system', 'admin'], array['no_active_selection'], null, 'request.closed_unfilled', 'Request closes without an award.'),
  ('request_close_awarded', 'request_lifecycle', 'v1', 'awarded', 'closed', array['system'], array['mission_obligations_closed'], null, 'request.closed', 'All awarded-mission obligations are closed.'),

  ('mission_resolve_financially', 'mission_lifecycle', 'v1', 'active', 'financially_resolved', array['system', 'admin'], array['complete_allocation'], 'post_final_allocation', 'mission.financially_resolved', 'Mission receives a complete financial allocation.'),
  ('mission_close', 'mission_lifecycle', 'v1', 'financially_resolved', 'closed', array['system'], array['no_open_financial_obligation'], null, 'mission.closed', 'Mission closes after all obligations finish.'),
  ('mission_cancel', 'mission_lifecycle', 'v1', 'active', 'cancelled', array['system'], array['cancellation_resolved'], null, 'mission.cancelled', 'Resolved cancellation closes the mission.'),

  ('proposal_block_requirements', 'proposal_lifecycle', 'v1', 'draft', 'blocked_requirements', array['system'], array['eligibility_or_stripe_missing'], null, 'proposal.requirements_blocked', 'Draft remains saved while requirements are missing.'),
  ('proposal_publish', 'proposal_lifecycle', 'v1', 'draft', 'active', array['provider'], array['proposal_complete', 'eligibility_valid', 'stripe_capability_active'], null, 'proposal.published', 'Provider publishes a payable proposal.'),
  ('proposal_publish_after_requirements', 'proposal_lifecycle', 'v1', 'blocked_requirements', 'active', array['provider', 'system'], array['eligibility_valid', 'stripe_capability_active'], null, 'proposal.published', 'Requirements completed and draft is published.'),
  ('proposal_freeze', 'proposal_lifecycle', 'v1', 'active', 'frozen', array['system'], array['conditional_selection_created'], null, 'proposal.frozen', 'Selected proposal becomes immutable.'),
  ('proposal_supersede_active', 'proposal_lifecycle', 'v1', 'active', 'superseded', array['system'], array['bilateral_amendment_accepted'], null, 'proposal.superseded', 'A mutually accepted version replaces the active proposal.'),
  ('proposal_supersede_frozen', 'proposal_lifecycle', 'v1', 'frozen', 'superseded', array['system'], array['checkout_expired', 'bilateral_amendment_accepted'], 'release_liquidity_reservation', 'proposal.superseded', 'Checkout expires before the accepted amendment takes effect.'),
  ('proposal_withdraw', 'proposal_lifecycle', 'v1', 'active', 'withdrawn', array['provider'], array['no_active_selection', 'no_active_checkout'], null, 'proposal.withdrawn', 'Provider withdraws an unselected proposal.'),
  ('proposal_accept', 'proposal_lifecycle', 'v1', 'frozen', 'accepted', array['system'], array['signed_webhook', 'payment_amounts_match'], null, 'proposal.accepted', 'Webhook-confirmed payment accepts the proposal.'),
  ('proposal_not_selected', 'proposal_lifecycle', 'v1', 'active', 'not_selected', array['system'], array['competing_proposal_paid'], null, 'proposal.not_selected', 'Another proposal is paid.'),
  ('proposal_reconfirm_after_failure_active', 'proposal_lifecycle', 'v1', 'active', 'reconfirmation_required', array['system'], array['conditional_selection_failed'], null, 'proposal.reconfirmation_required', 'Old active proposal requires provider reconfirmation.'),
  ('proposal_reconfirm_after_failure_frozen', 'proposal_lifecycle', 'v1', 'frozen', 'reconfirmation_required', array['system'], array['conditional_selection_failed'], null, 'proposal.reconfirmation_required', 'Selected proposal requires reconfirmation after non-payment.'),
  ('proposal_reconfirm_unchanged', 'proposal_lifecycle', 'v1', 'reconfirmation_required', 'active', array['provider'], array['terms_unchanged', 'eligibility_valid'], null, 'proposal.reconfirmed', 'Provider reactivates the same proposal version.'),
  ('proposal_reconfirm_modified', 'proposal_lifecycle', 'v1', 'reconfirmation_required', 'superseded', array['provider'], array['new_version_created'], null, 'proposal.superseded', 'Modified reconfirmation creates a new version.'),
  ('proposal_archive_superseded', 'proposal_lifecycle', 'v1', 'superseded', 'archived', array['system'], array[]::text[], null, 'proposal.archived', 'Superseded proposal is archived.'),
  ('proposal_archive_withdrawn', 'proposal_lifecycle', 'v1', 'withdrawn', 'archived', array['system'], array[]::text[], null, 'proposal.archived', 'Withdrawn proposal is archived.'),
  ('proposal_archive_accepted', 'proposal_lifecycle', 'v1', 'accepted', 'archived', array['system'], array['mission_created'], null, 'proposal.archived', 'Accepted proposal is retained as contract history.'),
  ('proposal_archive_not_selected', 'proposal_lifecycle', 'v1', 'not_selected', 'archived', array['system'], array[]::text[], null, 'proposal.archived', 'Unselected proposal is archived.'),

  ('selection_commit', 'conditional_selection', 'v1', 'none', 'committed_waiting_window', array['client'], array['active_proposal', 'no_active_selection'], 'reserve_provider_slot', 'selection.committed', 'Parties enter an exclusive conditional commitment.'),
  ('selection_open_payment_window', 'conditional_selection', 'v1', 'committed_waiting_window', 'payment_due', array['system'], array['payment_window_open'], null, 'selection.payment_due', 'Configured payment window opens.'),
  ('selection_checkout_created', 'conditional_selection', 'v1', 'payment_due', 'checkout_active', array['system'], array['checkout_lock_reserved', 'liquidity_reserved'], 'reserve_liquidity', 'selection.checkout_active', 'Atomic Checkout reservation becomes payable.'),
  ('selection_fulfilled', 'conditional_selection', 'v1', 'checkout_active', 'fulfilled', array['system'], array['signed_webhook', 'payment_amounts_match'], 'consume_liquidity_reservation', 'selection.fulfilled', 'Webhook-confirmed payment fulfills the selection.'),
  ('selection_payment_deadline_failed', 'conditional_selection', 'v1', 'payment_due', 'failed_unpaid', array['system'], array['payment_deadline_expired'], 'release_liquidity_reservation', 'selection.failed_unpaid', 'Payment deadline expires.'),
  ('selection_checkout_failed', 'conditional_selection', 'v1', 'checkout_active', 'failed_unpaid', array['system'], array['checkout_expired_or_failed'], 'release_liquidity_reservation', 'selection.failed_unpaid', 'Checkout ends without payment.'),
  ('selection_cancel_waiting_window', 'conditional_selection', 'v1', 'committed_waiting_window', 'cancelled', array['system'], array['cancellation_workflow_authorized'], null, 'selection.cancelled', 'Cancellation ends the commitment.'),
  ('selection_cancel_payment_due', 'conditional_selection', 'v1', 'payment_due', 'cancelled', array['system'], array['cancellation_workflow_authorized'], null, 'selection.cancelled', 'Cancellation ends payment due.'),
  ('selection_cancel_checkout', 'conditional_selection', 'v1', 'checkout_active', 'cancelled', array['system'], array['checkout_expired', 'cancellation_workflow_authorized'], 'release_liquidity_reservation', 'selection.cancelled', 'Cancellation expires Checkout and ends selection.'),

  ('checkout_attach_session', 'checkout_attempt', 'v1', 'reserved', 'open', array['system'], array['stable_idempotency_key', 'stripe_session_created'], 'reserve_liquidity', 'checkout.opened', 'Stripe session is attached to the atomic reservation.'),
  ('checkout_complete', 'checkout_attempt', 'v1', 'open', 'completed', array['system'], array['signed_webhook', 'payment_paid'], 'consume_liquidity_reservation', 'checkout.completed', 'Signed webhook confirms payment.'),
  ('checkout_expire_reserved', 'checkout_attempt', 'v1', 'reserved', 'expired', array['system'], array['checkout_expired'], 'release_liquidity_reservation', 'checkout.expired', 'Reserved attempt expires.'),
  ('checkout_expire_open', 'checkout_attempt', 'v1', 'open', 'expired', array['system'], array['checkout_expired'], 'release_liquidity_reservation', 'checkout.expired', 'Open session expires.'),
  ('checkout_fail_reserved', 'checkout_attempt', 'v1', 'reserved', 'failed', array['system'], array['definitive_failure'], 'release_liquidity_reservation', 'checkout.failed', 'Checkout reservation fails definitively.'),
  ('checkout_fail_open', 'checkout_attempt', 'v1', 'open', 'failed', array['system'], array['definitive_failure'], 'release_liquidity_reservation', 'checkout.failed', 'Open Checkout fails definitively.'),
  ('checkout_abandon_reserved', 'checkout_attempt', 'v1', 'reserved', 'abandoned', array['system'], array['amendment_or_cancellation'], 'release_liquidity_reservation', 'checkout.abandoned', 'Reserved Checkout is deliberately invalidated.'),
  ('checkout_abandon_open', 'checkout_attempt', 'v1', 'open', 'abandoned', array['system'], array['stripe_session_expired', 'amendment_or_cancellation'], 'release_liquidity_reservation', 'checkout.abandoned', 'Open Checkout is expired before replacement.'),

  ('payment_confirm_paid', 'payment_lifecycle', 'v1', 'awaiting_confirmation', 'paid', array['system'], array['signed_webhook', 'payment_amounts_match'], 'post_payment_receipt', 'payment.paid', 'Only a signed webhook confirms payment.'),
  ('payment_confirm_failed', 'payment_lifecycle', 'v1', 'awaiting_confirmation', 'failed', array['system'], array['definitive_failure'], null, 'payment.failed', 'Payment failed definitively.'),
  ('payment_partial_refund', 'payment_lifecycle', 'v1', 'paid', 'partially_refunded', array['system'], array['refund_confirmed'], 'post_partial_refund', 'payment.partially_refunded', 'Stripe confirms a partial refund.'),
  ('payment_full_refund', 'payment_lifecycle', 'v1', 'paid', 'refunded', array['system'], array['refund_confirmed'], 'post_full_refund', 'payment.refunded', 'Stripe confirms a full refund.'),
  ('payment_complete_remaining_refund', 'payment_lifecycle', 'v1', 'partially_refunded', 'refunded', array['system'], array['refund_confirmed', 'fully_refunded'], 'post_remaining_refund', 'payment.refunded', 'Subsequent refund completes the total.'),

  ('execution_reach_completion_threshold', 'service_execution', 'v1', 'planned', 'completion_eligible', array['system'], array['completion_not_before_reached'], null, 'execution.completion_eligible', 'Explicit end or start threshold has passed.'),
  ('execution_provider_declares_complete', 'service_execution', 'v1', 'completion_eligible', 'provider_completed_waiting_client', array['provider'], array['server_time_valid'], null, 'execution.provider_completed', 'Provider declaration starts the 48-hour protection window.'),
  ('execution_client_confirms_without_provider', 'service_execution', 'v1', 'completion_eligible', 'client_confirmed', array['client'], array['completion_not_before_reached'], null, 'execution.client_confirmed', 'Client confirmation may replace a missing provider declaration.'),
  ('execution_client_reports_problem_without_provider', 'service_execution', 'v1', 'completion_eligible', 'problem_reported', array['client'], array['completion_not_before_reached'], null, 'execution.problem_reported', 'Client may report a problem or no-show without a provider declaration.'),
  ('execution_client_confirms_provider', 'service_execution', 'v1', 'provider_completed_waiting_client', 'client_confirmed', array['client'], array['protection_window_open'], null, 'execution.client_confirmed', 'Client confirms during the protection window.'),
  ('execution_client_reports_problem', 'service_execution', 'v1', 'provider_completed_waiting_client', 'problem_reported', array['client'], array['protection_window_open'], null, 'execution.problem_reported', 'Client opens a service problem during protection.'),
  ('execution_stale_without_declaration', 'service_execution', 'v1', 'completion_eligible', 'stale_admin_review', array['system'], array['operational_delay_expired', 'no_party_action'], null, 'execution.stale_admin_review', 'No declaration or confirmation occurred.'),
  ('execution_conclude_confirmation', 'service_execution', 'v1', 'client_confirmed', 'concluded', array['system'], array['release_decision_recorded'], null, 'execution.concluded', 'Client confirmation has an explicit release path.'),
  ('execution_conclude_problem', 'service_execution', 'v1', 'problem_reported', 'concluded', array['admin', 'system'], array['service_dispute_resolved'], null, 'execution.concluded', 'Resolved dispute concludes execution.'),
  ('execution_conclude_admin_review', 'service_execution', 'v1', 'stale_admin_review', 'concluded', array['admin', 'system'], array['admin_outcome_recorded'], null, 'execution.concluded', 'Administrative outcome concludes execution.'),

  ('release_become_eligible', 'fund_release', 'v1', 'held', 'eligible', array['system'], array['client_confirmed_or_48h_elapsed'], null, 'release.eligible', 'A validated release trigger occurred.'),
  ('release_block_held', 'fund_release', 'v1', 'held', 'blocked', array['system'], array['financial_block_exists'], null, 'release.blocked', 'Financial or compliance block freezes held funds.'),
  ('release_block_eligible', 'fund_release', 'v1', 'eligible', 'blocked', array['system'], array['financial_block_exists'], null, 'release.blocked', 'New block prevents eligible release.'),
  ('release_reserve_automatic', 'fund_release', 'v1', 'eligible', 'release_reserved', array['system'], array['all_invariants_revalidated'], 'reserve_provider_allocation', 'release.reserved', 'System atomically reserves a valid full release.'),
  ('release_reserve_after_dispute', 'fund_release', 'v1', 'blocked', 'release_reserved', array['admin'], array['service_dispute_decided', 'recent_mfa', 'complete_allocation'], 'reserve_provider_allocation', 'release.reserved', 'Administrative decision explicitly allocates funds.'),
  ('release_post', 'fund_release', 'v1', 'release_reserved', 'released', array['system'], array['balanced_ledger_batch'], 'post_provider_allocation', 'release.released', 'Allocation is posted before transfer.'),
  ('release_cancel_held', 'fund_release', 'v1', 'held', 'cancelled', array['system'], array['zero_provider_award'], 'post_zero_provider_allocation', 'release.cancelled', 'Final allocation awards no provider funds.'),
  ('release_cancel_blocked', 'fund_release', 'v1', 'blocked', 'cancelled', array['system'], array['zero_provider_award', 'explicit_decision'], 'post_zero_provider_allocation', 'release.cancelled', 'Blocked funds are allocated away from provider.'),

  ('cancellation_client_requests_full', 'cancellation', 'v1', 'none', 'client_full_refund_requested', array['client'], array['commercial_cancellation'], null, 'cancellation.client_full_refund_requested', 'Launch default is a full-refund request.'),
  ('cancellation_provider_accepts_full', 'cancellation', 'v1', 'client_full_refund_requested', 'mutually_agreed', array['provider'], array['explicit_full_refund_acceptance'], null, 'cancellation.mutually_agreed', 'Provider accepts the client full-refund request.'),
  ('cancellation_provider_counteroffers_partial', 'cancellation', 'v1', 'client_full_refund_requested', 'provider_partial_allocation_proposed', array['provider'], array['complete_partial_allocation'], null, 'cancellation.partial_allocation_proposed', 'Provider proposes explicit partial amounts; no percentage is automatic.'),
  ('cancellation_client_accepts_partial', 'cancellation', 'v1', 'provider_partial_allocation_proposed', 'mutually_agreed', array['client'], array['explicit_partial_allocation_acceptance'], null, 'cancellation.mutually_agreed', 'Client explicitly accepts the provider counter-proposal.'),
  ('cancellation_client_rejects_partial', 'cancellation', 'v1', 'provider_partial_allocation_proposed', 'routed_to_dispute', array['client'], array['counterproposal_rejected'], null, 'cancellation.routed_to_dispute', 'Rejected counter-proposal requires adjudication.'),
  ('cancellation_provider_rejects_full', 'cancellation', 'v1', 'client_full_refund_requested', 'routed_to_dispute', array['provider'], array['full_refund_rejected'], null, 'cancellation.routed_to_dispute', 'Provider rejection requires adjudication.'),
  ('cancellation_full_request_timeout', 'cancellation', 'v1', 'client_full_refund_requested', 'routed_to_dispute', array['system'], array['response_deadline_expired'], null, 'cancellation.routed_to_dispute', 'No agreement before the configured deadline.'),
  ('cancellation_partial_offer_timeout', 'cancellation', 'v1', 'provider_partial_allocation_proposed', 'routed_to_dispute', array['system'], array['response_deadline_expired'], null, 'cancellation.routed_to_dispute', 'Client did not accept the partial allocation.'),
  ('cancellation_propose_mutual', 'cancellation', 'v1', 'none', 'mutual_allocation_proposed', array['client', 'provider'], array['complete_allocation'], null, 'cancellation.mutual_allocation_proposed', 'Either party may propose an explicit mutual allocation.'),
  ('cancellation_accept_mutual', 'cancellation', 'v1', 'mutual_allocation_proposed', 'mutually_agreed', array['client', 'provider'], array['counterparty_acceptance'], null, 'cancellation.mutually_agreed', 'The other party explicitly accepts the same allocation.'),
  ('cancellation_reject_mutual', 'cancellation', 'v1', 'mutual_allocation_proposed', 'routed_to_dispute', array['client', 'provider'], array['counterparty_rejection'], null, 'cancellation.routed_to_dispute', 'Rejected mutual proposal requires adjudication.'),
  ('cancellation_mutual_timeout', 'cancellation', 'v1', 'mutual_allocation_proposed', 'routed_to_dispute', array['system'], array['response_deadline_expired'], null, 'cancellation.routed_to_dispute', 'No mutual agreement before the deadline.'),
  ('cancellation_provider_cancels', 'cancellation', 'v1', 'none', 'provider_cancelled', array['provider'], array['provider_cancellation'], 'authorize_full_refund', 'cancellation.provider_cancelled', 'Provider cancellation mandates a full customer refund.'),
  ('cancellation_apply_legal_policy', 'cancellation', 'v1', 'none', 'legal_policy_applied', array['client', 'system'], array['validated_jurisdiction_policy'], null, 'cancellation.legal_policy_applied', 'Validated mandatory law determines allocation.'),
  ('cancellation_execute_mutual', 'cancellation', 'v1', 'mutually_agreed', 'financial_resolution_pending', array['system'], array['complete_allocation'], 'execute_cancellation_allocation', 'cancellation.financial_resolution_pending', 'Execute agreed allocation.'),
  ('cancellation_execute_legal', 'cancellation', 'v1', 'legal_policy_applied', 'financial_resolution_pending', array['system'], array['complete_allocation'], 'execute_cancellation_allocation', 'cancellation.financial_resolution_pending', 'Execute legal allocation.'),
  ('cancellation_execute_provider', 'cancellation', 'v1', 'provider_cancelled', 'financial_resolution_pending', array['system'], array['full_refund_allocation'], 'execute_full_refund', 'cancellation.financial_resolution_pending', 'Execute provider-cancellation refund.'),
  ('cancellation_execute_dispute_decision', 'cancellation', 'v1', 'routed_to_dispute', 'financial_resolution_pending', array['admin', 'system'], array['service_dispute_decided', 'complete_allocation'], 'execute_cancellation_allocation', 'cancellation.financial_resolution_pending', 'Execute adjudicated cancellation allocation.'),
  ('cancellation_resolve', 'cancellation', 'v1', 'financial_resolution_pending', 'resolved', array['system'], array['all_financial_operations_complete'], null, 'cancellation.resolved', 'Cancellation is financially complete.'),
  ('cancellation_reject_after_review', 'cancellation', 'v1', 'routed_to_dispute', 'rejected', array['admin', 'system'], array['validated_policy_or_decision', 'mission_maintained'], null, 'cancellation.rejected', 'Valid decision maintains the mission.'),

  ('service_dispute_open', 'service_dispute', 'v1', 'none', 'open', array['client', 'provider'], array['eligible_service_issue'], 'block_fund_release', 'service_dispute.opened', 'A party opens a service dispute.'),
  ('service_dispute_collect_evidence', 'service_dispute', 'v1', 'open', 'evidence_collection', array['system'], array['release_blocked'], null, 'service_dispute.evidence_collection', 'System opens evidence collection.'),
  ('service_dispute_start_review', 'service_dispute', 'v1', 'evidence_collection', 'admin_review', array['system', 'admin'], array['evidence_ready_or_deadline'], null, 'service_dispute.admin_review', 'Dossier enters administrative review.'),
  ('service_dispute_decide', 'service_dispute', 'v1', 'admin_review', 'decided', array['admin'], array['financial_permission', 'recent_mfa', 'complete_allocation', 'reason_and_evidence'], 'record_dispute_allocation', 'service_dispute.decided', 'Glossed records the final internal decision.'),
  ('service_dispute_execute', 'service_dispute', 'v1', 'decided', 'executing_allocation', array['system'], array['balanced_allocation'], 'execute_dispute_allocation', 'service_dispute.executing_allocation', 'System executes the decision idempotently.'),
  ('service_dispute_resolve', 'service_dispute', 'v1', 'executing_allocation', 'resolved', array['system'], array['all_financial_operations_complete'], null, 'service_dispute.resolved', 'Dispute decision is fully executed.'),

  ('refund_authorize', 'refund', 'v1', 'not_requested', 'authorized', array['system', 'admin'], array['valid_financial_decision'], 'reserve_refund', 'refund.authorized', 'Valid workflow authorizes a refund.'),
  ('refund_attempt_recovery', 'refund', 'v1', 'authorized', 'recovery_attempted', array['system'], array['provider_transfer_exists'], 'request_transfer_reversal', 'refund.recovery_attempted', 'Recovery is attempted before refund when possible.'),
  ('refund_submit_without_transfer', 'refund', 'v1', 'authorized', 'submitted', array['system'], array['no_provider_transfer', 'stable_idempotency_key'], 'submit_stripe_refund', 'refund.submitted', 'Refund is submitted without a prior transfer.'),
  ('refund_submit_after_recovery', 'refund', 'v1', 'recovery_attempted', 'submitted', array['system'], array['recovery_attempt_completed', 'stable_idempotency_key'], 'submit_stripe_refund', 'refund.submitted', 'Refund proceeds regardless of recovery result.'),
  ('refund_succeed', 'refund', 'v1', 'submitted', 'succeeded', array['system'], array['stripe_refund_confirmed'], 'post_refund', 'refund.succeeded', 'Stripe confirms the customer refund.'),
  ('refund_fail_retryable', 'refund', 'v1', 'submitted', 'failed_retryable', array['system'], array['transient_stripe_failure'], null, 'refund.failed_retryable', 'Transient failure permits retry.'),
  ('refund_retry', 'refund', 'v1', 'failed_retryable', 'submitted', array['system'], array['retry_policy_allows', 'stable_operation_identity'], 'submit_stripe_refund', 'refund.retried', 'Controlled retry uses the operation generation key.'),
  ('refund_manual_from_submitted', 'refund', 'v1', 'submitted', 'manual_review', array['system'], array['ambiguous_or_definitive_failure'], null, 'refund.manual_review', 'Ambiguous result requires review.'),
  ('refund_manual_from_failed', 'refund', 'v1', 'failed_retryable', 'manual_review', array['system'], array['retry_limit_or_definitive_failure'], null, 'refund.manual_review', 'Retries exhausted or failure became definitive.'),

  ('transfer_become_ready', 'provider_transfer', 'v1', 'not_eligible', 'ready', array['system'], array['funds_released', 'connect_capability_active', 'compliance_valid'], null, 'transfer.ready', 'Released funds and current capability allow transfer.'),
  ('transfer_reserve', 'provider_transfer', 'v1', 'ready', 'reserved', array['system'], array['all_invariants_revalidated'], 'reserve_provider_transfer', 'transfer.reserved', 'Atomic transfer operation is reserved.'),
  ('transfer_submit', 'provider_transfer', 'v1', 'reserved', 'submitted', array['system'], array['stable_idempotency_key', 'source_transaction_present'], 'submit_provider_transfer', 'transfer.submitted', 'Separate transfer is submitted to Stripe.'),
  ('transfer_succeed', 'provider_transfer', 'v1', 'submitted', 'succeeded', array['system'], array['stripe_transfer_confirmed'], 'post_provider_transfer', 'transfer.succeeded', 'Stripe confirms transfer.'),
  ('transfer_fail_retryable', 'provider_transfer', 'v1', 'submitted', 'failed_retryable', array['system'], array['transient_stripe_failure'], null, 'transfer.failed_retryable', 'Transient transfer failure permits retry.'),
  ('transfer_retry', 'provider_transfer', 'v1', 'failed_retryable', 'reserved', array['system'], array['retry_policy_allows'], null, 'transfer.retry_reserved', 'Retry returns to an atomic reservation.'),
  ('transfer_block_not_eligible', 'provider_transfer', 'v1', 'not_eligible', 'blocked', array['system'], array['financial_or_compliance_block'], null, 'transfer.blocked', 'A block prevents readiness.'),
  ('transfer_block_ready', 'provider_transfer', 'v1', 'ready', 'blocked', array['system'], array['financial_or_compliance_block'], null, 'transfer.blocked', 'A new block prevents transfer.'),
  ('transfer_block_reserved', 'provider_transfer', 'v1', 'reserved', 'blocked', array['system'], array['financial_or_compliance_block'], null, 'transfer.blocked', 'A new block cancels reservation.'),
  ('transfer_manual_from_failed', 'provider_transfer', 'v1', 'failed_retryable', 'manual_review', array['system'], array['retry_limit_or_definitive_failure'], null, 'transfer.manual_review', 'Transfer failure requires review.'),
  ('transfer_manual_from_blocked', 'provider_transfer', 'v1', 'blocked', 'manual_review', array['system'], array['administrative_intervention_required'], null, 'transfer.manual_review', 'Persistent block requires review.'),

  ('reversal_request_provisional', 'transfer_reversal', 'v1', 'none', 'requested_provisional', array['system'], array['payment_dispute_open', 'amount_within_related_provider_share'], 'reserve_provisional_recovery', 'transfer_reversal.provisional_requested', 'Chargeback triggers provisional recovery only.'),
  ('reversal_request_final', 'transfer_reversal', 'v1', 'none', 'requested_final', array['system', 'admin'], array['final_refund_or_allocation', 'amount_within_related_provider_share'], 'reserve_final_recovery', 'transfer_reversal.final_requested', 'Final decision requests recovery.'),
  ('reversal_submit_provisional', 'transfer_reversal', 'v1', 'requested_provisional', 'submitted', array['system'], array['stable_idempotency_key'], 'submit_transfer_reversal', 'transfer_reversal.submitted', 'Provisional reversal is submitted.'),
  ('reversal_submit_final', 'transfer_reversal', 'v1', 'requested_final', 'submitted', array['system'], array['stable_idempotency_key'], 'submit_transfer_reversal', 'transfer_reversal.submitted', 'Final reversal is submitted.'),
  ('reversal_partial', 'transfer_reversal', 'v1', 'submitted', 'partially_recovered', array['system'], array['stripe_reversal_confirmed'], 'post_partial_recovery', 'transfer_reversal.partially_recovered', 'Stripe recovers only part of the request.'),
  ('reversal_full', 'transfer_reversal', 'v1', 'submitted', 'fully_recovered', array['system'], array['stripe_reversal_confirmed'], 'post_full_recovery', 'transfer_reversal.fully_recovered', 'Stripe recovers the requested amount.'),
  ('reversal_fail', 'transfer_reversal', 'v1', 'submitted', 'failed', array['system'], array['recovery_unavailable'], 'record_recovery_deficit', 'transfer_reversal.failed', 'Recovery failure is recorded without future-gain offset.'),
  ('reversal_retransfer_full', 'transfer_reversal', 'v1', 'fully_recovered', 'retransferred', array['system'], array['payment_dispute_won', 'connect_capability_active'], 'retransfer_provisional_recovery', 'transfer_reversal.retransferred', 'Won chargeback returns provisional recovery.'),
  ('reversal_retransfer_partial', 'transfer_reversal', 'v1', 'partially_recovered', 'retransferred', array['system'], array['payment_dispute_won', 'connect_capability_active'], 'retransfer_provisional_recovery', 'transfer_reversal.retransferred', 'Won chargeback returns the partially recovered amount.'),

  ('payment_dispute_open', 'payment_dispute', 'v1', 'none', 'open', array['system'], array['signed_stripe_webhook'], 'record_dispute_debit', 'payment_dispute.opened', 'Stripe webhook opens the banking dispute.'),
  ('payment_dispute_recover_provisionally', 'payment_dispute', 'v1', 'open', 'provisional_recovery', array['system'], array['provider_transfer_exists'], 'request_provisional_reversal', 'payment_dispute.provisional_recovery', 'Glossed protects cash provisionally without assigning liability.'),
  ('payment_dispute_collect_from_open', 'payment_dispute', 'v1', 'open', 'evidence_collection', array['system'], array['evidence_window_open'], null, 'payment_dispute.evidence_collection', 'Evidence collection begins without a recoverable transfer.'),
  ('payment_dispute_collect_after_recovery', 'payment_dispute', 'v1', 'provisional_recovery', 'evidence_collection', array['system'], array['recovery_attempt_recorded'], null, 'payment_dispute.evidence_collection', 'Evidence collection follows provisional recovery.'),
  ('payment_dispute_submit_evidence', 'payment_dispute', 'v1', 'evidence_collection', 'stripe_review', array['system', 'admin'], array['evidence_submission_complete'], null, 'payment_dispute.stripe_review', 'Stripe and card network decide the chargeback.'),
  ('payment_dispute_won', 'payment_dispute', 'v1', 'stripe_review', 'won', array['system'], array['signed_stripe_webhook'], 'record_dispute_victory', 'payment_dispute.won', 'Stripe reports a victory.'),
  ('payment_dispute_lost', 'payment_dispute', 'v1', 'stripe_review', 'lost', array['system'], array['signed_stripe_webhook'], 'record_dispute_loss', 'payment_dispute.lost', 'Stripe reports a loss.'),
  ('payment_dispute_resolve_win', 'payment_dispute', 'v1', 'won', 'resolved', array['system'], array['provisional_recovery_retransferred_or_none'], 'finalize_dispute_victory', 'payment_dispute.resolved', 'Won dispute is reconciled.'),
  ('payment_dispute_review_liability', 'payment_dispute', 'v1', 'lost', 'liability_admin_review', array['system'], array['liability_policy_missing_or_review_required'], null, 'payment_dispute.liability_admin_review', 'No automatic provider liability is inferred.'),
  ('payment_dispute_resolve_loss', 'payment_dispute', 'v1', 'liability_admin_review', 'resolved', array['admin', 'system'], array['validated_liability_policy_or_admin_decision', 'complete_allocation'], 'finalize_dispute_loss', 'payment_dispute.resolved', 'Loss allocation is explicit and audited.'),

  ('payout_funds_available', 'payout', 'v1', 'not_eligible', 'available', array['system'], array['released_connect_balance_available'], null, 'payout.available', 'Released funds become payout-eligible.'),
  ('payout_schedule_standard', 'payout', 'v1', 'available', 'scheduled', array['system'], array['configured_schedule_due'], null, 'payout.scheduled', 'Standard payout is queued on the configurable twice-weekly schedule.'),
  ('payout_quote_instant', 'payout', 'v1', 'available', 'instant_quote', array['provider'], array['stripe_instant_payout_eligible', 'exact_fee_available'], null, 'payout.instant_quote', 'Provider sees the exact Stripe fee.'),
  ('payout_confirm_instant', 'payout', 'v1', 'instant_quote', 'instant_confirmed', array['provider'], array['exact_fee_explicitly_accepted'], null, 'payout.instant_confirmed', 'Provider accepts the fee without a Glossed margin.'),
  ('payout_submit_standard', 'payout', 'v1', 'scheduled', 'submitted', array['system'], array['all_available_funds', 'minimum_threshold_zero'], 'submit_standard_payout', 'payout.submitted', 'Configured standard payout is submitted.'),
  ('payout_submit_instant', 'payout', 'v1', 'instant_confirmed', 'submitted', array['system'], array['quote_still_valid', 'funds_still_available'], 'submit_instant_payout', 'payout.submitted', 'Confirmed instant payout is submitted.'),
  ('payout_paid', 'payout', 'v1', 'submitted', 'paid', array['system'], array['signed_stripe_webhook'], 'post_bank_payout', 'payout.paid', 'Stripe confirms the bank payout.'),
  ('payout_failed', 'payout', 'v1', 'submitted', 'failed', array['system'], array['signed_stripe_webhook_or_definitive_failure'], 'record_payout_failure', 'payout.failed', 'Payout failure remains reconcilable.'),
  ('payout_retry_available', 'payout', 'v1', 'failed', 'available', array['system'], array['funds_returned_to_available_balance'], null, 'payout.available', 'Failed payout funds become available again.'),
  ('payout_cancel_scheduled', 'payout', 'v1', 'scheduled', 'cancelled', array['system'], array['stripe_allows_cancellation'], null, 'payout.cancelled', 'Scheduled payout is cancelled before submission.'),
  ('payout_cancel_quote', 'payout', 'v1', 'instant_quote', 'cancelled', array['provider', 'system'], array['quote_cancelled_or_expired'], null, 'payout.cancelled', 'Instant quote is cancelled or expires.');

set constraints workflow_machine_initial_state_fkey immediate;

create table public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  machine_code text not null,
  machine_version text not null,
  subject_type text not null,
  subject_id uuid not null,
  current_state text not null,
  financial_flow_version text
    references public.financial_flow_versions(version) on delete restrict,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (machine_code, machine_version, subject_type, subject_id),
  foreign key (machine_code, machine_version)
    references public.workflow_machine_versions(machine_code, version)
    on delete restrict,
  foreign key (machine_code, machine_version, current_state)
    references public.workflow_states(machine_code, machine_version, state_code)
    on delete restrict
);

create table public.workflow_transition_events (
  id bigint generated always as identity primary key,
  instance_id uuid not null
    references public.workflow_instances(id) on delete restrict,
  event_kind text not null check (event_kind in ('instance_created', 'transition')),
  transition_code text references public.workflow_transitions(transition_code) on delete restrict,
  from_state text,
  to_state text not null,
  actor_type text not null check (actor_type in ('client', 'provider', 'system', 'admin')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  reason text check (reason is null or length(trim(reason)) between 1 and 4000),
  evidence jsonb not null default '{}'::jsonb,
  revision bigint not null check (revision > 0),
  deduplication_key text not null unique,
  created_at timestamptz not null default now(),
  constraint workflow_event_transition_shape check (
    (event_kind = 'instance_created' and transition_code is null and from_state is null)
    or
    (event_kind = 'transition' and transition_code is not null and from_state is not null)
  ),
  constraint workflow_event_actor_consistent check (
    (actor_type = 'system' and actor_user_id is null)
    or
    (actor_type in ('client', 'provider', 'admin') and actor_user_id is not null)
  ),
  constraint workflow_event_evidence_object check (jsonb_typeof(evidence) = 'object'),
  constraint workflow_event_dedup_length check (
    length(deduplication_key) between 1 and 255
  )
);

create index workflow_events_instance_idx
  on public.workflow_transition_events(instance_id, revision, id);

create or replace function public.protect_workflow_instance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Workflow instances cannot be deleted'
      using errcode = '55000';
  end if;

  if current_setting('app.transition_workflow_instance', true) is distinct from 'on' then
    raise exception 'Workflow instances can only change through the transition function'
      using errcode = '55000';
  end if;

  if new.id is distinct from old.id
     or new.machine_code is distinct from old.machine_code
     or new.machine_version is distinct from old.machine_version
     or new.subject_type is distinct from old.subject_type
     or new.subject_id is distinct from old.subject_id
     or new.financial_flow_version is distinct from old.financial_flow_version
     or new.created_at is distinct from old.created_at
     or new.current_state is not distinct from old.current_state
     or new.revision <> old.revision + 1
     or new.updated_at <= old.updated_at then
    raise exception 'Invalid workflow instance transition'
      using errcode = '55000';
  end if;

  return new;
end
$$;

create trigger protect_workflow_instance
before update or delete on public.workflow_instances
for each row execute function public.protect_workflow_instance();

create trigger workflow_transition_events_immutable
before update or delete on public.workflow_transition_events
for each row execute function public.reject_financial_definition_mutation();

create or replace function public.create_workflow_instance(
  p_machine_code text,
  p_machine_version text,
  p_subject_id uuid,
  p_financial_flow_version text,
  p_actor_type text,
  p_actor_user_id uuid,
  p_reason text,
  p_evidence jsonb,
  p_deduplication_key text
)
returns public.workflow_instances
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_machine public.workflow_machine_versions%rowtype;
  v_instance public.workflow_instances%rowtype;
  v_existing_instance_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_actor_type is null
     or p_actor_type not in ('client', 'provider', 'system', 'admin')
     or (p_actor_type = 'system' and p_actor_user_id is not null)
     or (p_actor_type <> 'system' and p_actor_user_id is null) then
    raise exception 'Invalid workflow actor' using errcode = '22023';
  end if;
  if p_subject_id is null
     or p_deduplication_key is null
     or length(p_deduplication_key) not between 1 and 255
     or coalesce(jsonb_typeof(p_evidence), 'object') <> 'object' then
    raise exception 'Invalid workflow instance input' using errcode = '22023';
  end if;

  select e.instance_id into v_existing_instance_id
  from public.workflow_transition_events e
  where e.deduplication_key = p_deduplication_key;
  if found then
    select * into v_instance from public.workflow_instances where id = v_existing_instance_id;
    return v_instance;
  end if;

  select * into v_machine
  from public.workflow_machine_versions
  where machine_code = p_machine_code and version = p_machine_version;
  if not found then
    raise exception 'Workflow machine version not found' using errcode = 'P0002';
  end if;

  insert into public.workflow_instances (
    machine_code, machine_version, subject_type, subject_id,
    current_state, financial_flow_version
  ) values (
    v_machine.machine_code, v_machine.version, v_machine.subject_type,
    p_subject_id, v_machine.initial_state, p_financial_flow_version
  )
  on conflict (machine_code, machine_version, subject_type, subject_id) do nothing
  returning * into v_instance;

  if v_instance.id is null then
    select e.instance_id into v_existing_instance_id
    from public.workflow_transition_events e
    where e.deduplication_key = p_deduplication_key;
    if found then
      select * into v_instance
      from public.workflow_instances
      where id = v_existing_instance_id;
      return v_instance;
    end if;
    raise exception 'Workflow instance already exists with another operation identity'
      using errcode = '23505';
  end if;

  insert into public.workflow_transition_events (
    instance_id, event_kind, transition_code, from_state, to_state,
    actor_type, actor_user_id, reason, evidence, revision, deduplication_key
  ) values (
    v_instance.id, 'instance_created', null, null, v_instance.current_state,
    p_actor_type, p_actor_user_id, p_reason, coalesce(p_evidence, '{}'::jsonb),
    v_instance.revision, p_deduplication_key
  );

  return v_instance;
end
$$;

create or replace function public.transition_workflow_instance(
  p_instance_id uuid,
  p_expected_revision bigint,
  p_transition_code text,
  p_actor_type text,
  p_actor_user_id uuid,
  p_reason text,
  p_evidence jsonb,
  p_deduplication_key text
)
returns public.workflow_instances
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_instance public.workflow_instances%rowtype;
  v_transition public.workflow_transitions%rowtype;
  v_existing_instance_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_actor_type is null
     or p_actor_type not in ('client', 'provider', 'system', 'admin')
     or (p_actor_type = 'system' and p_actor_user_id is not null)
     or (p_actor_type <> 'system' and p_actor_user_id is null) then
    raise exception 'Invalid workflow actor' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision <= 0
     or p_deduplication_key is null
     or length(p_deduplication_key) not between 1 and 255
     or coalesce(jsonb_typeof(p_evidence), 'object') <> 'object' then
    raise exception 'Invalid workflow transition input' using errcode = '22023';
  end if;

  select e.instance_id into v_existing_instance_id
  from public.workflow_transition_events e
  where e.deduplication_key = p_deduplication_key;
  if found then
    if v_existing_instance_id <> p_instance_id then
      raise exception 'Workflow operation identity belongs to another instance'
        using errcode = '23505';
    end if;
    select * into v_instance from public.workflow_instances where id = p_instance_id;
    return v_instance;
  end if;

  select * into v_instance
  from public.workflow_instances
  where id = p_instance_id
  for update;
  if not found then
    raise exception 'Workflow instance not found' using errcode = 'P0002';
  end if;

  select e.instance_id into v_existing_instance_id
  from public.workflow_transition_events e
  where e.deduplication_key = p_deduplication_key;
  if found then
    if v_existing_instance_id <> p_instance_id then
      raise exception 'Workflow operation identity belongs to another instance'
        using errcode = '23505';
    end if;
    return v_instance;
  end if;

  if v_instance.revision <> p_expected_revision then
    raise exception 'Workflow instance changed concurrently' using errcode = '40001';
  end if;

  select * into v_transition
  from public.workflow_transitions
  where transition_code = p_transition_code
    and machine_code = v_instance.machine_code
    and machine_version = v_instance.machine_version
    and from_state = v_instance.current_state
    and p_actor_type = any(allowed_actor_types);
  if not found then
    raise exception 'Workflow transition is not allowed from the current state for this actor'
      using errcode = '23514';
  end if;

  perform set_config('app.transition_workflow_instance', 'on', true);
  update public.workflow_instances
  set current_state = v_transition.to_state,
      revision = revision + 1,
      updated_at = clock_timestamp()
  where id = v_instance.id
  returning * into v_instance;
  perform set_config('app.transition_workflow_instance', 'off', true);

  insert into public.workflow_transition_events (
    instance_id, event_kind, transition_code, from_state, to_state,
    actor_type, actor_user_id, reason, evidence, revision, deduplication_key
  ) values (
    v_instance.id, 'transition', v_transition.transition_code,
    v_transition.from_state, v_transition.to_state,
    p_actor_type, p_actor_user_id, p_reason, coalesce(p_evidence, '{}'::jsonb),
    v_instance.revision, p_deduplication_key
  );

  return v_instance;
end
$$;

create table public.financial_terms_snapshots (
  id uuid primary key default gen_random_uuid(),
  financial_flow_version text not null
    references public.financial_flow_versions(version) on delete restrict,
  request_id uuid not null references public.bookings(id) on delete restrict,
  proposal_id uuid not null references public.missions(id) on delete restrict,
  proposal_version integer not null check (proposal_version > 0),
  currency text not null,
  service_amount_cents bigint not null check (service_amount_cents > 0),
  travel_amount_cents bigint not null check (travel_amount_cents >= 0),
  provider_initial_gross_amount_cents bigint not null
    check (provider_initial_gross_amount_cents > 0),
  platform_fee_rate_bps integer not null check (platform_fee_rate_bps between 0 and 10000),
  platform_fee_initial_amount_cents bigint not null
    check (platform_fee_initial_amount_cents >= 0),
  client_tax_initial_amount_cents bigint not null default 0
    check (client_tax_initial_amount_cents >= 0),
  client_total_amount_cents bigint not null check (client_total_amount_cents > 0),
  provider_initial_statutory_withholding_cents bigint not null default 0
    check (provider_initial_statutory_withholding_cents >= 0),
  provider_initial_transfer_amount_cents bigint not null
    check (provider_initial_transfer_amount_cents >= 0),
  rounding_mode text not null default 'half_up' check (rounding_mode = 'half_up'),
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz,
  completion_not_before_at timestamptz generated always as (
    coalesce(scheduled_end_at, scheduled_start_at)
  ) stored,
  jurisdiction_code text,
  contract_version text not null,
  eligibility_policy_version text,
  cancellation_policy_version text,
  created_by_actor_type text not null check (created_by_actor_type in ('system', 'admin')),
  created_by uuid references auth.users(id) on delete restrict,
  deduplication_key text not null unique,
  created_at timestamptz not null default now(),
  unique (proposal_id, proposal_version),
  constraint financial_terms_currency_format check (currency ~ '^[a-z]{3}$'),
  constraint financial_terms_provider_gross check (
    provider_initial_gross_amount_cents = service_amount_cents + travel_amount_cents
  ),
  constraint financial_terms_platform_fee check (
    platform_fee_initial_amount_cents = round(
      provider_initial_gross_amount_cents::numeric * platform_fee_rate_bps::numeric / 10000
    )::bigint
  ),
  constraint financial_terms_client_total check (
    client_total_amount_cents = provider_initial_gross_amount_cents
      + platform_fee_initial_amount_cents
      + client_tax_initial_amount_cents
  ),
  constraint financial_terms_provider_transfer check (
    provider_initial_transfer_amount_cents
      + provider_initial_statutory_withholding_cents
      = provider_initial_gross_amount_cents
  ),
  constraint financial_terms_schedule check (
    scheduled_end_at is null or scheduled_end_at >= scheduled_start_at
  ),
  constraint financial_terms_jurisdiction_format check (
    jurisdiction_code is null or jurisdiction_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'
  ),
  constraint financial_terms_contract_version_length check (
    length(contract_version) between 1 and 100
  ),
  constraint financial_terms_policy_lengths check (
    (eligibility_policy_version is null or length(eligibility_policy_version) between 1 and 100)
    and
    (cancellation_policy_version is null or length(cancellation_policy_version) between 1 and 100)
  ),
  constraint financial_terms_actor_consistent check (
    (created_by_actor_type = 'system' and created_by is null)
    or
    (created_by_actor_type = 'admin' and created_by is not null)
  ),
  constraint financial_terms_dedup_length check (
    length(deduplication_key) between 1 and 255
  )
);

comment on table public.financial_terms_snapshots is
  'Immutable contractual money snapshot in minor units. No row is created by legacy_v1 automatically.';

create table public.financial_allocation_snapshots (
  id uuid primary key default gen_random_uuid(),
  terms_snapshot_id uuid not null
    references public.financial_terms_snapshots(id) on delete restrict,
  previous_snapshot_id uuid
    references public.financial_allocation_snapshots(id) on delete restrict,
  revision integer not null check (revision > 0),
  allocation_reason text not null,
  currency text not null,
  provider_awarded_gross_amount_cents bigint not null
    check (provider_awarded_gross_amount_cents >= 0),
  platform_fee_final_amount_cents bigint not null
    check (platform_fee_final_amount_cents >= 0),
  client_refund_amount_cents bigint not null
    check (client_refund_amount_cents >= 0),
  client_tax_allocated_amount_cents bigint not null default 0
    check (client_tax_allocated_amount_cents >= 0),
  provider_statutory_withholding_amount_cents bigint not null default 0
    check (provider_statutory_withholding_amount_cents >= 0),
  provider_transfer_amount_cents bigint not null
    check (provider_transfer_amount_cents >= 0),
  stripe_payment_fee_actual_amount_cents bigint
    check (stripe_payment_fee_actual_amount_cents is null or stripe_payment_fee_actual_amount_cents >= 0),
  stripe_dispute_fee_actual_amount_cents bigint
    check (stripe_dispute_fee_actual_amount_cents is null or stripe_dispute_fee_actual_amount_cents >= 0),
  stripe_payout_fee_actual_amount_cents bigint
    check (stripe_payout_fee_actual_amount_cents is null or stripe_payout_fee_actual_amount_cents >= 0),
  stripe_payout_fee_bearer text check (stripe_payout_fee_bearer in ('platform', 'provider')),
  provisional_provider_recovery_amount_cents bigint not null default 0
    check (provisional_provider_recovery_amount_cents >= 0),
  definitive_provider_liability_amount_cents bigint not null default 0
    check (definitive_provider_liability_amount_cents >= 0),
  platform_recovery_deficit_amount_cents bigint not null default 0
    check (platform_recovery_deficit_amount_cents >= 0),
  platform_final_loss_amount_cents bigint not null default 0
    check (platform_final_loss_amount_cents >= 0),
  is_final boolean not null default false,
  created_by_actor_type text not null check (created_by_actor_type in ('system', 'admin')),
  created_by uuid references auth.users(id) on delete restrict,
  decision_reason text not null check (length(trim(decision_reason)) between 1 and 4000),
  evidence jsonb not null default '{}'::jsonb,
  deduplication_key text not null unique,
  created_at timestamptz not null default now(),
  unique (terms_snapshot_id, revision),
  constraint financial_allocation_currency_format check (currency ~ '^[a-z]{3}$'),
  constraint financial_allocation_reason_format check (
    allocation_reason ~ '^[a-z][a-z0-9_]{2,100}$'
  ),
  constraint financial_allocation_payout_fee_consistent check (
    (stripe_payout_fee_actual_amount_cents is null and stripe_payout_fee_bearer is null)
    or
    (stripe_payout_fee_actual_amount_cents is not null and stripe_payout_fee_bearer is not null)
  ),
  constraint financial_allocation_actor_consistent check (
    (created_by_actor_type = 'system' and created_by is null)
    or
    (created_by_actor_type = 'admin' and created_by is not null)
  ),
  constraint financial_allocation_evidence_object check (jsonb_typeof(evidence) = 'object'),
  constraint financial_allocation_dedup_length check (
    length(deduplication_key) between 1 and 255
  ),
  constraint financial_allocation_not_self_previous check (
    previous_snapshot_id is null or previous_snapshot_id <> id
  )
);

comment on table public.financial_allocation_snapshots is
  'Append-only allocation snapshots. Provider withholding is a subset of awarded gross, never an extra reduction of the client refund.';

create or replace function public.validate_financial_allocation_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_terms public.financial_terms_snapshots%rowtype;
  v_previous public.financial_allocation_snapshots%rowtype;
  v_expected_fee bigint;
begin
  select * into v_terms
  from public.financial_terms_snapshots
  where id = new.terms_snapshot_id;
  if not found then
    raise exception 'Financial terms snapshot not found' using errcode = '23503';
  end if;

  if new.currency <> v_terms.currency then
    raise exception 'Allocation currency does not match financial terms'
      using errcode = '23514';
  end if;
  if new.provider_awarded_gross_amount_cents > v_terms.provider_initial_gross_amount_cents then
    raise exception 'Provider award exceeds the contracted gross amount'
      using errcode = '23514';
  end if;

  v_expected_fee := round(
    new.provider_awarded_gross_amount_cents::numeric
      * v_terms.platform_fee_rate_bps::numeric / 10000
  )::bigint;
  if new.platform_fee_final_amount_cents <> v_expected_fee then
    raise exception 'Final platform fee does not match awarded provider gross'
      using errcode = '23514';
  end if;

  -- The statutory withholding is contained inside the provider gross award.
  -- It must not be subtracted again when calculating the customer refund.
  if new.provider_transfer_amount_cents
       + new.provider_statutory_withholding_amount_cents
       <> new.provider_awarded_gross_amount_cents then
    raise exception 'Provider transfer and withholding do not allocate the gross provider award'
      using errcode = '23514';
  end if;

  if new.client_tax_allocated_amount_cents > v_terms.client_tax_initial_amount_cents then
    raise exception 'Allocated client tax exceeds the initial client tax'
      using errcode = '23514';
  end if;
  if new.provider_awarded_gross_amount_cents
       + new.platform_fee_final_amount_cents
       + new.client_refund_amount_cents
       + new.client_tax_allocated_amount_cents
       <> v_terms.client_total_amount_cents then
    raise exception 'Allocation does not assign every customer cent exactly once'
      using errcode = '23514';
  end if;

  if new.provisional_provider_recovery_amount_cents
       > new.provider_awarded_gross_amount_cents
     or new.definitive_provider_liability_amount_cents
       > new.provider_awarded_gross_amount_cents then
    raise exception 'Provider recovery or liability exceeds the related gross award'
      using errcode = '23514';
  end if;

  if new.revision = 1 then
    if new.previous_snapshot_id is not null then
      raise exception 'First allocation revision cannot have a predecessor'
        using errcode = '23514';
    end if;
  else
    if new.previous_snapshot_id is null then
      raise exception 'Later allocation revision requires a predecessor'
        using errcode = '23514';
    end if;
    select * into v_previous
    from public.financial_allocation_snapshots
    where id = new.previous_snapshot_id;
    if not found
       or v_previous.terms_snapshot_id <> new.terms_snapshot_id
       or v_previous.revision <> new.revision - 1 then
      raise exception 'Allocation predecessor is not the prior revision for these terms'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;

create trigger validate_financial_allocation_snapshot
before insert on public.financial_allocation_snapshots
for each row execute function public.validate_financial_allocation_snapshot();

create trigger financial_terms_snapshots_immutable
before update or delete on public.financial_terms_snapshots
for each row execute function public.reject_financial_definition_mutation();

create trigger financial_allocation_snapshots_immutable
before update or delete on public.financial_allocation_snapshots
for each row execute function public.reject_financial_definition_mutation();

alter table public.workflow_machine_versions enable row level security;
alter table public.workflow_states enable row level security;
alter table public.workflow_transitions enable row level security;
alter table public.workflow_instances enable row level security;
alter table public.workflow_transition_events enable row level security;
alter table public.financial_terms_snapshots enable row level security;
alter table public.financial_allocation_snapshots enable row level security;

revoke all on public.workflow_machine_versions from public, anon, authenticated;
revoke all on public.workflow_states from public, anon, authenticated;
revoke all on public.workflow_transitions from public, anon, authenticated;
revoke all on public.workflow_instances from public, anon, authenticated;
revoke all on public.workflow_transition_events from public, anon, authenticated;
revoke all on public.financial_terms_snapshots from public, anon, authenticated;
revoke all on public.financial_allocation_snapshots from public, anon, authenticated;
revoke all on function public.financial_text_array_is_unique(text[])
  from public, anon, authenticated;
revoke all on function public.financial_text_array_matches(text[], text)
  from public, anon, authenticated;

grant all on public.workflow_machine_versions to service_role;
grant all on public.workflow_states to service_role;
grant all on public.workflow_transitions to service_role;
grant all on public.workflow_instances to service_role;
grant all on public.workflow_transition_events to service_role;
grant all on public.financial_terms_snapshots to service_role;
grant all on public.financial_allocation_snapshots to service_role;

revoke all on sequence public.workflow_transition_events_id_seq
from public, anon, authenticated;
grant all on sequence public.workflow_transition_events_id_seq to service_role;

revoke all on function public.protect_workflow_instance()
from public, anon, authenticated;
revoke all on function public.create_workflow_instance(
  text, text, uuid, text, text, uuid, text, jsonb, text
) from public, anon, authenticated;
revoke all on function public.transition_workflow_instance(
  uuid, bigint, text, text, uuid, text, jsonb, text
) from public, anon, authenticated;
revoke all on function public.validate_financial_allocation_snapshot()
from public, anon, authenticated;

grant execute on function public.create_workflow_instance(
  text, text, uuid, text, text, uuid, text, jsonb, text
) to service_role;
grant execute on function public.transition_workflow_instance(
  uuid, bigint, text, text, uuid, text, jsonb, text
) to service_role;

commit;
