# Support and contact operations

The public Contact page submits to the `submit-contact-request` Supabase Edge
Function. Requests are validated and rate-limited server-side, stored privately
in `contact_requests`, and then forwarded to the configured support mailbox via
Resend. The visitor receives a short reference derived from the request UUID.

## Required production configuration

Configure these Supabase Edge Function secrets before enabling the public form:

- `RESEND_API_KEY`: existing Resend sending key;
- `CONTACT_EMAIL_FROM`: verified Resend sender, falling back to
  `NOTIFICATION_EMAIL_FROM` when omitted;
- `CONTACT_EMAIL_TO`: mailbox that receives every contact request;
- `ALLOWED_ORIGINS`: comma-separated production and preview origins;
- `CONTACT_FORM_HASH_SECRET`: optional dedicated HMAC secret. When omitted, the
  service-role key is used to pseudonymise sender network fingerprints.

For the initial launch, `CONTACT_EMAIL_TO` should be `contact@ewcs.be`. Do not
publish `support@glossed.app`, `pro@glossed.app`, `press@glossed.app` or
`jobs@glossed.app` until the corresponding mailbox or forwarding aliases have
been created and tested. The inbound and reply-as acceptance procedure for
`support@glossed.app` is defined in `docs/beta-readiness-runbook.md`.

## Failure and abuse behaviour

- The browser never receives Resend or service-role credentials.
- Anonymous and authenticated browser roles cannot read or insert stored
  messages directly.
- The same request UUID is idempotent in both PostgreSQL and Resend, so retrying
  an uncertain delivery does not generate duplicate support messages.
- A pseudonymous HMAC fingerprint and normalised email address are limited to
  three requests per 15 minutes and ten per 24 hours.
- The hidden honeypot silently discards basic automated submissions.
- If Resend fails, the message remains stored with `email_failed`; the visitor
  sees its reference and can retry the same request.

Support messages follow the retention period stated in the Privacy Notice. A
scheduled deletion/anonymisation job should be added before the first records
reach that limit.
