import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20261013020000_admin_user_account_controls.sql");
const edge = read("supabase/functions/admin-user-account-control/index.ts");
const shared = read("supabase/functions/_shared/supabase.ts");
const account = read("src/admin/AdminUserAccountControl.jsx");
const eligibility = read("src/admin/AdminProviderEligibilityControl.jsx");
const configuration = read("src/admin/AdminConfigurationPage.jsx");
const api = read("src/admin/adminOperationsApi.js");

const requirements = [
  [migration.includes("'users.manage'") && /true\s*\)/.test(migration), "recent-MFA user management permission"],
  [migration.includes("admin_user_account_change_operations") && migration.includes("operation_status in ('requested', 'applied', 'failed')"), "two-phase account change operations"],
  [migration.includes("user_account_control_events_immutable") && migration.includes("admin_audit_log"), "immutable status history and admin audit"],
  [migration.includes("pgrst.db_pre_request") && migration.includes("as restrictive"), "Data API and private Storage suspension enforcement"],
  [edge.includes("updateUserById") && edge.includes("876000h") && edge.includes('"none"'), "Supabase Auth ban and unban synchronization"],
  [edge.includes("auth_rollback_succeeded") && edge.includes("fail_admin_user_account_change"), "cross-system failure compensation"],
  [shared.includes("is_user_account_active") && shared.includes("Account suspended"), "shared Edge Function suspension guard"],
  [migration.includes("admin_record_provider_eligibility_assessment") && migration.includes("v_declaration") && migration.includes("order by revision desc"), "versioned eligibility assessment against latest declaration"],
  [migration.includes("admin_create_provider_eligibility_policy_version") && configuration.includes('value="eligibility_policy"'), "admin-created eligibility policy versions"],
  [account.includes("AdminMfaReauthentication") && account.includes("operationId"), "MFA-aware idempotent account control UI"],
  [eligibility.includes("applicablePolicies") && eligibility.includes("recordAdminProviderEligibility"), "policy-scoped eligibility decision UI"],
  [api.includes("admin-user-account-control") && !api.includes("service_role"), "trusted Edge Function with no browser service key"],
  [!migration.includes("set enabled = true"), "no financial feature activation"],
];

const failures = requirements.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) throw new Error(`Admin user controls contract failed:\n- ${failures.join("\n- ")}`);
console.log("Admin user controls contract passed.");
