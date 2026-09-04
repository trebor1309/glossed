-- Stripe may report payout.failed after a payout was previously reported paid.
-- Preserve both facts, release the internal payout reservation exactly once,
-- and move the payout workflow into the existing reconcilable failed state.

alter table public.provider_payouts_v2
  drop constraint provider_payout_terminal_exclusive;

alter table public.provider_payouts_v2
  add constraint provider_payout_terminal_consistent check (
    (cancelled_at is null or (paid_at is null and failed_at is null))
    and (paid_at is null or failed_at is null or failed_at >= paid_at)
  );

alter table public.provider_payout_attempts_v2
  drop constraint provider_payout_attempts_v2_outcome_check;

alter table public.provider_payout_attempts_v2
  add constraint provider_payout_attempts_v2_outcome_check check (outcome in (
    'submitted', 'retryable_failure', 'definitive_failure', 'paid', 'returned'
  ));

insert into public.workflow_transitions (
  transition_code, machine_code, machine_version, from_state, to_state,
  allowed_actor_types, condition_codes, financial_effect_code,
  audit_event_type, description
) values (
  'payout_returned_after_paid', 'payout', 'v1', 'paid', 'failed',
  array['system'], array['signed_stripe_webhook_after_paid'],
  'release_returned_payout_balance', 'payout.returned',
  'Stripe reports that a previously paid payout was returned or failed.'
);

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
  v_outcome text;
  v_actual_fee bigint;
  v_payout_feature_enabled boolean;
  v_returned_after_paid boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_event
  from public.stripe_payout_v2_webhook_events where event_id = p_event_id;
  if found then
    return query select v_event.payout_id, true, v_event.outcome;
    return;
  end if;

  select * into v_payout
  from public.provider_payouts_v2
  where (p_local_payout_id is not null and id = p_local_payout_id)
     or stripe_payout_id = p_stripe_payout_id
  order by (id = p_local_payout_id) desc
  limit 1 for update;

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
    return query select null::uuid, false, v_outcome;
    return;
  end if;

  -- Recheck the event claim after acquiring the payout serialization lock.
  select * into v_event
  from public.stripe_payout_v2_webhook_events where event_id = p_event_id;
  if found then
    return query select v_event.payout_id, true, v_event.outcome;
    return;
  end if;
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
    stripe_status = case
      when p_event_type = 'payout.failed' then 'failed'
      when failed_at is not null then 'failed'
      when cancelled_at is not null then 'canceled'
      when paid_at is not null then 'paid'
      else p_status
    end,
    arrival_date = coalesce(p_arrival_date, arrival_date),
    stripe_application_fee_id = coalesce(
      stripe_application_fee_id, p_stripe_application_fee_id
    ),
    stripe_balance_transaction_id = coalesce(
      stripe_balance_transaction_id, p_stripe_balance_transaction_id
    ),
    provider_fee_charged_amount_cents = case
      when payout_method = 'instant' and p_application_fee_amount_cents is not null
        then p_application_fee_amount_cents
      else provider_fee_charged_amount_cents
    end,
    stripe_fee_actual_amount_cents = case
      when v_actual_fee > 0 then v_actual_fee else stripe_fee_actual_amount_cents
    end,
    platform_fee_absorbed_amount_cents = case
      when payout_method = 'standard' then v_actual_fee
      else platform_fee_absorbed_amount_cents
    end,
    updated_at = clock_timestamp()
  where id = v_payout.id returning * into v_payout;
  perform set_config('app.provider_payouts_v2_mutation', 'off', true);

  select * into v_workflow
  from public.workflow_instances where id = v_payout.workflow_instance_id for update;
  if p_event_type = 'payout.paid' and v_workflow.current_state = 'submitted' then
    perform public.transition_workflow_instance(
      v_workflow.id, v_workflow.revision, 'payout_paid', 'system', null,
      'Signed Stripe webhook confirmed bank payout.',
      jsonb_build_object('stripe_payout_id', p_stripe_payout_id),
      'provider-payout-v2:' || v_payout.id::text || ':paid'
    );
    perform set_config('app.provider_payouts_v2_mutation', 'on', true);
    update public.provider_payouts_v2 set
      paid_at = coalesce(paid_at, p_stripe_created_at),
      stripe_status = 'paid', updated_at = clock_timestamp()
    where id = v_payout.id returning * into v_payout;
    perform set_config('app.provider_payouts_v2_mutation', 'off', true);
    insert into public.provider_payout_attempts_v2 (
      payout_id, attempt_number, outcome, stripe_payout_id
    ) values (
      v_payout.id, greatest(v_payout.attempt_count, 1), 'paid', p_stripe_payout_id
    ) on conflict do nothing;
    v_outcome := 'paid';
  elsif p_event_type = 'payout.failed'
        and v_workflow.current_state in ('submitted', 'paid') then
    v_returned_after_paid := v_workflow.current_state = 'paid';
    perform public.transition_workflow_instance(
      v_workflow.id, v_workflow.revision,
      case when v_returned_after_paid
        then 'payout_returned_after_paid' else 'payout_failed' end,
      'system', null,
      coalesce(p_failure_message,
        case when v_returned_after_paid then 'Stripe returned a previously paid bank payout.'
          else 'Stripe bank payout failed.' end),
      jsonb_build_object(
        'failure_code', p_failure_code,
        'stripe_payout_id', p_stripe_payout_id,
        'previously_paid', v_returned_after_paid
      ),
      'provider-payout-v2:' || v_payout.id::text
        || case when v_returned_after_paid then ':returned' else ':failed' end
    );
    perform set_config('app.provider_payouts_v2_mutation', 'on', true);
    update public.provider_payouts_v2 set
      failed_at = coalesce(failed_at, p_stripe_created_at),
      stripe_status = 'failed', failure_code = p_failure_code,
      failure_message = p_failure_message, updated_at = clock_timestamp()
    where id = v_payout.id returning * into v_payout;
    perform set_config('app.provider_payouts_v2_mutation', 'off', true);
    insert into public.provider_payout_attempts_v2 (
      payout_id, attempt_number, outcome, stripe_payout_id, error_code, error_message
    ) values (
      v_payout.id, greatest(v_payout.attempt_count, 1),
      case when v_returned_after_paid then 'returned' else 'definitive_failure' end,
      p_stripe_payout_id, coalesce(p_failure_code, 'payout_failed'),
      coalesce(p_failure_message,
        case when v_returned_after_paid then 'Stripe returned a previously paid bank payout.'
          else 'Stripe bank payout failed.' end)
    ) on conflict do nothing;
    v_outcome := case when v_returned_after_paid then 'returned' else 'failed' end;
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
    case when v_outcome = 'returned'
      then 'Signed Stripe webhook reported a previously paid payout as returned.'
      else 'Signed Stripe payout webhook reconciled the bank payout.' end,
    jsonb_build_object(
      'status', v_payout.stripe_status,
      'method', v_payout.payout_method,
      'bank_payout_amount_cents', v_payout.bank_payout_amount_cents,
      'currency', v_payout.currency,
      'stripe_fee_actual_amount_cents', v_payout.stripe_fee_actual_amount_cents,
      'paid_at', v_payout.paid_at,
      'failed_at', v_payout.failed_at
    ),
    jsonb_build_object(
      'stripe_event_id', p_event_id,
      'stripe_payout_id', p_stripe_payout_id,
      'stripe_application_fee_id', p_stripe_application_fee_id,
      'stripe_balance_transaction_id', p_stripe_balance_transaction_id,
      'previously_paid', v_returned_after_paid
    ),
    'provider-payout-v2-event:' || p_event_id || ':audit'
  );
  return query select v_payout.id, false, v_outcome;
