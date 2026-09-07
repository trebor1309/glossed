import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260907090000_reputation_trust_foundation.sql", import.meta.url),
  "utf8"
);
const modal = readFileSync(
  new URL("../src/components/modals/ProEvaluationModal.jsx", import.meta.url),
  "utf8"
);
const providerMission = readFileSync(
  new URL("../src/components/modals/ProMissionDetailsModal.jsx", import.meta.url),
  "utf8"
);
const legacyProfileHelper = readFileSync(
  new URL("../src/pages/public-profile/profileHelpers.js", import.meta.url),
  "utf8"
);

for (const required of [
  "service_delivery_outcomes_v1",
  "review_submission_operations_v1",
  "submit_review_v1",
  "auth.uid()",
  "operation_id was already used with a different review request",
  "reviews_one_client_review_per_mission_idx",
  "client_to_provider",
  "legacy_provider_to_client",
  "get_public_reviews",
  "get_public_review_summary",
  "verified_glossed_service",
  "round(avg(review.rating)::numeric, 1)",
  "provider_timeout_48h",
  "on delete restrict",
]) {
  if (!migration.includes(required)) {
    throw new Error(`Reputation migration is missing ${required}`);
  }
}

if (migration.includes("'provider_timeout'")) {
  throw new Error("Reputation eligibility must use the canonical provider_timeout_48h trigger");
}

if (!/revoke all on public\.reviews from public, anon, authenticated/.test(migration)) {
  throw new Error("Raw reviews must not remain readable or writable by browser roles");
}
if (!/operationIdRef = useRef\(uuid\(\)\)/.test(modal)) {
  throw new Error("Review retry identity must remain stable while the form is mounted");
}
if (!/supabase\.rpc\("submit_review_v1"/.test(modal)) {
  throw new Error("The browser must submit reviews through the trusted RPC");
}
for (const source of [modal, providerMission, legacyProfileHelper]) {
  if (/\.from\(["']reviews["']\)/.test(source)) {
    throw new Error("Browser code must not access raw reviews directly");
  }
}
if (/onEvaluate\?\.\(booking\)/.test(providerMission)) {
  throw new Error("Providers must not receive a public client-review action");
}

process.stdout.write("Reputation trust contract checks passed.\n");
