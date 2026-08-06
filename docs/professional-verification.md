# Professional verification operations

Professional verification is controlled by the `public.app_admins` allowlist.
The table is not readable or writable through the browser. Initial access must
be granted from a trusted Supabase SQL session after confirming the exact Auth
user UUID. The reusable `supabase/operations/appoint_first_admin.sql` script
checks both the email and UUID in one transaction before inserting the grant.

```sql
select id, email, email_confirmed_at
from auth.users
where id = '<ADMIN_AUTH_USER_UUID>'::uuid;

insert into public.app_admins (user_id, granted_by)
values ('<ADMIN_AUTH_USER_UUID>'::uuid, null)
on conflict (user_id) do nothing;
```

Use `granted_by` for later appointments so the source of the grant remains
visible. Revoke access only from a trusted SQL session:

```sql
delete from public.app_admins
where user_id = '<ADMIN_AUTH_USER_UUID>'::uuid;
```

After appointment, the administrator signs in normally and opens
`/admin/verifications`. Documents are opened with private signed URLs that
expire after ten minutes. Approval and rejection are performed by
`review_professional_verification`; each decision records the reviewer, status,
reason, document references, and timestamp in
`professional_verification_reviews`.

Deployment order:

1. Audit verified professionals against the preflight guard in the migration.
2. Apply `20260807010000_professional_verification.sql`.
3. Appoint the first administrator with an exact, confirmed Auth UUID.
4. Deploy the frontend.
5. Test one rejection and one approval with non-production documents before
   processing real requests.

Changing or removing a verification document automatically removes the badge
and sends the profile back to `pending` (or `unverified` when no ID remains).
An active referenced document cannot be deleted from Storage until its profile
reference has been detached.