end
$$;

-- Keep late returned payouts visible in the existing incident queue.
create or replace view public.admin_financial_incident_sources_v2 as
with latest_remediation as (
  select distinct on (attempt.operation_type, attempt.operation_id) attempt.*
  from public.financial_remediation_attempts_v2 attempt
  order by attempt.operation_type, attempt.operation_id, attempt.attempt_number desc
), latest_transfer as (
  select distinct on (attempt.transfer_id) attempt.*
  from public.provider_transfer_v2_attempts attempt
  order by attempt.transfer_id, attempt.attempt_number desc
)
select 'recovery_deficit:' || deficit.id::text as incident_key,
  'recovery_deficit'::text as incident_type, deficit.id::text as source_id,
  'critical'::text as severity, deficit.payment_id, null::uuid as control_id,
  payment.provider_id, deficit.currency,
  reversal.requested_amount_cents as glossed_amount_cents,
  reversal.recovered_amount_cents as stripe_amount_cents,
  deficit.amount_cents as divergence_amount_cents,
  reversal.stripe_reversal_id as stripe_object_id, deficit.reason as detail,
  deficit.created_at as occurred_at, deficit.status = 'admin_review' as is_open
from public.financial_recovery_deficits_v2 deficit
join public.transfer_reversals_v2 reversal on reversal.id = deficit.transfer_reversal_id
join public.checkout_v2_payments payment on payment.id = deficit.payment_id
union all
select 'remediation_manual_review:' || attempt.id::text,
  'remediation_manual_review', attempt.id::text, 'critical',
  coalesce(refund.payment_id, reversal.payment_id), null::uuid,
  payment.provider_id, coalesce(refund.currency, reversal.currency),
  coalesce(refund.amount_cents, reversal.requested_amount_cents), null::bigint,
  null::bigint, attempt.stripe_object_id,
  coalesce(attempt.error_message, attempt.error_code, attempt.operation_type),
  attempt.created_at, attempt.outcome = 'manual_review'
