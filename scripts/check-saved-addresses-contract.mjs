import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260909170000_saved_addresses_google_places.sql",
  "utf8"
);
const booking = readFileSync("src/pages/dashboard/pages/DashboardNew.jsx", "utf8");
const maps = readFileSync("src/context/GoogleMapsContext.jsx", "utf8");

const requiredMigrationContracts = [
  "create table public.user_addresses",
  "user_addresses_one_default_idx",
  "A maximum of 20 saved addresses is allowed",
  "user_addresses_select_own",
  "list_my_user_addresses_v1",
  "create_my_user_address_v1",
  "update_my_user_address_v1",
  "set_my_default_user_address_v1",
  "delete_my_user_address_v1",
  "backfill_legacy_user_addresses_v1",
  "pg_advisory_xact_lock",
];

for (const contract of requiredMigrationContracts) {
  if (!migration.includes(contract)) throw new Error(`Missing saved-address contract: ${contract}`);
}

for (const snapshotField of [
  "address: bookingData.address",
  "client_lat: bookingData.latitude",
  "client_lng: bookingData.longitude",
]) {
  if (!booking.includes(snapshotField))
    throw new Error(`Booking snapshot field missing: ${snapshotField}`);
}

if (!booking.includes("usingCustomAddress && (") || !booking.includes("listMyUserAddresses")) {
  throw new Error("Saved-address-first booking UX contract is missing");
}
if (
  !maps.includes("glossed-google-maps") ||
  !maps.includes('const GOOGLE_MAPS_LIBRARIES = ["places"]')
) {
  throw new Error("Central Google Maps/Places loader contract is missing");
}

process.stdout.write("Saved addresses and Google Places contract checks passed.\n");
