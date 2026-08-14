# Provider balances and payouts v2

This tranche is additive. `provider_payouts_v2` is inserted as `false`, so
`legacy_v1` remains the only active production payout path.

## Financial model

- The provider balance is derived from successful v2 Transfers, completed
  reversals, won-dispute retransfers and active/paid payout reservations.
- A Stripe balance snapshot is stored separately and the amount presented as
  available is capped by both the internal entitlement and Stripe's available
  EUR balance.
- One partial unique index allows only one active payout operation per provider
  and currency. The provider Connect row serializes standard and instant
  reservations.
- Open service disputes, payment disputes, pending recoveries, recovery
  deficits, Connect restrictions and explicit payout blocks stop dispatch.
- Standard payouts debit the provider balance by exactly the bank payout
  amount. Any Stripe fee is recorded as absorbed by Glossed.
- Instant Payouts use `instant_available.net_available`. The provider accepts
  the gross debit, exact Stripe fee and bank net amount before dispatch. The
  policy enforces a zero Glossed margin.

## Schedule

The initial immutable policy is EUR, Monday and Thursday at 09:00 in
`Europe/Brussels`, with a 0 EUR minimum. The worker configures Stripe payout
scheduling to `manual`, expires stale instant quotes, reserves due standard
payouts, and retries ambiguous submissions with the same idempotency key.

The worker is `process-provider-payouts-v2`. It requires the Supabase service
role and is inert while the feature flag is disabled. Its recurring invocation
must be configured only during a controlled rollout.

## Stripe event destination

The existing signed Connect endpoint also accepts these v1 snapshot events for
connected accounts:

- `payout.created`
- `payout.updated`
- `payout.paid`
- `payout.failed`

Accounts v2 does not emit v2 equivalents for payouts. The endpoint preserves
the raw request body and verifies `Stripe-Signature` before any payout state is
applied. Duplicate deliveries are claimed again after the payout row lock to
close the concurrent webhook race.

## Controlled activation prerequisites

Before enabling `provider_payouts_v2` in any environment:

1. Configure Stripe Instant Payout platform pricing to recover exactly Stripe's
   current cost, with no Glossed margin.
2. Verify the versioned policy rate against the current Stripe contract and
   update it through a new policy version if necessary.
3. Add the four payout events above to the Connect event destination using the
   same endpoint signing secret.
4. Configure `VITE_STRIPE_PUBLISHABLE_KEY` for Connect embedded components.
5. Schedule the worker frequently enough to cover the configured local payout
   time and monitor failures.
6. Run a Test-mode standard payout, Instant Payout and failed-payout webhook
   scenario before any Live activation.

No Stripe pricing, webhook subscription, secret, scheduler or feature flag is
changed by this PR.
