import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const auth = read("src/admin/AdminAuthContext.jsx");
const mfa = read("src/admin/AdminMfaReauthentication.jsx");
const overview = read("src/admin/AdminOverview.jsx");
const userDetail = read("src/admin/AdminUserDetailPage.jsx");
const administrators = read("src/admin/AdminAdministratorsPage.jsx");
const api = read("src/admin/adminOperationsApi.js");
const edge = read("supabase/functions/check-stripe-account/index.ts");
const migration = read("supabase/migrations/20260901090000_admin_ux_consolidation_1.sql");

const requirements = [
  [auth.includes("challengeAndVerify") && auth.includes("getSession()") && !auth.includes("refreshSession()"), "verified MFA JWT is retained without an immediate stale refresh"],
  [auth.includes("await loadFactors()"), "MFA configuration is loaded for authorized sessions"],
  [mfa.includes('event.key === "Enter"') && mfa.includes("mfa_recent"), "shared Enter-capable configured/recent MFA control"],
  [overview.includes("getConnectActionQueue") && overview.includes("Ouvrir le compte à traiter"), "actionable Connect dashboard shortcuts"],
  [userDetail.includes("Actualiser l’état Stripe") && userDetail.includes("Détails techniques"), "human-first Connect detail with secondary diagnostics"],
  [administrators.includes("Contrôles réalisés côté serveur") && administrators.includes("Conséquence de la confirmation"), "human administrator security previews"],
  [administrators.includes("Dernier super administrateur actif") && administrators.includes("Votre propre compte"), "contextual lockout guards"],
  [administrators.includes("Historique important") && administrators.includes("MFA configuré"), "administrator security and lifecycle history"],
  [api.includes("admin_preview_administrator_change_ux_v1") && api.includes("admin_get_administrator_history"), "server-backed administrator UX APIs"],
  [migration.includes("auth.mfa_factors") && migration.includes("mfa_reauthentication_expires_at"), "separate configured and recent MFA projections"],
  [migration.includes("security_checks") && migration.includes("consumer_profile_absent"), "trusted activation checks in server preview"],
  [edge.includes('claims.aal !== "aal2"') && edge.includes('p_permission_code: "users.read"'), "AAL2 and RBAC protected cross-account Connect refresh"],
  [edge.includes("connect_account_refreshed") && edge.includes("admin_audit_log"), "audited Connect refresh"],
  [!edge.includes("STRIPE_LIVE") && !migration.includes("set enabled = true"), "no Live Stripe or Production feature activation"],
  [!administrators.includes("service_role") && !api.includes("service_role"), "no service role in browser code"],
];

const failures = requirements.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) throw new Error(`Admin UX tranche 1 contract failed:\n- ${failures.join("\n- ")}`);
console.log("Admin UX consolidation tranche 1 contract passed.");
