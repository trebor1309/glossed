import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (path) => readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
const migration = read("supabase/migrations/20261015010000_operations_gdpr_ux_hardening.sql");
const settings = read("src/pages/shared/DashboardSettingsUnified.jsx");
const privacySection = read("src/components/privacy/PrivacyRequestsSection.jsx");
const adminPage = read("src/admin/AdminPrivacyRequestsPage.jsx");
const adminSupport = read("src/admin/AdminSupportRequestsPage.jsx");
const adminUsers = read("src/admin/AdminUsersPage.jsx");
const errors = read("src/lib/userFacingError.js");
const userContext = read("src/context/UserContext.jsx");
const navbar = read("src/components/navigation/NavbarMain.jsx");
const displayName = read("src/lib/userDisplayName.js");
const runbook = read("docs/operations-gdpr-runbook.md");
const exampleEnv = read(".env.example");

const failures = [];
const requireText = (source, expected, message) => {
  if (!source.includes(expected)) failures.push(message);
};

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(js|jsx)$/.test(name)
        ? [path]
        : [];
  });
}

for (const path of sourceFiles("src")) {
  if (/\b(?:window\.)?alert\s*\(/.test(read(path))) {
    failures.push(`Native browser alert remains in ${path}`);
  }
}

for (const contract of [
  "create table public.data_subject_requests",
  "submit_my_data_subject_request",
  "get_my_data_subject_requests",
  "admin_list_data_subject_requests",
  "admin_update_data_subject_request",
  "privacy.manage",
  "interval '1 month'",
  "on delete restrict",
  "data_subject_request_events_immutable",
  "admin_list_contact_requests",
  "admin_update_contact_request",
]) {
  requireText(migration, contract, `Missing GDPR database contract: ${contract}`);
}

requireText(settings, "PrivacyRequestsSection", "Account settings do not expose privacy requests");
requireText(privacySection, "submit_my_data_subject_request", "Privacy form is not server-backed");
requireText(adminPage, "AdminMfaReauthentication", "Privacy decisions do not enforce recent MFA");
requireText(
  adminSupport,
  "listAdminContactRequests",
  "Public support requests are absent from admin"
);
requireText(adminUsers, 'value="client"', "Admin user search lacks a client filter");
requireText(adminUsers, 'value="pro"', "Admin user search lacks a professional filter");
requireText(errors, "users_username_key", "Duplicate usernames are not translated for users");
requireText(errors, "account has been suspended", "Suspended login is not translated for users");
requireText(
  userContext,
  'publicAppUrl("/auth/email-verified")',
  "Auth email does not use the configured public origin"
);
requireText(exampleEnv, "VITE_PUBLIC_APP_URL=", "The public Auth origin is undocumented");
requireText(navbar, "userDisplayName(user)", "The navbar does not use the profile display name");
requireText(displayName, "first_name", "The profile display name does not prefer the first name");
requireText(displayName, "username", "The profile display name does not fall back to the username");
if (/email.*split|split\(["']@["']\)/.test(navbar)) {
  failures.push("The navbar still derives the welcome name from the email address");
}

for (const contract of [
  "Matrice de conservation à faire valider",
  "Il est interdit de contourner les contraintes avec un `CASCADE` global",
  "Incident impliquant des données personnelles",
  "VITE_PUBLIC_APP_URL",
  "support@glossed.app",
]) {
  requireText(runbook, contract, `Missing operations runbook contract: ${contract}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Operations, GDPR and UX hardening contract checks passed.");