from latest_remediation attempt
left join public.refunds_v2 refund on refund.id = attempt.refund_id
left join public.transfer_reversals_v2 reversal on reversal.id = attempt.transfer_reversal_id
left join public.checkout_v2_payments payment
  on payment.id = coalesce(refund.payment_id, reversal.payment_id)
where attempt.outcome = 'manual_review'
union all
select 'transfer_manual_review:' || attempt.id::text,
  'transfer_manual_review', attempt.id::text, 'critical', transfer.payment_id,
  null::uuid, transfer.provider_id, transfer.currency, transfer.amount_cents,
  case when attempt.outcome = 'succeeded' then transfer.amount_cents else null end,
  null::bigint, coalesce(attempt.stripe_transfer_id, transfer.stripe_transfer_id),
  coalesce(attempt.error_message, attempt.error_code, 'Provider transfer requires review'),
  attempt.created_at, attempt.outcome = 'manual_review'
from latest_transfer attempt
join public.provider_transfers_v2 transfer on transfer.id = attempt.transfer_id
where attempt.outcome = 'manual_review'
union all
select 'payout_failure:' || payout.id::text, 'payout_failure', payout.id::text,
  'critical', null::uuid, null::uuid, payout.provider_id, payout.currency,
  payout.provider_balance_debit_amount_cents, null::bigint, null::bigint,
  payout.stripe_payout_id,
  case when payout.paid_at is not null
    then coalesce(payout.failure_message, payout.failure_code,
      'Stripe returned a previously paid provider payout')
    else coalesce(payout.failure_message, payout.failure_code,
      'Provider payout failed') end,
  coalesce(payout.failed_at, payout.updated_at),
  payout.failed_at is not null and payout.cancelled_at is null
from public.provider_payouts_v2 payout
where payout.failed_at is not null and payout.cancelled_at is null
union all
select 'runtime_control:' || control.id::text, 'runtime_control_blocked',
  control.id::text, 'critical', null::uuid, control.id, null::uuid,
  control.currency, null::bigint, null::bigint, null::bigint, null::text,
  control.reason, control.updated_at, control.state = 'blocked'
from public.financial_runtime_controls control
where control.state = 'blocked';

revoke all on public.admin_financial_incident_sources_v2
  from public, anon, authenticated;
grant select on public.admin_financial_incident_sources_v2 to service_role;
