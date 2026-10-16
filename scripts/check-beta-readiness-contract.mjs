import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
const migration = read("supabase/migrations/20261016010000_beta_readiness_hardening.sql");
const edge = read("supabase/functions/report-client-incident/index.ts");
const telemetry = read("src/lib/operationalTelemetry.js");
const boundary = read("src/components/AppErrorBoundary.jsx");
const maps = read("src/context/GoogleMapsContext.jsx");
const address = read("src/components/forms/AddressAutocomplete.jsx");
const adminApp = read("src/admin/AdminApp.jsx");
const adminPage = read("src/admin/AdminOperationalHealthPage.jsx");
const runbook = read("docs/beta-readiness-runbook.md");
const exampleEnv = read(".env.example");

const failures = [];
const requireText = (source, expected, message) => {
  if (!source.includes(expected)) failures.push(message);
};

for (const contract of [
  "create table public.client_operational_events",
  "accept_client_operational_event",
  "admin_list_operational_health",
  "admin_update_operational_event",
  "operations_health.read",
  "operations_health.manage",
  "sender_fingerprint",
  "client_operational_events_lifecycle_check",
]) {
  requireText(migration, contract, `Missing operational monitoring database contract: ${contract}`);
}

for (const path of [
  "confirmation.html",
  "recovery.html",
  "magic-link.html",
  "invite.html",
  "email-change.html",
  "reauthentication.html",
  "subjects.json",
]) {
  const fullPath = `supabase/email-templates/${path}`;
  if (!existsSync(fullPath)) failures.push(`Missing versioned Auth email template: ${path}`);
}

for (const path of [
  "confirmation.html",
  "recovery.html",
  "magic-link.html",
  "invite.html",
  "email-change.html",
]) {
  const content = read(`supabase/email-templates/${path}`);
  requireText(content, "Glossed", `${path} is not branded`);
  requireText(content, "{{ .ConfirmationURL }}", `${path} lacks the Supabase confirmation URL`);
}
requireText(
  read("supabase/email-templates/reauthentication.html"),
  "{{ .Token }}",
  "Reauthentication template lacks the Supabase OTP"
);

requireText(edge, "sanitizedContext", "Incident handler does not allow-list client context");
requireText(edge, "senderFingerprint", "Incident handler does not pseudonymize sender metadata");
requireText(edge, "operational_event_rate_limited", "Incident handler lacks rate-limit behavior");
requireText(
  telemetry,
  "sessionStorage",
  "Client incident reporting is not deduplicated per session"
);
requireText(
  telemetry,
  "window.location.pathname",
  "Client telemetry does not strip URL parameters"
);
requireText(boundary, "componentDidCatch", "The application lacks a React error boundary");
requireText(maps, 'eventType: "maps_auth_failure"', "Google Maps auth failures are not reported");
requireText(maps, 'eventType: "maps_load_failure"', "Google Maps load failures are not reported");
requireText(address, 'eventType: "maps_widget_failure"', "Places widget failures are not reported");
requireText(adminApp, 'path="sante-technique"', "Operational health is not routed in admin");
requireText(
  adminPage,
  "listAdminOperationalHealth",
  "Operational health admin page is not server-backed"
);
requireText(exampleEnv, "CLIENT_INCIDENT_HASH_SECRET", "Incident HMAC secret is undocumented");

for (const contract of [
  "Disable click/open tracking",
  "support@glossed.app",
  "reply-as",
  "Google Maps Platform",
  "database RPO: 24 hours or better",
  "Database backups do **not** restore deleted",
  "Closed-beta evidence register",
]) {
  requireText(runbook, contract, `Missing beta-readiness runbook contract: ${contract}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Beta-readiness hardening contract checks passed.");
