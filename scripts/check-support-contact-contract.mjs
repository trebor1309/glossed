import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(path), "utf8");
const contactPage = read("src/pages/Contact.jsx");
const contactClient = read("src/lib/contactSupport.js");
const pressPage = read("src/pages/Press.jsx");
const careersPage = read("src/pages/Careers.jsx");
const edgeFunction = read("supabase/functions/submit-contact-request/index.ts");
const migration = read("supabase/migrations/20261013010000_support_contact.sql");
const config = read("supabase/config.toml");
const exampleEnv = read(".env.example");

const failures = [];
const requireText = (source, expected, message) => {
  if (!source.includes(expected)) failures.push(message);
};

if (
  /mockup only|[a-z0-9._%+-]+@glossed\.app/i.test(`${contactPage}\n${pressPage}\n${careersPage}`)
) {
  failures.push("Public contact surfaces still advertise mock or unconfigured contact handling");
}

requireText(
  contactClient,
  'functions.invoke("submit-contact-request"',
  "The public form is not wired to the contact Edge Function"
);
requireText(contactPage, 'to="/privacy"', "The form does not link to the Privacy Notice");
requireText(contactPage, 'name="website"', "The form honeypot is missing");
requireText(edgeFunction, '"Idempotency-Key"', "Resend delivery is not idempotent");
requireText(edgeFunction, "reply_to: payload.email", "Replies are not routed to the sender");
requireText(edgeFunction, 'admin.rpc("accept_contact_request"', "Requests are not persisted");
requireText(migration, "create table public.contact_requests", "Contact storage is missing");
requireText(migration, "contact_rate_limited", "Server-side rate limiting is missing");
requireText(
  migration,
  "revoke all on public.contact_requests from public, anon, authenticated",
  "Contact messages are not private"
);
requireText(
  config,
  "[functions.submit-contact-request]",
  "The public function is not configured for deployment"
);
requireText(exampleEnv, "CONTACT_EMAIL_FROM=", "The sender address is undocumented");
requireText(exampleEnv, "CONTACT_EMAIL_TO=", "The support destination is undocumented");

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Support contact contract checks passed.");
