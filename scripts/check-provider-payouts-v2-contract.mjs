import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260814150000_provider_balances_payouts_v2.sql",
  "utf8"
);
const paidBalanceMigration = readFileSync(
  "supabase/migrations/20260903020000_provider_paid_payout_balance.sql",
  "utf8"
);
const shared = readFileSync("supabase/functions/_shared/provider-payouts-v2.ts", "utf8");
const webhook = readFileSync("supabase/functions/stripe-connect-webhook/index.ts", "utf8");
const payoutWorker = readFileSync(
  "supabase/functions/process-provider-payouts-v2/index.ts",
  "utf8"
);
const session = readFileSync(
  "supabase/functions/create-stripe-account-session/index.ts",
  "utf8"
);
const accountCreation = readFileSync(
  "supabase/functions/create-stripe-account/index.ts",
  "utf8"
);
const gains = readFileSync(
  "src/pages/prodashboard/components/ProviderGainsV2.jsx",
  "utf8"
);
const config = readFileSync("supabase/config.toml", "utf8");

const requirements = [
  [migration, /'provider_payouts_v2', false/, "feature flag must be disabled by default"],
  [migration, /array\[1,4\]::smallint\[\]/, "initial schedule must be Monday and Thursday"],
  [migration, /minimum_payout_amount_cents[^;]+default 0/s, "initial threshold must be zero"],
  [migration, /provider_payouts_v2_active_uidx/, "one active payout lock is required"],
  [migration, /provider_payout_block_reasons_v2/, "financial blocks must be revalidated"],
  [migration, /stripe_instant_available_net_amount_cents/, "exact Stripe net balance must be stored"],
  [migration, /instant_payout_margin_bps[^;]+check \(instant_payout_margin_bps = 0\)/s, "Glossed Instant Payout margin must be zero"],
  [migration, /process_provider_payout_v2_event/, "signed payout event RPC is required"],
  [migration, /Recheck the event claim inside that serialization boundary/, "webhook race recheck is required"],
  [shared, /expand: \["instant_available\.net_available"\]/, "Stripe exact net balance expansion is required"],
  [shared, /schedule: \{ interval: "manual" \}/, "Glossed-controlled schedule requires Stripe manual mode"],
  [shared, /idempotencyKey: reservation\.idempotency_key/, "Stripe payout idempotency key must be stable"],
  [shared, /isRetryableStripeBalanceOperationFailure/, "transient balance failures must remain retryable"],
  [webhook, /payout\.created.*payout\.updated.*payout\.paid.*payout\.failed/s, "all payout lifecycle events must be handled"],
  [payoutWorker, /requireServiceRole.*_shared\/service_role\.ts/, "payout worker must use the verified service-role claim guard"],
  [session, /instant_payouts: false/, "embedded components must not bypass server Instant Payout checks"],
  [session, /standard_payouts: false/, "embedded components must not create manual standard payouts"],
  [
    accountCreation,
    /idempotencyKey: reservation\.creation_idempotency_key/,
    "Accounts v2 creation must use the reservation's stable idempotency key",
  ],
  [
    accountCreation,
    /from\("provider_eligibility_declarations"\)[\s\S]+order\("revision", \{ ascending: false \}\)/,
    "Accounts v2 creation must use the latest provider eligibility declaration",
  ],
  [
    accountCreation,
    /identity: \{\s*country: eligibilityDeclaration\.residence_country_code/,
    "Accounts v2 creation must provide Stripe with the declared residence country",
  ],
  [gains, /ConnectBalances/, "Stripe balance component is required"],
  [gains, /ConnectPayoutsList/, "Stripe payout history component is required"],
  [gains, /ConnectAccountManagement/, "Stripe bank account component is required"],
  [gains, /Coût Stripe exact/, "exact Instant Payout cost must be disclosed"],
];

for (const [source, pattern, message] of requirements) {
  if (!pattern.test(source)) throw new Error(`Provider payouts v2 contract: ${message}`);
}

if (/payment_method_types|transfer_data\.destination/.test(shared)) {
  throw new Error("Provider payouts v2 must not alter Checkout or destination-charge behavior");
}
if (!/\[functions\.process-provider-payouts-v2\][\s\S]*?verify_jwt\s*=\s*true/.test(config)) {
  throw new Error("Payout worker must keep Supabase gateway JWT verification enabled");
}
if (
  !/committed_payouts[\s\S]+payout\.failed_at is null and payout\.cancelled_at is null/.test(
    paidBalanceMigration
  ) || /payout\.paid_at is null/.test(paidBalanceMigration)
) {
  throw new Error("Paid payouts must remain deducted from the provider internal balance");
}

process.stdout.write("Provider balances and payouts v2 contract checks passed.\n");
