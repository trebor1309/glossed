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

begin;

select set_config('app.bootstrap_admin_email', :'ADMIN_EMAIL', true);
select set_config('app.bootstrap_admin_uuid', :'ADMIN_UUID', true);

do $$
declare
  v_auth_user auth.users%rowtype;
  v_expected_id uuid := current_setting('app.bootstrap_admin_uuid')::uuid;
  v_expected_email text := current_setting('app.bootstrap_admin_email');
begin
  select au.* into strict v_auth_user
  from auth.users au
  where lower(au.email) = lower(v_expected_email);

  if v_auth_user.id <> v_expected_id then
    raise exception 'Auth UUID does not match the previously reviewed account';
  end if;
  if v_auth_user.email_confirmed_at is null then
    raise exception 'The administrator email is not confirmed';
  end if;
  if not exists (
    select 1
    from public.users u
    where u.id = v_expected_id
      and u.onboarding_completed = true
  ) then
    raise exception 'The administrator profile is missing or onboarding is incomplete';
  end if;

  insert into public.app_admins (user_id, granted_by)
  values (v_expected_id, null)
  on conflict (user_id) do nothing;
end
$$;

select
  a.user_id,
  au.email,
  a.created_at
from public.app_admins a
join auth.users au on au.id = a.user_id
where a.user_id = current_setting('app.bootstrap_admin_uuid')::uuid;

commit;
