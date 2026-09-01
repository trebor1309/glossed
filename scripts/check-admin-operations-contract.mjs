import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260814190000_admin_operations_read_models.sql");
const app = read("src/admin/AdminApp.jsx");
const layout = read("src/admin/AdminLayout.jsx");
const overview = read("src/admin/AdminOverview.jsx");
const users = read("src/admin/AdminUsersPage.jsx") + read("src/admin/AdminUserDetailPage.jsx");
const missions = read("src/admin/AdminMissionsPage.jsx") + read("src/admin/AdminMissionDetailPage.jsx");
const api = read("src/admin/adminOperationsApi.js");

const requirements = [
  [migration.includes("admin_get_operations_overview"), "server-computed action queues"],
  [migration.includes("admin_global_search") && migration.includes("admin_list_users") && migration.includes("admin_list_missions"), "global and collection reads"],
  [migration.includes("admin_get_user_detail") && migration.includes("admin_get_mission_detail"), "user and mission detail reads"],
  [migration.includes("public.has_admin_permission('finance.read')") && migration.includes("'financial_access', v_can_finance"), "financial field permission gate"],
  [migration.includes("v_can_finance and (") && migration.includes("stripe_payment_intent_id"), "Stripe identifier search permission gate"],
  [migration.includes("record_admin_read_audit") && migration.includes("revoke all on function public.record_admin_read_audit"), "unforgeable read audit"],
  [migration.includes("assert_admin_permission('users.read')") && migration.includes("assert_admin_permission('missions.read')"), "server-side RBAC"],
  [!migration.includes("set enabled = true") && !migration.includes("financial_feature_flags") && !migration.includes("transfer_data.destination"), "no financial engine or feature flag change"],
  [app.includes('path="utilisateurs/:userId"') && app.includes('path="missions/:missionId"'), "admin detail routes"],
  [layout.includes("AdminGlobalSearch"), "global search in admin layout"],
  [overview.includes("financial_incidents") && overview.includes("connect_actions") && overview.includes("mission_anomalies"), "required overview queues"],
  [users.includes("Éligibilité prestataire") && users.includes("Compte Stripe Connect") && users.includes("Activité Glossed"), "complete user operations view"],
  [missions.includes("Machines d’état") && missions.includes("Instantané contractuel") && missions.includes('title="Finance"') && missions.includes("Mission historique"), "complete mission operations view"],
  [api.includes("VITE_SUPABASE") === false && api.includes("adminSupabase.rpc"), "admin RPC client reuses protected session"],
  [!missions.includes("refund-stripe-payment") && !missions.includes("create-transfer") && !missions.includes("allocate-dispute"), "no financial mutation UI"],
];

const failures = requirements.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) throw new Error(`Admin operations contract failed:\n- ${failures.join("\n- ")}`);

console.log("Admin operations read-only contract passed.");
