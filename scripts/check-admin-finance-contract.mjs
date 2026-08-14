import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260814230000_admin_finance_payment_disputes.sql");
const edge = read("supabase/functions/financial-remediation-v2/index.ts");
const api = read("src/admin/adminOperationsApi.js");
const app = read("src/admin/AdminApp.jsx");

const checks = [
  [migration.includes("admin_financial_search") && migration.includes("stripe_payout_id"), "all-identifier financial search"],
  [migration.includes("admin_get_financial_payment_detail") && migration.includes("debit_total_cents") && migration.includes("credit_total_cents"), "every-cent allocation and balanced ledger detail"],
  [migration.includes("admin_list_payment_disputes") && migration.includes("admin_get_payment_dispute_detail"), "separate payment dispute queue and detail"],
  [migration.includes("risk_details") && migration.includes("radar_alerts"), "recorded Radar and risk signals"],
  [migration.includes("admin_financial_operation_previews_v2") && migration.includes("Financial operation changed after preview"), "immutable stale-safe financial preview"],
  [migration.includes("assert_admin_permission('finance.execute', true)") && migration.includes("assert_admin_permission('risk.manage', true)") && migration.includes("assert_recent_financial_admin_mfa_v2"), "recent MFA at preview and execution with dedicated permissions"],
  [migration.includes("stable_idempotency_key") && migration.includes("execution_operation_id"), "stable idempotency and concurrent confirmation identity"],
  [edge.includes('action === "admin_execute_financial_operation"') && edge.includes("dispatchRefundV2") && edge.includes("dispatchTransferReversalV2") && edge.includes("dispatchProviderRetransferV2"), "existing server-only v2 dispatchers"],
  [api.includes("financial-remediation-v2") && app.includes("AdminPaymentDisputesPage"), "admin UI is wired to server workflows"],
  [!migration.includes("set enabled = true") && !migration.includes("transfer_data.destination"), "no v2 production activation or legacy mutation"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Admin finance contract failed: ${label}`);
}

console.log("Admin finance & payment disputes contract passed.");
