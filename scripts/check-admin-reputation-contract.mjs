import fs from "node:fs";

const files = {
  app: fs.readFileSync("src/admin/AdminApp.jsx", "utf8"),
  layout: fs.readFileSync("src/admin/AdminLayout.jsx", "utf8"),
  api: fs.readFileSync("src/admin/adminOperationsApi.js", "utf8"),
  list: fs.readFileSync("src/admin/AdminReputationPage.jsx", "utf8"),
  detail: fs.readFileSync("src/admin/AdminReputationDetailPage.jsx", "utf8"),
};

for (const rpc of [
  "admin_get_reputation_moderation_counts",
  "admin_list_reported_reviews",
  "admin_get_reported_review_detail",
  "admin_moderate_review_v1",
]) {
  if (!files.api.includes(rpc)) throw new Error(`Missing reputation RPC adapter: ${rpc}`);
}

for (const contract of [
  [files.app, 'permission="reputation.read"'],
  [files.layout, 'permission: "reputation.read"'],
  [files.detail, 'hasPermission("reputation.moderate")'],
  [files.detail, "crypto.randomUUID()"],
  [files.detail, "operationRef.current"],
  [files.list, "listAdminReportedReviews"],
]) {
  if (!contract[0].includes(contract[1])) {
    throw new Error(`Missing Admin Reputation UI contract: ${contract[1]}`);
  }
}

const frontend = Object.values(files).join("\n");
for (const forbidden of [
  '.from("reviews")',
  '.from("review_reports_v1")',
  '.from("review_status_events_v1")',
  "service_role",
]) {
  if (frontend.includes(forbidden)) {
    throw new Error(`Forbidden direct/private reputation access in Admin UI: ${forbidden}`);
  }
}

console.log("Admin Reputation moderation UI contract checks passed.");
