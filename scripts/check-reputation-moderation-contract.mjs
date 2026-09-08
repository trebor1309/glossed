import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260908100000_reputation_moderation_backend.sql",
    import.meta.url
  ),
  "utf8"
);

for (const required of [
  "review_replies_v1",
  "review_reply_operations_v1",
  "review_reports_v1",
  "review_moderation_operations_v1",
  "submit_review_reply_v1",
  "report_review_v1",
  "admin_get_reputation_moderation_counts",
  "admin_list_reported_reviews",
  "admin_get_reported_review_detail",
  "admin_moderate_review_v1",
  "reputation.read",
  "reputation.moderate",
  "review_reply_received",
  "review_moderation_decided",
  "resolved_kept",
  "resolved_hidden",
  "resolved_removed",
  "Removed reviews are terminal",
  "operation_id was already used with a different reply request",
  "operation_id was already used with a different report request",
  "operation_id was already used with a different moderation request",
]) {
  if (!migration.includes(required)) {
    throw new Error(`Reputation moderation migration is missing ${required}`);
  }
}

for (const table of [
  "review_replies_v1",
  "review_reply_operations_v1",
  "review_reports_v1",
  "review_moderation_operations_v1",
]) {
  const pattern = new RegExp(
    `revoke all on public\\.${table} from public, anon, authenticated`,
    "i"
  );
  if (!pattern.test(migration)) {
    throw new Error(`${table} must not be directly exposed to browser roles`);
  }
}

if (!/unique \(review_id, reporter_id\)/.test(migration)) {
  throw new Error("A user must have at most one logical report per review");
}
if (!/review_id uuid not null unique/.test(migration)) {
  throw new Error("A review must have at most one provider reply");
}
if (!/review\.status = 'published'/.test(migration)) {
  throw new Error("The public projection must continue to filter published reviews");
}
if (!/perform public\.assert_admin_permission\('reputation\.read'\)/.test(migration)) {
  throw new Error("Private moderation reads must be protected by reputation.read");
}
if (!/perform public\.assert_admin_permission\('reputation\.moderate'\)/.test(migration)) {
  throw new Error("Moderation mutations must be protected by reputation.moderate");
}
if (/assert_admin_permission\('reputation\.(read|moderate)',\s*true\)/.test(migration)) {
  throw new Error("Reputation moderation requires AAL2, not recent financial MFA");
}

process.stdout.write("Reputation moderation backend contract checks passed.\n");
