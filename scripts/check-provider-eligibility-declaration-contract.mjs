import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260904010000_provider_eligibility_declaration_portal.sql",
  "utf8"
);
const component = readFileSync(
  "src/pages/prodashboard/pages/settings/ProviderEligibilityDeclaration.jsx",
  "utf8"
);
const legalBilling = readFileSync("src/pages/prodashboard/pages/settings/LegalBilling.jsx", "utf8");
const accountCreation = readFileSync("supabase/functions/create-stripe-account/index.ts", "utf8");

const requirements = [
  [
    migration,
    /get_my_latest_provider_eligibility_declaration/,
    "own declaration getter is required",
  ],
  [migration, /auth\.uid\(\)/, "the getter must derive provider identity from the JWT"],
  [
    migration,
    /where declaration\.provider_id = v_provider_id[\s\S]+order by declaration\.revision desc/,
    "the getter must return only the latest own declaration",
  ],
  [
    migration,
    /grant execute[\s\S]+to authenticated, service_role/,
    "authenticated execute grant is required",
  ],
  [
    component,
    /submit_provider_eligibility_declaration/,
    "provider declaration submission is required",
  ],
  [
    component,
    /operationIdRef\.current \|\|= crypto\.randomUUID\(\)/,
    "retry identity must remain stable",
  ],
  [
    component,
    /This is your declaration, not an eligibility decision/,
    "declaration and decision must be distinct",
  ],
  [
    legalBilling,
    /<ProviderEligibilityDeclaration/,
    "Legal & Billing must expose the declaration flow",
  ],
  [
    legalBilling,
    /if \(!form\.stripe_account_id && !eligibilityDeclarationReady\)/,
    "only first Connect account creation must be blocked by a missing declaration",
  ],
  [
    accountCreation,
    /from\("provider_eligibility_declarations"\)[\s\S]+order\("revision", \{ ascending: false \}\)/,
    "Connect account country must remain sourced from the latest declaration",
  ],
];

for (const [source, pattern, message] of requirements) {
  if (!pattern.test(source)) {
    throw new Error(`Provider eligibility declaration contract: ${message}`);
  }
}

if (/residence_country_code:\s*["'](?:BE|DE|FR|LU)["']/.test(component)) {
  throw new Error("Provider declaration UI must not hardcode a residence country");
}
if (/setEligibilityDeclarationReady\(true\)/.test(legalBilling)) {
  throw new Error("Connect readiness must come from a persisted declaration, not a UI shortcut");
}

process.stdout.write("Provider eligibility declaration contract checks passed.\n");
