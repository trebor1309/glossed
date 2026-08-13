# Financial state machines v1

This document records the frozen scope implemented by
`20260813100000_financial_state_models_v1.sql`. The migration is an additive,
server-only foundation. It does not activate a v2 financial flow, attach a
workflow to an existing row, or change any legacy Stripe function.

## Independent machines

The versioned catalog defines these machines separately instead of overloading
`missions.status`:

1. request lifecycle;
2. mission lifecycle;
3. proposal lifecycle;
4. conditional selection;
5. Checkout attempt;
6. payment lifecycle;
7. service execution;
8. fund release;
9. cancellation;
10. service dispute;
11. refund;
12. provider transfer;
13. transfer reversal;
14. payment dispute;
15. payout.

Each transition definition records its source and destination states, allowed
actor types, prerequisite codes, financial-effect code, audit-event type and
description. Definitions and emitted transition events are immutable.

Runtime workflow instances are only accessible through service-role functions.
Transitions use an expected revision to reject concurrent stale writes and a
globally unique operation key to make retries idempotent. Actor identity is
recorded for client, provider and administrator actions; system actions cannot
impersonate a user.

## Frozen final corrections

- A client can move service execution from `completion_eligible` directly to
  `problem_reported`, including a provider no-show, without a prior provider
  completion declaration.
- A launch commercial cancellation begins with the client's full-refund
  request. The provider may accept it or propose an explicit partial
  allocation. A partial counter-proposal requires explicit client acceptance;
  rejection or absence of agreement routes the case to service dispute or
  administrative review. No automatic cancellation percentage is defined.
- Provider statutory or tax withholding is contained within the provider gross
  amount awarded. The invariant is:

  `provider transfer + provider withholding = provider gross awarded`

  It is therefore never subtracted a second time from the customer refund.

## Immutable money snapshots

Contractual terms preserve, in integer minor units:

- service and travel amounts;
- initial provider gross;
- platform fee rate in basis points and initial fee;
- customer tax and customer total;
- provider statutory withholding and provider transfer;
- explicit currency, rounding rule, jurisdiction and policy/contract versions;
- scheduled start, optional scheduled end and the generated completion
  eligibility threshold.

Allocation revisions preserve, separately:

- final provider gross award;
- recalculated final platform fee;
- customer refund and customer-tax allocation;
- provider withholding and transfer;
- actual Stripe payment, dispute and payout fees;
- provisional provider recovery, definitive provider liability, recovery
  deficit and final platform loss.

Every customer cent must be allocated exactly once:

`customer total = provider gross awarded + final platform fee + customer refund + allocated customer tax`

The platform fee is recomputed from the frozen basis-point rate using
PostgreSQL's half-up rounding for non-negative amounts. Snapshots are
append-only and later allocation revisions must reference their direct
predecessor.

## Activation boundary

`legacy_v1` remains the only financial flow installed by default. The new
catalog and snapshot tables have no browser grants, no legacy-table triggers
and no automatic writers. A later implementation tranche must explicitly add
a new financial-flow version and server workflows before any Live behavior can
use this foundation.
