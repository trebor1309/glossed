\set ON_ERROR_STOP on

\if :{?ADMIN_EMAIL}
\else
  \echo 'ADMIN_EMAIL must be provided with -v ADMIN_EMAIL=...'
  \quit 1
\endif

begin transaction read only;

select set_config('app.requested_admin_email', :'ADMIN_EMAIL', true);

do $$
declare
  v_matches integer;
begin
  select count(*) into v_matches
  from auth.users au
  where lower(au.email) = lower(current_setting('app.requested_admin_email'));

  if v_matches <> 1 then
    raise exception 'Expected exactly one Auth user for the requested email, found %', v_matches;
  end if;
end
$$;

select
  au.id as auth_user_id,
  au.email,
  au.email_confirmed_at is not null as email_confirmed,
  pu.id is not null as profile_exists,
  pu.role,
  pu.active_role,
  pu.onboarding_completed
from auth.users au
left join public.users pu on pu.id = au.id
where lower(au.email) = lower(current_setting('app.requested_admin_email'));

rollback;
