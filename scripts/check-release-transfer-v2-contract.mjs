import { readFileSync } from "node:fs";

const shared = readFileSync(
  new URL("../supabase/functions/_shared/release-transfer-v2.ts", import.meta.url),
  "utf8"
);
const actions = readFileSync(
  new URL("../supabase/functions/service-execution-v2/index.ts", import.meta.url),
  "utf8"
);
const worker = readFileSync(
  new URL("../supabase/functions/process-release-deadlines-v2/index.ts", import.meta.url),
  "utf8"
);
const serviceRole = readFileSync(
  new URL("../supabase/functions/_shared/service_role.ts", import.meta.url),
  "utf8"
);
const config = readFileSync(
  new URL("../supabase/config.toml", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260813200000_completion_release_deferred_transfer.sql",
    import.meta.url
  ),
  "utf8"
);

for (const required of [
  "stripe.transfers.create",
  "source_transaction:",
  "idempotencyKey: reservation.idempotency_key",
  "refreshConnectForRelease",
  "complete_provider_transfer_v2",
  "fail_provider_transfer_v2",
  "isRetryableStripeBalanceOperationFailure",
]) {
  if (!shared.includes(required)) throw new Error(`Deferred transfer is missing ${required}`);
}
for (const forbidden of [
  "stripe.payouts",
  "payment_method_types:",
  "transfer_data:",
  "transfer_group:",
]) {
  if (shared.includes(forbidden) || actions.includes(forbidden) || worker.includes(forbidden)) {
    throw new Error(`Tranche 4 must not contain ${forbidden}`);
  }
}
for (const required of [
  "requireUser(req)",
  'action === "provider_complete"',
  'action === "client_confirm"',
  'action === "report_problem"',
  "reserve_client_confirmed_fund_release_v2",
  'release: { status: "blocked_or_pending", retry_scheduled: true }',
]) {
  if (!actions.includes(required)) throw new Error(`Completion endpoint is missing ${required}`);
}
for (const required of [
  'requireServiceRole } from "../_shared/service_role.ts"',
  "list_due_fund_releases_v2",
  'candidate.release_trigger === "client_confirmation"',
  "reserve_client_confirmed_fund_release_v2",
  "list_provider_transfers_v2_for_dispatch",
]) {
  if (!worker.includes(required)) throw new Error(`Release worker is missing ${required}`);
}
for (const required of ["role === \"service_role\""]) {
  if (!serviceRole.includes(required)) {
    throw new Error(`Service role guard is missing ${required}`);
  }
}
if (!/\[functions\.process-release-deadlines-v2\][\s\S]*?verify_jwt\s*=\s*true/.test(config)) {
  throw new Error("Release worker must keep Supabase gateway JWT verification enabled");
}
for (const required of [
  "'completion_release_v2', false",
  "release_due_at = v_completed_at + make_interval",
  "original_release_due_at",
  "provider_timeout_48h",
  "client_confirmation",
  "eligibility_service_category_code",
  "assessment.revision desc",
  "client_tax_payable",
  "reserve_client_confirmed_fund_release_v2",
  "stripe_transfers_status <> 'active'",
]) {
  if (!migration.includes(required)) throw new Error(`Release migration is missing ${required}`);
}

console.log("Completion, release and deferred transfer v2 contract checks passed.");
