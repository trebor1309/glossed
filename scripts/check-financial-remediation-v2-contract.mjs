import { readFileSync } from "node:fs";

const shared = readFileSync(
  new URL("../supabase/functions/_shared/financial-remediation-v2.ts", import.meta.url),
  "utf8"
);
const endpoint = readFileSync(
  new URL("../supabase/functions/financial-remediation-v2/index.ts", import.meta.url),
  "utf8"
);
const webhook = readFileSync(
  new URL("../supabase/functions/stripe-payment-webhook/index.ts", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260814100000_financial_remediation_v2.sql",
    import.meta.url
  ),
  "utf8"
);

for (const required of [
  "stripe.transfers.createReversal",
  "stripe.refunds.create",
  "idempotencyKey: reservation.idempotency_key",
  "dispatchProviderRetransferV2",
  'financial_flow_version: "marketplace_v2"',
]) {
  if (!shared.includes(required)) throw new Error(`Remediation Stripe helper is missing ${required}`);
}
for (const forbidden of ["reverse_transfer:", "refund_application_fee:", "stripe.payouts"] ) {
  if (shared.includes(forbidden) || endpoint.includes(forbidden)) {
    throw new Error(`Tranche 5 must not contain ${forbidden}`);
  }
}
for (const required of [
  "requireUser(req)",
  'claims.aal !== "aal2"',
  'action === "decide_service_dispute"',
  "dispatchTransferReversalV2",
  "dispatchRefundV2",
]) {
  if (!endpoint.includes(required)) throw new Error(`Remediation endpoint is missing ${required}`);
}
for (const required of [
  'req.headers.get("stripe-signature")',
  "constructEventAsync",
  "await req.text()",
  'event.type.startsWith("charge.dispute.")',
  "process_payment_dispute_v2_event",
  "process_refund_v2_event",
]) {
  if (!webhook.includes(required)) throw new Error(`Signed Stripe webhook is missing ${required}`);
}
for (const required of [
  "'financial_remediation_v2', false",
  "future_earnings_offset_enabled boolean not null default false",
  "provisional_recovery_target_amount_cents",
  "provider_recovery_target_amount_cents",
  "stripe_dispute_fee_amount_cents",
  "assert_recent_financial_admin_mfa_v2",
  "client_refund_payable",
]) {
  if (!migration.includes(required)) throw new Error(`Remediation migration is missing ${required}`);
}

console.log("Financial remediation v2 contract checks passed.");
