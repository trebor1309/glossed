# Financial remediation v2

This tranche adds server-side cancellation, service-dispute, refund,
chargeback and transfer-reversal workflows for `marketplace_v2`. It is
additive and disabled by default through `financial_remediation_v2 = false`.
`legacy_v1` remains the only active production flow.

## Cancellation and service disputes

- A client commercial cancellation starts as an explicit full-refund request.
- The provider may accept or counter with an explicit partial allocation; the
  client must accept that exact allocation before it can execute.
- Provider cancellation records a full-refund allocation automatically.
- Legal withdrawal is represented separately, but this tranche installs no
  national policy or automatic percentage.
- A service dispute creates an immediate financial hold. Evidence and the
  immutable administrator decision remain separate records.
- Manual financial decisions require an allowlisted administrator and a recent
  `aal2` JWT. The maximum age is stored in a versioned, server-only policy.

Every allocation uses integer cents and recomputes the platform fee from the
frozen basis-point rate. Provider withholding stays inside provider awarded
gross; it is never deducted from the customer refund a second time.

## Refund and recovery order

If an earlier provider transfer exists, the engine first reserves an explicit
Stripe transfer reversal. The customer refund is then submitted even when the
recovery is partial or unavailable. Any deficit is stored separately with
administrative-review status and an invariant that future-earnings offsets are
disabled.

Refunds, reversals and provider retransfers use stable database-owned Stripe
idempotency keys. Signed refund webhooks are the authoritative local completion
signal. Ledger batches record the final allocation, recovery and refund as
separate balanced operations.

## Banking disputes

Stripe chargebacks use an independent payment-dispute workflow. A signed
webhook records the platform debit, the Stripe dispute fee borne by Glossed and
useful risk details. If a provider transfer already succeeded, the engine
requests provisional recovery capped to the proportional provider share of the
contested payment. This does not assign final provider liability.

On a Stripe victory, recovered provisional funds are retransferred to the
provider after current Connect capability checks. On a loss, no liability or
future-gain compensation is inferred: the case enters administrative review.

## Deliberately not included

- standard or Instant Payouts;
- a complete administrative web application;
- jurisdiction-specific withdrawal or cancellation rules;
- automatic future-earnings compensation or external provider bank debits;
- production activation, deployment or Stripe Dashboard changes.
