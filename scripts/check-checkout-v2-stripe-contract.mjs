import { readFileSync } from "node:fs";

const checkout = readFileSync(
  new URL("../supabase/functions/create-checkout-session-v2/index.ts", import.meta.url),
  "utf8"
);
const webhook = readFileSync(
  new URL("../supabase/functions/stripe-payment-webhook/index.ts", import.meta.url),
  "utf8"
);

for (const forbidden of [
  "payment_method_types:",
  "transfer_data:",
  "application_fee_amount:",
  "stripeAccount:",
]) {
  if (checkout.includes(forbidden)) {
    throw new Error(`Checkout v2 must not contain ${forbidden}`);
  }
}
for (const required of [
  "payment_method_configuration:",
  'financial_flow_version: "marketplace_v2"',
  "transfer_group:",
  "reserve_checkout_v2_attempt",
  "attach_checkout_v2_session",
]) {
  if (!checkout.includes(required)) {
    throw new Error(`Checkout v2 is missing required contract marker ${required}`);
  }
}
for (const required of [
  'req.headers.get("stripe-signature")',
  "constructEventAsync",
  "await req.text()",
  "process_checkout_v2_event",
]) {
  if (!webhook.includes(required)) {
    throw new Error(`Stripe webhook is missing required security marker ${required}`);
  }
}

console.log("Checkout v2 Stripe contract checks passed.");
