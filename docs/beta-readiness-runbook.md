# Glossed beta-readiness runbook (#56)

This runbook separates repository guarantees from provider settings. A check is
not complete because code exists: retain the dated evidence listed below before
opening the closed beta.

## What the application now guarantees

- React render failures show a recoverable Glossed screen instead of a blank page.
- Browser runtime and Google Maps failures are reported to the private
  `client_operational_events` queue through a rate-limited Edge Function.
- Reports contain allow-listed codes, pathname only, release, locale, online
  state, visibility and viewport. They never contain raw exception messages,
  stack traces, query strings, form values, IP addresses or user-agent strings.
- IP address and user-agent are HMAC-hashed server-side only for abuse control.
- `/sante-technique` in the admin shows the last 24 hours and provides an
  audited resolve/reopen workflow.
- Supabase Auth templates in `supabase/email-templates/` are the versioned
  source of truth.

## 1. Activate branded Supabase Auth email

The hosted Supabase project keeps SMTP and template settings outside database
migrations. Complete these steps in **Authentication > Emails**.

1. Verify the Glossed sending domain with the chosen transactional provider.
   Use a dedicated sender such as `auth@glossed.app` or
   `notifications@glossed.app`; do not use the future human support mailbox as
   an automated sender.
2. Configure custom SMTP. For Resend the documented values are:
   - host: `smtp.resend.com`;
   - port: `465` with SSL;
   - username: `resend`;
   - password: a restricted Resend API key;
   - sender name: `Glossed`;
   - sender email: the verified Glossed sender.
3. Copy each versioned template and its subject from
   `supabase/email-templates/` into the matching Supabase template:
   confirmation, recovery, magic link, invite, email change and
   reauthentication.
4. Disable click/open tracking for Auth messages. Rewritten confirmation links
   can become invalid.
5. Confirm that the Site URL and redirect allow-list include the current
   canonical application (`https://glossed.vercel.app` during accounts-only
   beta) and `/auth/email-verified`.
6. Review Auth email rate limits after custom SMTP is enabled.

Evidence to retain: screenshot of SMTP sender settings without credentials,
template versions/date, and successful confirmation + password-reset emails to
two unrelated providers. The sender must display Glossed, both links must land
on the expected Glossed page, and no secret may appear in the evidence.

## 2. Create a real `support@glossed.app` channel

Resend outbound delivery and Resend inbound webhooks are not, by themselves, a
human mailbox. Before publishing `support@glossed.app`, provision either:

- a real mailbox able to receive and send as `support@glossed.app`; or
- a managed alias that forwards to `contact@ewcs.be` **and** has a tested,
  authenticated “send as support@glossed.app” path.

Then:

1. configure SPF, DKIM and DMARC for the chosen mail provider;
2. send to the address from an external account and reply from the support
   workflow;
3. verify that neither direction lands in spam and that replies preserve the
   Glossed address;
4. set the Supabase Edge Function secret
   `CONTACT_EMAIL_TO=support@glossed.app`;
5. submit `/contact`, confirm the reference in `/support` in the admin, receive
   the email and close the admin case.

Until this test passes, keep `CONTACT_EMAIL_TO=contact@ewcs.be`. Do not display
or promise an address that no human monitors.

## 3. Monitoring and alerts

### Glossed admin

Check `/sante-technique` daily during the closed beta. Investigate recurring
codes by release and path, add an issue, deploy the correction, then resolve the
event with a meaningful note. The queue is intentionally diagnostic rather
than a full observability platform.

### Google Maps Platform

In Google Cloud Console:

1. confirm Maps JavaScript API and Places API (New) are enabled;
2. keep the browser key restricted to required APIs and exact production
   referrers; include `https://glossed.vercel.app/*` until the public domain
   cutover and remove obsolete referrers afterwards;
3. inspect API metrics and error rates after a client and professional address
   test;
4. create quota notifications and Cloud Billing budget notifications with a
   monitored recipient. A budget notification is an alert, not a hard spending
   cap;
5. test one invalid local key and confirm that
   `google_maps_browser_key_rejected` reaches `/sante-technique`; never make the
   production key invalid for this test.

### Supabase and Vercel

- Review Supabase Auth, Edge Function and Postgres logs after each beta batch.
- Enable provider notifications for project incidents and approaching usage
  limits.
- Retain Vercel deployment failure notifications and confirm the production
  deployment is attached to the expected Git commit.
- After the first beta week, decide whether the first-party queue is sufficient
  or whether to add an external error tracker. Do not send personal data or
  form contents to a tracker by default.

## 4. Backups and recovery

Record the actual Supabase plan before launch. Pro, Team and Enterprise projects
receive scheduled database backups with plan-dependent retention; Free projects
need regular manual logical exports. Database backups do **not** restore deleted
Storage objects.

Initial closed-beta target:

- database RPO: 24 hours or better;
- recovery RTO: 4 hours after the restore decision;
- Storage: separate inventory/export procedure for profile, portfolio,
  verification and dispute objects;
- restoration drill: at least quarterly and once before public beta, into an
  isolated non-production project.

For the first drill:

1. verify the most recent backup time in **Database > Backups**;
2. export or restore into an isolated project, never over the production
   project for a test;
3. run migrations and the SQL contract suite against the recovered database;
4. verify representative users, profiles, messages, support cases and legal
   acceptance versions;
5. verify the separate Storage recovery inventory;
6. record date, operator, recovery point, duration, gaps and follow-up issue.

PITR is a paid add-on and should be selected from the accepted RPO and business
risk, not enabled blindly. Reassess it before payments are opened.

## Closed-beta evidence register

| Control                 | Required evidence                                     | Status until checked |
| ----------------------- | ----------------------------------------------------- | -------------------- |
| Auth sender + templates | confirmation and recovery across two providers        | Not verified         |
| Support mailbox         | inbound, reply-as and `/contact` reference            | Not verified         |
| Google Maps             | client + pro address, metrics, quota and budget alert | Not verified         |
| Client monitoring       | controlled non-production event visible and resolved  | Not verified         |
| Database backup         | latest restore point and isolated restore drill       | Not verified         |
| Storage recovery        | inventory/export and recovery sample                  | Not verified         |
| Deployment              | production URL and Git commit                         | Not verified         |

The owner of each check adds the date and evidence location to the launch issue.
Credentials, tokens, full IP addresses and user personal data must never be
copied into the issue.
