import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const profileReviews = read("src/pages/public-profile/ProfileReviews.jsx");
const proProfile = read("src/pages/public-profile/ProProfileView.jsx");
const publicProfile = read("src/pages/public-profile/UserPublicProfile.jsx");
const scrollToTop = read("src/components/ScrollToTop.jsx");
const replyModal = read("src/components/reputation/ReviewReplyModal.jsx");
const reportModal = read("src/components/reputation/ReviewReportModal.jsx");
const modalShell = read("src/components/reputation/ReputationModalShell.jsx");
const notifications = read("src/pages/shared/DashboardNotifications.jsx");

for (const required of [
  "provider_reply",
  "provider_replied_at",
  "Réponse du professionnel",
  "currentUserId === targetUserId",
]) {
  if (!profileReviews.includes(required)) {
    throw new Error(`Public reviews are missing the required interaction contract: ${required}`);
  }
}

if (!/id="reviews"/.test(proProfile) || !/currentUserId={user\?\.id \|\| null}/.test(proProfile)) {
  throw new Error(
    "The public professional profile must identify its review anchor and current viewer"
  );
}

for (const [source, rpc, maxLength] of [
  [replyModal, "submit_review_reply_v1", "MAX_REPLY_LENGTH = 2000"],
  [reportModal, "report_review_v1", "MAX_REPORT_EXPLANATION_LENGTH = 1000"],
]) {
  if (!source.includes(`supabase.rpc(\"${rpc}\"`) || !source.includes(maxLength)) {
    throw new Error(`${rpc} must remain the only bounded public interaction path`);
  }
  if (!/operationIdRef = useRef\(uuid\(\)\)/.test(source) || !/submittingRef/.test(source)) {
    throw new Error(
      `${rpc} must retain a stable operation identity and suppress concurrent submits`
    );
  }
}

for (const reason of [
  "abusive_or_hateful",
  "personal_or_sensitive_info",
  "spam_or_commercial",
  "off_topic_or_misleading",
  "other",
]) {
  if (!reportModal.includes(`code: \"${reason}\"`)) {
    throw new Error(`The report form is missing canonical reason ${reason}`);
  }
}

for (const accessibilityContract of [
  'role="dialog"',
  'aria-modal="true"',
  'event.key === "Escape"',
  'event.key !== "Tab"',
  "returnFocusRef.current?.focus",
  "busyRef.current",
]) {
  if (!modalShell.includes(accessibilityContract)) {
    throw new Error(`Reputation modals are missing ${accessibilityContract}`);
  }
}

if (/\}, \[busy,/.test(modalShell)) {
  throw new Error("Modal focus lifecycle must not restart when busy changes");
}

if (
  !publicProfile.includes('location.hash !== "#reviews"') ||
  !publicProfile.includes("reviewsSection.scrollIntoView") ||
  !scrollToTop.includes("if (!hash) window.scrollTo")
) {
  throw new Error("Async public profiles must handle the review fragment after rendering");
}

for (const notificationType of ["review_reply_received", "review_moderation_decided"]) {
  if (!notifications.includes(notificationType)) {
    throw new Error(`Notification presentation is missing ${notificationType}`);
  }
}
for (const canonicalModerationMessage of [
  "A reported review was reviewed and remains published.",
  "A review was hidden following a moderation decision.",
  "A review was removed following a moderation decision.",
]) {
  if (!notifications.includes(canonicalModerationMessage)) {
    throw new Error(`Moderation notification whitelist is missing ${canonicalModerationMessage}`);
  }
}
if (!notifications.includes("#reviews") || !notifications.includes("Glossed a terminé l’examen")) {
  throw new Error("Reputation notifications must be safe and link to the public review section");
}

process.stdout.write("Public reputation interactions contract checks passed.\n");
