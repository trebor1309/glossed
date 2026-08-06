\set ON_ERROR_STOP on

\if :{?ADMIN_EMAIL}
\else
  \echo 'ADMIN_EMAIL must be provided with -v ADMIN_EMAIL=...'
  \quit 1
\endif

\if :{?ADMIN_UUID}
\else
  \echo 'ADMIN_UUID must be provided with -v ADMIN_UUID=...'
  \quit 1
\endif

begin transaction read only;

select set_config('app.expected_admin_email', :'ADMIN_EMAIL', true);
select set_config('app.expected_admin_uuid', :'ADMIN_UUID', true);

do $$
declare
  v_admin_id uuid := current_setting('app.expected_admin_uuid')::uuid;
  v_admin_email text := current_setting('app.expected_admin_email');
begin
  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260807010000'
  ) then
    raise exception 'Professional verification migration is missing from remote history';
  end if;
  if to_regclass('public.app_admins') is null
     or to_regclass('public.professional_verification_reviews') is null
     or to_regprocedure('public.review_professional_verification(uuid,text,text)') is null then
    raise exception 'Professional verification schema objects are incomplete';
  end if;
  if not exists (
    select 1
    from public.app_admins a
    join auth.users au on au.id = a.user_id
    where a.user_id = v_admin_id
      and lower(au.email) = lower(v_admin_email)
      and au.email_confirmed_at is not null
  ) then
    raise exception 'The expected administrator grant is missing or inconsistent';
  end if;
  if exists (
    select 1
    from public.users u
    where u.verification_status = 'verified'
      and (
        u.id_document is null
        or not exists (
          select 1
          from storage.objects o
          where o.bucket_id = 'verification-documents'
            and o.name = u.id_document
            and o.owner_id = u.id::text
        )
      )
  ) then
    raise exception 'A verified profile has no valid private ID document';
  end if;
  if has_table_privilege('authenticated', 'public.app_admins', 'select')
     or has_table_privilege(
       'authenticated', 'public.professional_verification_reviews', 'insert,update,delete'
     ) then
    raise exception 'Authenticated browser roles received forbidden direct privileges';
  end if;
end
$$;

select version
from supabase_migrations.schema_migrations
where version = '20260807010000';

select
  a.user_id,
  au.email,
  au.email_confirmed_at is not null as email_confirmed,
  a.created_at
from public.app_admins a
join auth.users au on au.id = a.user_id
where a.user_id = current_setting('app.expected_admin_uuid')::uuid;

select
  coalesce(verification_status, '<null>') as verification_status,
  count(*) as profiles
from public.users
group by coalesce(verification_status, '<null>')
order by verification_status;

select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'verification_documents_%'
order by policyname;

rollback;
