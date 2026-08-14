# Admin back-office foundation

This tranche creates a separate browser entry for `admin.glossed.app`. It does
not activate a financial v2 feature and does not deploy or configure the custom
domain.

## Security boundary

- Supabase Auth remains the identity provider, but administrator accounts,
  roles and permissions are stored independently from `public.users`.
- Future trusted provisioning should create the Auth identity with
  `app_metadata.account_type = admin`; the user-profile trigger then skips the
  client/provider profile.
- Existing `app_admins` entries are migrated to `super_admin` so the current
  verification workflow remains operable. New authorization decisions use
  `admin_accounts`, `admin_account_roles` and `admin_role_permissions`.
- Every back-office permission requires an authenticated AAL2 JWT. Permissions
  marked financial additionally require a recent MFA timestamp under a
  versioned security policy (initially five minutes).
- The admin browser client contains only the public Supabase anon key. Database
  RPCs, storage policies and RLS repeat authorization server-side.
- Authenticated access attempts, logouts and administrative decisions are
  written to immutable audit tables.

## Delivered workflow

Provider verification is available at `/verifications` on the admin host.
Listing private documents requires `verification.read`; approval or rejection
requires `verification.review`. Decisions continue to populate the domain
review table and now also populate the administration audit log.

The former `/admin/verifications` consumer-app route and client/provider sidebar
links are removed.

## Reserved navigation

Overview, Users, Verifications, Missions, Disputes, Finance, Chargebacks/risk,
Incidents, Audit and Configuration/compliance are present according to the
current administrator permissions. Only Verifications is operational in this
tranche.

## Activation prerequisites (not performed by this PR)

1. Review and apply the migration in the controlled deployment workflow.
2. Provision dedicated admin Auth identities through a trusted server process.
3. Ensure each administrator enrolls and verifies MFA before access.
4. Add `admin.glossed.app` to Supabase Auth redirect URLs and allowed origins.
5. Attach and validate the custom domain in Vercel, including DNS/TLS.
6. Configure `VITE_ADMIN_ALLOWED_HOSTS` for any explicitly approved preview
   host; production defaults to `admin.glossed.app`.
7. Exercise login, MFA, verification review and audit in a non-Live environment
   before production access is granted.
