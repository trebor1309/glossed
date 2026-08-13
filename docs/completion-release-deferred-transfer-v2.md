# Completion, 48-hour release and deferred transfer v2

This tranche is additive and disabled by default. `legacy_v1` remains the only
active production flow. The `completion_release_v2` feature flag is seeded as
`false`; this change does not create a scheduler, deploy an Edge Function or
alter Stripe configuration.

## Completion rules

The immutable financial terms snapshot remains authoritative:

- when `scheduled_end_at` exists, `completion_not_before_at` equals that end;
- otherwise it equals `scheduled_start_at`;
- no artificial end time is generated.

The provider action records `provider_completed_at` using server time and
creates `release_due_at` exactly 48 hours later. That original deadline is
retained separately in the execution, release record, workflow evidence and
financial audit.

After `completion_not_before_at`, the client can confirm or report a problem
without waiting for a provider declaration. Confirmation releases funds
immediately when the financial preflight succeeds. The confirmation remains
recorded if a temporary Connect failure or a financial hold prevents that
release, so the worker can safely resume it later. A problem/no-show creates a
financial hold and moves release to `blocked`. Passing the planned time alone
never creates a due release.

## Release preflight

Immediately before release, the server retrieves the current Accounts v2
object from Stripe, synchronizes it, and passes the exact resulting revision to
the atomic release transaction. The transaction locks and revalidates:

- the payment is still fully paid;
- the release trigger is valid;
- no active service-dispute, refund, payment-dispute, payment-issue,
  compliance or manual hold exists;
- the recorded eligibility policy and assessment are still valid;
- the assessment covers the service category frozen in the terms snapshot;
- the canonical Connect account is open, enabled, Accounts v2 and has active
  `stripe_balance.stripe_transfers` capability;
- the Connect revision has not changed since the Stripe preflight;
- no prior financial allocation or release exists.

The worker selects either a recorded client confirmation awaiting immediate
release or a provider declaration whose 48-hour deadline elapsed. It never
selects an unconfirmed service solely because its planned time passed. It is
protected by the Supabase service-role JWT and is idempotent. Its deployment
and schedule are deliberately outside this PR.

## Financial release and transfer

Release creates one final full allocation from the immutable cents snapshot and
posts a balanced ledger batch. Provider gross moves from held funds to a
transfer payable; any statutory withholding remains inside the provider gross
allocation, allocated client tax moves from pending tax to a tax-authority
payable, and the held platform fee moves to platform revenue.

The provider transfer is then created separately on the Glossed Stripe account:

- amount: the allocation's provider transfer amount in integer cents;
- destination: the current connected-account identity;
- `source_transaction`: the original Checkout charge;
- idempotency key: a stable database-owned operation identity.

The transfer state supports reserved, submitted, retryable failure, manual
review and success. Ambiguous retries reuse the same Stripe idempotency key.
Only one successful Stripe transfer and one balanced transfer ledger batch can
be recorded locally.

## Deliberately not included

- standard or Instant Payouts;
- full service-dispute adjudication and partial allocations;
- chargebacks and post-transfer reversals;
- jurisdiction-specific cancellation policy;
- complete administrative UI;
- production flag activation, scheduler configuration or Live deployment.
