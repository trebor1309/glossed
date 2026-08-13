# Checkout v2 and payment accounting

This tranche is additive. `legacy_v1` remains the only active financial path.
The new `marketplace_v2` Checkout path cannot run unless both of these actions
are performed explicitly in a later controlled rollout:

1. insert a reviewed `checkout_v2_policy_versions` row;
2. enable the audited `checkout_v2` feature flag.

This migration intentionally seeds neither an active policy nor an enabled
flag. It does not deploy an Edge Function or change any Stripe configuration.

## Checkout contract

- Checkout is created as a platform charge on the Glossed Stripe account.
- No destination transfer, application fee or provider transfer is created at
  payment time.
- Amounts and currency come only from the immutable financial terms snapshot
  and are stored as integer cents.
- The Stripe Payment Method Configuration reference comes from the immutable
  Checkout policy. `payment_method_types` is deliberately omitted so Stripe's
  dynamic methods configuration controls cards, wallets and Bancontact.
- The Checkout expiry is bounded by the configured payment deadline and the
  configured margin before `scheduled_start_at`. Stripe's 30-minute minimum and
  24-hour maximum are enforced by the policy and reservation checks.
- A stable, database-owned idempotency key is reused by concurrent retries for
  the same conditional selection.

## Concurrency and liquidity

`reserve_checkout_v2_attempt` serializes the active attempt for a selection and
locks the EUR runtime-control row before measuring exposure. One active
liquidity reservation is therefore created for one payable session, including
when requests race. Existing sessions retain their reservation until payment,
expiry or definitive failure; the critical runtime control only blocks new
reservations.

The conditional selection freezes the selected proposal and holds the request.
Only a signed Stripe webhook may fulfill it. An unpaid expiry or definitive
failure releases the selection and liquidity reservation and moves prior
proposals to provider reconfirmation; they are never reactivated automatically.

## Signed webhook and accounting

The shared payment webhook verifies the Stripe signature against the raw body,
then dispatches only sessions carrying the `marketplace_v2` metadata marker to
the v2 RPC. It fetches the current Checkout Session from Stripe before passing
the authoritative amount, currency, PaymentIntent and charge references.

A confirmed payment atomically:

- records one immutable local payment and one request award;
- consumes the liquidity reservation;
- accepts the chosen proposal, closes the request and marks other active
  proposals `not_selected` while preserving their history;
- posts one balanced ledger batch: Stripe platform asset against provider gross
  held, platform fee held and any client tax held;
- appends the financial audit entry and unique webhook event.

This tranche deliberately creates no provider transfer. Completion, the 48-hour
release delay, disputes, refunds, payouts and transfer reversals remain outside
its scope.

## Required Stripe event destination before activation

The existing signed payment endpoint must subscribe to:

- `checkout.session.completed`;
- `checkout.session.async_payment_succeeded`;
- `checkout.session.async_payment_failed`;
- `checkout.session.expired`.

The browser success or cancel URL is informational only and never mutates
financial state.
