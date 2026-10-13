# Minimum operational account administration

This tranche gives the dedicated Glossed back office two launch-critical tools
without turning it into a CRM.

## Consumer and provider suspension

- `users.manage` is granted to Support and super administrators and requires a
  recent MFA challenge.
- Suspension and reactivation require a detailed reason and stable operation
  identifier. Self-management and administrator identities are rejected.
- `admin-user-account-control` synchronizes the decision with Supabase Auth,
  then commits the local state and immutable audit. A failed database commit
  attempts to roll the Auth change back and records the failure.
- Suspended identities are rejected by the Data API pre-request hook, by every
  Edge Function using the shared `requireUser`, and by restrictive private
  Storage policies. Existing data is retained.

## Provider eligibility

- Configuration administrators can create an immutable eligibility policy
  version after legal validation. No Belgian or category rule is seeded by the
  migration and no finance feature flag is changed.
- Verification administrators can assess only the latest provider declaration
  against a currently active and applicable policy.
- Eligible decisions require an explicit future validity date. Every decision
  is immutable, idempotent and copied into the administration audit trail.

## Deployment order

1. Apply database migrations first so the shared account guard exists.
2. Deploy `admin-user-account-control` and all functions importing the updated
   shared `requireUser` helper.
3. Deploy the admin web application.
4. Test suspension and reactivation with a disposable non-admin account before
   using the control operationally.

Suspension is reversible. Account deletion and data-erasure workflows remain a
separate legal/operational concern and are intentionally not implemented here.
