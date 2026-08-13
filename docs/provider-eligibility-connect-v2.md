# Provider eligibility and Connect Accounts v2 foundation

This tranche is additive. It does not activate a new financial flow: Checkout,
payments, refunds, transfers and payouts continue to use `legacy_v1`.

## Provider eligibility

- `provider_eligibility_policy_versions` stores immutable, jurisdiction-scoped
  policy definitions. The migration seeds no country-specific legal or tax rule.
- `provider_eligibility_declarations` stores append-only provider declarations.
  A declared status is never proof of eligibility by itself.
- `provider_eligibility_assessments` stores immutable decisions against an exact
  policy version, country and service category.
- `users.verification_status` remains useful evidence and UI state, but is not a
  financial prerequisite. Readiness uses the explicit eligibility assessment.
- `paid_proposal_drafts` preserves the proposal price, travel amount, schedule
  and description while eligibility or Connect prerequisites are incomplete.
  This tranche does not publish the draft into the active legacy proposal flow.

No launch policy is created here. A legally reviewed policy version must be
inserted separately before the future paid-proposal workflow is activated.

## Stripe Connect Accounts v2

`provider_connect_accounts` is the canonical server-side state. The legacy
columns on `users` are compatibility projections only. Existing account IDs are
backfilled as `accounts_v1_legacy` with unknown readiness until Stripe is queried;
deprecated v1 booleans are never trusted during the backfill.

New accounts use Accounts v2 with the frozen platform configuration:

- Express Dashboard access;
- `fees_collector: application`;
- `losses_collector: application`;
- recipient configuration;
- requested `stripe_balance.stripe_transfers` capability;
- EUR launch currency.

Creation is reserved atomically in Postgres. Concurrent calls receive the same
database-owned Stripe idempotency key. Capability readiness comes only from the
current Accounts v2 object retrieved server-side. Publication readiness depends
on the recipient capability `stripe_balance.stripe_transfers`; it does not
incorrectly require the merchant-only `stripe_balance.payouts` capability.

The dedicated `stripe-connect-webhook` accepts signed Accounts v2 thin events,
fetches their current related account from Stripe, and applies the result through
one idempotent RPC. Event rows are unique and immutable. This endpoint requires
its own `STRIPE_CONNECT_WEBHOOK_SECRET` and must be configured as a separate
Stripe event destination before deployment.

`create-stripe-account-session` prepares embedded onboarding, account management
and notification banner components. The complete provider-facing UX is outside
this tranche.

## Deliberately not implemented

- jurisdiction-specific eligibility decisions or tax rules;
- automatic assessment or a complete admin review workflow;
- publication from the preserved draft;
- Checkout v2 or separate charges and transfers;
- delayed releases, transfer reversals, payouts or Instant Payouts;
- deployment, Stripe event-destination creation or secret configuration.
