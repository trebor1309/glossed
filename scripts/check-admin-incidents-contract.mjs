import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260815010000_admin_incidents_audit_configuration.sql");
const edge = read("supabase/functions/financial-remediation-v2/index.ts");
const api = read("src/admin/adminOperationsApi.js");
const app = read("src/admin/AdminApp.jsx");

const checks = [
  [migration.includes("admin_financial_incident_sources_v2") && migration.includes("recovery_deficit") && migration.includes("payout_failure"), "existing critical incident families"],
  [migration.includes("admin_get_financial_incident_detail") && migration.includes("divergence_amount_cents") && migration.includes("ledger_batches"), "incident reconciliation detail"],
  [migration.includes("admin_financial_control_reactivation_previews_v2") && migration.includes("Financial control changed after preview"), "stale-safe reactivation preview"],
  [migration.includes("assert_admin_permission('incidents.reactivate', true)") && migration.includes("assert_recent_financial_admin_mfa_v2"), "financial permission and recent MFA"],
  [edge.includes('action === "admin_reactivate_financial_control"') && edge.includes("incidents.reactivate"), "server-only reactivation"],
  [migration.includes("admin_search_audit") && migration.includes("admin_auth_events"), "global immutable audit search"],
  [migration.includes("admin_create_configuration_version") && migration.includes("checkout_v2_policy_versions") && migration.includes("provider_payout_policy_versions"), "versioned operational configuration"],
  [migration.includes("jurisdiction_policy_versions_v2") && migration.includes("can only be created as drafts"), "jurisdiction structure without invented rules"],
  [api.includes("executeAdminControlReactivation") && app.includes("AdminConfigurationPage"), "admin UI uses server workflows"],
  [!migration.includes("set enabled = true") && !migration.includes("update public.financial_feature_flags"), "no Production v2 activation"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Admin incidents contract failed: ${label}`);
}

console.log("Admin incidents, audit & configuration contract passed.");
