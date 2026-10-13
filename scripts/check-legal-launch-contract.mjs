import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { legalDocuments } from "../src/legal/legalDocuments.js";

const read = (path) => readFileSync(resolve(path), "utf8");
const migration = read("supabase/migrations/20261012010000_legal_launch_foundation.sql");
const routes = read("src/router/AppRouter.jsx");
const signup = read("src/context/UserContext.jsx");
const legacyCheckout = read("supabase/functions/create-checkout-session/index.ts");
const checkoutV2 = read("supabase/functions/create-checkout-session-v2/index.ts");
const connect = read("supabase/functions/create-stripe-account/index.ts");
const placeholders = [
  read("src/pages/Legal.jsx"),
  read("src/pages/Privacy.jsx"),
  read("src/pages/Terms.jsx"),
];

const failures = [];
const requireText = (source, expected, message) => {
  if (!source.includes(expected)) failures.push(message);
};

for (const document of Object.values(legalDocuments)) {
  const computedHash = createHash("sha256")
    .update(
      JSON.stringify({
        title: document.title,
        summary: document.summary,
        sections: document.sections,
      })
    )
    .digest("hex");
  requireText(migration, document.code, `Migration is missing ${document.code}`);
  requireText(migration, document.version, `Migration is missing ${document.code} version`);
  requireText(migration, document.contentHash, `Migration hash differs for ${document.code}`);
  if (!/^[0-9a-f]{64}$/.test(document.contentHash)) {
    failures.push(`${document.code} has an invalid content hash`);
  }
  if (computedHash !== document.contentHash) {
    failures.push(`${document.code} content does not match its SHA-256 digest`);
  }
}

requireText(routes, 'path="/legal/accept"', "Legal acceptance route is missing");
requireText(routes, "<LegalAcceptanceGuard>", "Protected routes are not gated by current terms");
requireText(
  signup,
  "legal_acceptances: signupLegalEvidence",
  "Signup does not submit versioned evidence"
);
requireText(
  migration,
  "create table public.user_legal_acceptances",
  "Append-only acceptance table is missing"
);
requireText(
  migration,
  "create table public.legal_transaction_snapshots",
  "Transaction legal snapshots are missing"
);
requireText(
  legacyCheckout,
  '"snapshot_user_legal_acceptances"',
  "Legacy Checkout does not snapshot accepted legal versions"
);
requireText(
  checkoutV2,
  '"snapshot_user_legal_acceptances"',
  "Checkout v2 does not snapshot accepted legal versions"
);
requireText(
  connect,
  '"snapshot_user_legal_acceptances"',
  "Connect onboarding does not snapshot professional terms"
);

if (placeholders.some((source) => /coming soon/i.test(source))) {
  failures.push("A public legal page is still a Coming soon placeholder");
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Legal launch contract checks passed.");
