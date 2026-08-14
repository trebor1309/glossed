import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260814210000_admin_disputes_cancellations.sql");
const endpoint = read("supabase/functions/financial-remediation-v2/index.ts");
const app = read("src/admin/AdminApp.jsx");
const page = read("src/admin/AdminDisputeDetailPage.jsx");
const api = read("src/admin/adminOperationsApi.js");

const requirements = [
  [migration.includes("admin_list_dispute_cases") && migration.includes("admin_get_dispute_case") && migration.includes("admin_get_cancellation_case"), "protected queues and case records"],
  [migration.includes("service-dispute-evidence") && migration.includes("chat_attachments_select_dispute_admin"), "private evidence storage policies"],
  [migration.includes("admin_dispute_allocation_previews_v2") && migration.includes("admin_dispute_preview_allocation_balanced"), "immutable balanced every-cent preview"],
  [migration.includes("platform_fee_rate_bps") && migration.includes("round(v_provider_gross::numeric"), "proportional platform commission"],
  [migration.includes("admin_account_has_permission(p_admin_id, 'disputes.allocate')") && migration.includes("admin_account_has_permission(p_admin_id, 'finance.execute')"), "dual financial authorization"],
  [migration.includes("Case changed after preview") && migration.includes("workflow_revision"), "stale preview concurrency guard"],
  [migration.includes("record_admin_dispute_execution_audit_v2") && migration.includes("dispute.allocation.commit"), "decision and execution audit"],
  [endpoint.includes('action === "admin_decide_service_dispute"') && endpoint.includes("body.confirmed !== true"), "explicit server decision confirmation"],
  [endpoint.includes('["totp", "webauthn", "phone"]') && !endpoint.includes("claims.iat"), "AMR-based recent MFA"],
  [endpoint.includes("execute_admin_service_dispute_decision_v2") && endpoint.includes("executeOperations(result)"), "existing v2 workflow execution"],
  [endpoint.includes("Direct dispute allocations are disabled"), "legacy direct allocation endpoint disabled"],
  [app.includes('path="litiges/:caseType/:caseId"') && page.includes("Prévisualiser chaque centime"), "operational admin dispute UI"],
  [page.includes("confirmed") && page.includes("Justification obligatoire") && page.includes("Réauthentification MFA récente requise"), "confirmation, justification and MFA UX"],
  [api.includes('functions.invoke("financial-remediation-v2"') && !page.includes("stripe."), "no browser Stripe operation"],
  [!migration.includes("financial_feature_flags") && !migration.includes("set enabled = true"), "no financial feature flag activation"],
];

const failures = requirements.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) throw new Error(`Admin disputes contract failed:\n- ${failures.join("\n- ")}`);
console.log("Admin disputes and cancellations contract passed.");
