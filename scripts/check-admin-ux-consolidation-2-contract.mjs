import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const i18n = read("src/admin/adminI18n.js");
const missions = read("src/admin/AdminMissionsPage.jsx");
const missionDetail = read("src/admin/AdminMissionDetailPage.jsx");
const verifications = read("src/admin/VerificationReviewPage.jsx");
const disputes = read("src/admin/AdminDisputesPage.jsx");
const finance = read("src/admin/AdminFinancePage.jsx");
const risk = read("src/admin/AdminPaymentDisputesPage.jsx");
const incidents = read("src/admin/AdminIncidentsPage.jsx");
const audit = read("src/admin/AdminAuditPage.jsx");
const api = read("src/admin/adminOperationsApi.js");
const migration = read("supabase/migrations/20260901210000_admin_ux_consolidation_2.sql");

const requirements = [
  [i18n.includes('["fr", "nl", "de", "en"]') && i18n.includes("glossed-admin-locale"), "independent four-locale admin i18n foundation"],
  [missions.includes("attentionOnly") && missions.includes("flowVersion") && missions.includes("PAGE_SIZE"), "mission filters, v1/v2 context and server pagination"],
  [missionDetail.includes("Mission historique") && missionDetail.includes("!isLegacy"), "condensed legacy mission detail"],
  [verifications.includes('setView("history")') && verifications.includes("listAdminProfessionalVerifications"), "open verification queue with secondary history"],
  [disputes.includes("getAdminDisputeQueueCounts") && disputes.includes("disputes_history"), "dispute and cancellation counts plus history"],
  [finance.includes("finance.placeholder") && finance.includes("finance.legacy_notice"), "search-first finance guidance and legacy notice"],
  [risk.includes("getAdminPaymentDisputeCounts") && risk.includes("risk.won"), "payment-dispute counters and clarified won consequence"],
  [incidents.includes("runtime_control_blocked") && incidents.includes("getAdminIncidentCounts"), "visible blocking incident severity and counters"],
  [audit.includes("actorQuery") && audit.includes("dateFrom") && audit.includes('role="dialog"'), "filtered audit with readable event detail"],
  [api.includes("admin_list_missions_ux_v2") && api.includes("admin_search_audit_ux_v2"), "server-backed operational read models"],
  [migration.includes("assert_admin_permission") && migration.includes("record_admin_read_audit"), "RBAC and read auditing preserved"],
  [migration.includes("p_outcome='failed' and event.outcome<>'success'"), "failure audit filter includes denied and MFA challenge outcomes"],
  [!migration.includes("set enabled = true") && !migration.includes("STRIPE_LIVE"), "no production financial activation"],
];

const failures = requirements.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) throw new Error(`Admin UX tranche 2 contract failed:\n- ${failures.join("\n- ")}`);
console.log("Admin UX consolidation tranche 2 contract passed.");
