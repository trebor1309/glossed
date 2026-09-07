import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260907130000_reputation_ux_profile.sql");
const modal = read("src/components/modals/ProEvaluationModal.jsx");
const lifecycle = read("src/components/mission-lifecycle/MissionLifecycleV2Panel.jsx");
const clientDetails = read("src/components/modals/ClientReservationDetailsModal.jsx");
const providerMissions = read("src/pages/prodashboard/pages/ProDashboardMissions.jsx");
const profile = read("src/pages/public-profile/UserPublicProfile.jsx");
const reviews = read("src/pages/public-profile/ProfileReviews.jsx");
const discovery = read("src/pages/dashboard/pages/DashboardDiscover.jsx");

for (const required of [
  "review_received",
  "notify_provider_of_published_review_v1",
  "review-received:",
  "cross join lateral public.get_public_review_summary",
  "average_rating numeric",
  "review_count bigint",
]) {
  if (!migration.includes(required)) {
    throw new Error(`Reputation UX migration is missing ${required}`);
  }
}

if (!/operationIdRef = useRef\(uuid\(\)\)/.test(modal) || !/submittingRef/.test(modal)) {
  throw new Error("The review form must retain one operation identity and suppress concurrent submits");
}
if (!/supabase\.rpc\("submit_review_v1"/.test(modal)) {
  throw new Error("The review form must use the trusted submission RPC");
}
if (!/aria-label={`\$\{star\}/.test(modal) || !/maxLength={MAX_COMMENT_LENGTH}/.test(modal)) {
  throw new Error("The review form must expose accessible stars and the 2,000 character limit");
}
if (!/lifecycle\.review_available && !lifecycle\.reviewed_by_me/.test(lifecycle)) {
  throw new Error("The client review CTA must remain bound to the server lifecycle projection");
}
if (/status === "completed"[\s\S]{0,500}onEvaluate/.test(clientDetails)) {
  throw new Error("Client review eligibility must not be inferred from a legacy status");
}
if (/ProEvaluationModal|onEvaluate/.test(providerMissions)) {
  throw new Error("Providers must not receive a public review action");
}
if (!/get_public_review_summary/.test(profile) || !/get_public_reviews/.test(reviews)) {
  throw new Error("Public profiles must use the server summary and paginated review projection");
}
if (!/p_before_created_at/.test(reviews) || !/Show more reviews/.test(reviews)) {
  throw new Error("Public reviews must use cursor pagination");
}
if (!/provider\.average_rating/.test(discovery) || !/provider\.review_count/.test(discovery)) {
  throw new Error("Discovery cards must render embedded public reputation summaries");
}

process.stdout.write("Reputation UX and professional profile contract checks passed.\n");
