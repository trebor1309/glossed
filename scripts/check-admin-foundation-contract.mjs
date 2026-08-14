import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260814170000_admin_backoffice_foundation.sql");
const router = read("src/router/AppRouter.jsx");
const clientSidebar = read("src/components/navigation/SidebarClient.jsx");
const providerSidebar = read("src/components/navigation/SidebarPro.jsx");
const adminApp = read("src/admin/AdminApp.jsx");
const adminClient = read("src/admin/adminSupabase.js");
const verification = read("src/admin/VerificationReviewPage.jsx");
const vite = read("vite.config.js");
const vercel = read("vercel.json");

const requirements = [
  [migration.includes("create table public.admin_accounts"), "separate admin accounts"],
  [migration.includes("create table public.admin_account_roles"), "admin role assignments"],
  [migration.includes("create table public.admin_permission_definitions"), "granular permissions"],
  [migration.includes("'support'") && migration.includes("'verification'") && migration.includes("'disputes'") && migration.includes("'finance'") && migration.includes("'super_admin'"), "required admin roles"],
  [migration.includes("public.admin_current_aal() <> 'aal2'"), "server-side AAL2 enforcement"],
  [migration.includes("public.admin_current_aal() = 'aal2'"), "legacy admin guard requires AAL2"],
  [migration.includes("requires_recent_mfa") && migration.includes("financial_reauthentication_max_age_seconds"), "recent financial MFA policy"],
  [migration.includes("create table public.admin_auth_events") && migration.includes("create table public.admin_audit_log"), "admin connection and action audit"],
  [migration.includes("Administration audit records are immutable"), "immutable audit"],
  [migration.includes("assert_admin_permission('verification.read')") && migration.includes("assert_admin_permission('verification.review')"), "verification permission guards"],
  [migration.includes("admin_account_has_permission(p_admin_id, 'finance.execute')"), "financial v2 permission reuse"],
  [!migration.includes("set enabled = true") && !migration.includes("enabled, true"), "no financial feature activation"],
  [adminApp.includes('"admin.glossed.app"'), "dedicated admin hostname guard"],
  [adminApp.includes('path="verifications"') && adminApp.includes('path="finance"') && adminApp.includes('path="audit"'), "reserved admin navigation routes"],
  [vite.includes('admin: path.resolve(__dirname, "admin.html")'), "separate Vite admin entry"],
  [vercel.includes('"value": "admin.glossed.app"') && vercel.includes('"destination": "/admin.html"'), "Vercel admin host entry"],
  [adminClient.includes("VITE_SUPABASE_ANON_KEY") && !adminClient.includes("SERVICE_ROLE"), "browser uses anon key only"],
  [verification.includes("adminSupabase") && verification.includes("review_professional_verification"), "operational migrated verification UI"],
  [!router.includes("/admin/verifications") && !clientSidebar.includes("/admin/verifications") && !providerSidebar.includes("/admin/verifications"), "admin removed from consumer app and sidebars"],
];

const failures = requirements.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) {
  throw new Error(`Admin foundation contract failed:\n- ${failures.join("\n- ")}`);
}

console.log("Admin backoffice foundation contract passed.");
