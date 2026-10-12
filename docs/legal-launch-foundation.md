# Legal launch foundation

Version: `2026-10-12`

This foundation replaces the three public placeholders and adds a separate
professional agreement. It also records attributable, append-only acceptance
evidence and snapshots the accepted versions when Checkout or Stripe Connect
onboarding starts.

## Contract model

- Glossed supplies online intermediation, booking, communication and payment
  tooling. The beauty service is supplied by the independent professional.
- The client accepts the Terms of Use and Booking and acknowledges receipt of
  the Privacy Notice. A professional also accepts the Professional Terms.
- Privacy acknowledgement is deliberately not represented as GDPR consent.
  Optional processing that needs consent must collect it separately.
- Every document has a date version and SHA-256 digest. New material versions
  must be inserted as new database rows and must trigger reacceptance.
- Checkout and Connect operations fail closed when a current acceptance is
  missing and store a transaction snapshot of the accepted versions.
- A booking scheduled during the 14-day withdrawal period requires a separate
  express early-performance request before Checkout can start.

## Data model and trust boundaries

- `legal_document_versions` is the version registry.
- `user_legal_acceptances` is append-only evidence: subject, server timestamp,
  exact version, digest, context and operation id.
- `legal_transaction_snapshots` binds acceptance records to a Checkout attempt
  or Connect onboarding generation.
- Browser roles cannot insert or edit evidence directly. Authenticated users
  can only call the validation RPC, and Stripe-facing snapshots are restricted
  to the service role.
- Signup metadata is recorded only when every required code exactly matches a
  current published version. Missing or forged versions produce no evidence and
  the authenticated route guard requests acceptance again.

## Operator configuration required before launch

The repository does not contain the operator's verified identity. Production
must define all `VITE_LEGAL_*` variables documented in `.env.example`, including
the legal entity, legal form, registered office, BCE/KBO number, VAT status,
telephone and a working support address. The Legal Notice visibly fails closed
with a launch-blocker warning while mandatory fields are absent.

The following also require an operator/legal decision before commercial launch:

1. confirm the exact marketplace and payment-agent wording with Belgian counsel;
2. approve the cancellation schedule and any category-specific health or
   insurance requirements;
3. confirm whether the P2B small-enterprise exemptions apply and, if not,
   publish the complaint statistics and two mediators required by that regime;
4. execute and archive the processor/subprocessor contracts and international
   transfer assessment;
5. verify that `support@glossed.app` is live as part of PR #49;
6. obtain a final legal review of the English launch copy and add French/Dutch
   versions appropriate to the actual target market.

## Primary sources used

- Belgian FPS Economy, e-commerce information obligations:
  <https://economie.fgov.be/fr/themes/entreprises/guidance/pratiques-commerciales/obligations-dinformation-dans>
- GDPR, Regulation (EU) 2016/679:
  <https://eur-lex.europa.eu/eli/reg/2016/679/oj>
- Consumer Rights Directive 2011/83/EU:
  <https://eur-lex.europa.eu/eli/dir/2011/83/oj>
- Digital Services Act, Regulation (EU) 2022/2065:
  <https://eur-lex.europa.eu/eli/reg/2022/2065/oj>
- Platform-to-Business Regulation (EU) 2019/1150:
  <https://eur-lex.europa.eu/eli/reg/2019/1150/oj>
- Belgian FPS Economy, alternative consumer dispute resolution:
  <https://economie.fgov.be/fr/themes/protection-des-consommateurs/reglement-extrajudiciaire-des>

This repository document is an implementation record, not legal advice.
