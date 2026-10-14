import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
const migration = read("supabase/migrations/20261013030000_public_account_launch.sql");
const legacyCheckout = read("supabase/functions/create-checkout-session/index.ts");
const checkoutV2 = read("supabase/functions/create-checkout-session-v2/index.ts");
const capabilities = read("src/context/PlatformCapabilitiesContext.jsx");
const bookingForm = read("src/pages/dashboard/pages/DashboardNew.jsx");
const publicProfile = read("src/pages/public-profile/ProProfileView.jsx");
const proposal = read("src/components/modals/ProProposalModal.jsx");
const offers = read("src/components/modals/ClientOffersModal.jsx");

const failures = [];
const requireText = (source, expected, message) => {
  if (!source.includes(expected)) failures.push(message);
};

for (const contract of [
  "create table public.platform_feature_flags",
  "create table public.platform_feature_flag_events",
  "'bookings',\n  false",
  "create trigger enforce_booking_creation_enabled",
  "create trigger enforce_proposal_creation_enabled",
  "create trigger enforce_legacy_checkout_creation_enabled",
  "create trigger enforce_checkout_v2_creation_enabled",
  "admin_set_platform_feature_flag",
  "configuration.manage",
  "platform_feature_flag_changed",
]) {
  requireText(migration, contract, `Missing database launch-gate contract: ${contract}`);
}

for (const edgeFunction of [legacyCheckout, checkoutV2]) {
  requireText(
    edgeFunction,
    'admin.rpc("assert_platform_feature_enabled"',
    "A Stripe checkout function can run without the public launch gate"
  );
  requireText(
    edgeFunction,
    'p_flag_code: "bookings"',
    "A Stripe checkout function checks the wrong platform capability"
  );
}

requireText(
  capabilities,
  "bookingsEnabled: data?.bookings_enabled === true",
  "The browser capability loader must fail closed"
);
requireText(
  bookingForm,
  "<BookingsPausedNotice />",
  "The direct booking form route is not guarded"
);
requireText(
  publicProfile,
  "disabled={!bookingsEnabled}",
  "Professional profiles still expose an active booking action"
);
requireText(
  proposal,
  "if (!bookingsEnabled) return;",
  "Professional proposals are not guarded in the browser"
);
requireText(offers, "Payments paused", "Legacy payment confirmation remains visibly active");

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Public account launch contract checks passed.");
