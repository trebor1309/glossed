import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260817010000_mission_lifecycle_ux_v2.sql", import.meta.url),
  "utf8"
);
const panel = readFileSync(
  new URL("../src/components/mission-lifecycle/MissionLifecycleV2Panel.jsx", import.meta.url),
  "utf8"
);
const clientPage = readFileSync(
  new URL("../src/pages/dashboard/pages/DashboardReservations.jsx", import.meta.url),
  "utf8"
);
const providerPage = readFileSync(
  new URL("../src/pages/prodashboard/pages/ProDashboardMissions.jsx", import.meta.url),
  "utf8"
);
const lifecycleClient = readFileSync(
  new URL("../src/lib/missionLifecycleV2.js", import.meta.url),
  "utf8"
);
const worker = readFileSync(
  new URL("../supabase/functions/process-release-deadlines-v2/index.ts", import.meta.url),
  "utf8"
);

for (const required of [
  "alter column duration drop default",
  "get_my_mission_lifecycle_v2",
  "completion_not_before_at",
  "projected_execution_state",
  "reviews_insert_concluded_mission_participant",
  "service_provider_completed",
  "service_confirmation_requested",
  "service_release_reminder",
  "service_funds_released",
  "service_problem_reported",
  "service_problem_resolved",
]) {
  if (!migration.includes(required)) {
    throw new Error(`Mission lifecycle migration is missing ${required}`);
  }
}

for (const required of [
  "can_provider_complete",
  "can_client_confirm",
  "can_client_report_problem",
  'execute("provider_complete")',
  'execute("client_confirm")',
  'execute("report_problem"',
  "review_available",
  "scheduled_end_at &&",
]) {
  if (!panel.includes(required)) throw new Error(`Mission lifecycle panel is missing ${required}`);
}

for (const required of [
  'supabase.rpc("get_my_mission_lifecycle_v2")',
  'supabase.functions.invoke("service-execution-v2"',
]) {
  if (!lifecycleClient.includes(required)) {
    throw new Error(`Mission lifecycle browser client is missing ${required}`);
  }
}

for (const forbidden of [
  '.from("service_executions_v2")',
  '.from("fund_releases_v2")',
  '.from("provider_transfers_v2")',
  "transfer_data",
  "stripe_secret",
]) {
  if (
    lifecycleClient.toLowerCase().includes(forbidden) ||
    panel.toLowerCase().includes(forbidden) ||
    clientPage.toLowerCase().includes(forbidden) ||
    providerPage.toLowerCase().includes(forbidden)
  ) {
    throw new Error(`Mission lifecycle browser code must not contain ${forbidden}`);
  }
}

if (!worker.includes("enqueue_due_service_release_reminders_v2")) {
  throw new Error("Release worker does not enqueue the idempotent protection reminder");
}

console.log("Mission lifecycle UX v2 contract checks passed.");
