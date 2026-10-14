import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
const authenticatedSuite = read("e2e/authenticated/access.spec.js");
const readOnlyGuard = read("e2e/authenticated/helpers/readOnlyTest.js");
const workflow = read(".github/workflows/authenticated-e2e.yml");
const runbook = read("docs/accounts-only-production-validation.md");

const failures = [];
const requireText = (source, expected, message) => {
  if (!source.includes(expected)) failures.push(message);
};

for (const contract of [
  "live professional discovery tools",
  "gmp-place-autocomplete#discovery-location",
  "public profile without opening bookings",
  'name: "Bookings opening soon"',
  "public contact channel is ready",
  "conversations resolve profiles and fit a mobile viewport",
  "administrator reaches the dedicated admin app and its MFA boundary",
]) {
  requireText(
    authenticatedSuite,
    contract,
    `Missing accounts-only authenticated smoke coverage: ${contract}`
  );
}

for (const contract of [
  "blockedWrites",
  "stripeHost",
  "Authenticated smoke tests must not attempt business-data writes",
]) {
  requireText(
    readOnlyGuard,
    contract,
    `The production smoke suite lost its safety guard: ${contract}`
  );
}

requireText(workflow, 'cron: "23 5 * * *"', "The production smoke workflow is not scheduled");
requireText(
  workflow,
  "npm run test:e2e:auth",
  "The workflow does not execute the authenticated suite"
);

for (const contract of [
  "Inscription client et preuve juridique",
  "Inscription et profil professionnel",
  "Livraison réelle du formulaire Contact",
  "Suspension et réactivation administrateur",
  "Barrières réservation, proposition et paiement",
  "user_legal_acceptances",
  "contact_requests",
  "active → suspended",
  "suspended → active",
  "npm run test:sql",
]) {
  requireText(runbook, contract, `Missing accounts-only manual validation step: ${contract}`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Accounts-only production validation checks passed.");
