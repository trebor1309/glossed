\set ON_ERROR_STOP on

delete from public.notifications
where recipient_id::text like '60000000-%'
   or entity_id::text like '60000000-%';
delete from public.booking_notifications where booking_id::text like '60000000-%';
delete from public.missions where booking_id::text like '60000000-%';
delete from public.bookings where id::text like '60000000-%';
delete from public.app_admins where user_id::text like '60000000-%';
delete from public.admin_account_roles where user_id::text like '60000000-%';
delete from public.admin_accounts where user_id::text like '60000000-%';
delete from public.users where id::text like '60000000-%';
delete from auth.users where id::text like '60000000-%';

insert into auth.users (id, email, raw_user_meta_data) values
  ('60000000-0000-0000-0000-000000000010', 'e2e-support-client@example.test',
   '{"requested_role":"client"}'::jsonb),
  ('60000000-0000-0000-0000-000000000020', 'e2e-support-pro@example.test',
   '{"requested_role":"pro","business_name":"E2E Support Pro"}'::jsonb),
  ('60000000-0000-0000-0000-000000000030', 'e2e-support-admin@example.test',
   '{"requested_role":"client"}'::jsonb),
  ('60000000-0000-0000-0000-000000000040', 'e2e-support-outsider@example.test',
   '{"requested_role":"client"}'::jsonb);

update public.users set onboarding_completed = true where id::text like '60000000-%';
update public.users
set verification_status = 'verified',
    accepting_clients = true,
    business_type = array['Hair Stylist'],
    latitude = 50.8503,
    longitude = 4.3517,
    radius_km = 20
where id = '60000000-0000-0000-0000-000000000020';
insert into public.app_admins (user_id)
values ('60000000-0000-0000-0000-000000000030');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.bookings (
  id, client_id, pro_id, service, date, time_slot, address, notes, status
) values (
  '60000000-0000-0000-0000-000000000100',
  '60000000-0000-0000-0000-000000000010',
  '60000000-0000-0000-0000-000000000020',
  'E2E service', current_date + 7, 'Morning (8–12)', 'E2E address',
  '[E2E:sql-cancel] disposable booking', 'pending'
);

insert into public.booking_notifications (booking_id, pro_id) values (
  '60000000-0000-0000-0000-000000000100',
  '60000000-0000-0000-0000-000000000020'
);
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.create_mission_proposal(
  '60000000-0000-0000-0000-000000000100', 40.00, 5.00,
  current_date + 7, '09:00'::time, '[E2E:sql-cancel] proposal'
)).id;
commit;

select set_config(
  'app.test_e2e_proposal_id',
  (select id::text from public.missions
   where booking_id = '60000000-0000-0000-0000-000000000100'),
  false
);

insert into public.checkout_attempts (
  mission_id, booking_id, client_id, idempotency_key, status, expires_at
) values (
  current_setting('app.test_e2e_proposal_id')::uuid,
  '60000000-0000-0000-0000-000000000100',
  '60000000-0000-0000-0000-000000000010',
  'checkout:e2e-support-cancel-guard', 'reserved', now() + interval '30 minutes'
);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    perform public.cancel_mission_proposal(
      current_setting('app.test_e2e_proposal_id')::uuid
    );
    raise exception 'A proposal with a Checkout attempt was cancelled';
  exception when object_not_in_prerequisite_state then null;
  end;
end
$$;
commit;

delete from public.checkout_attempts
where mission_id = current_setting('app.test_e2e_proposal_id')::uuid;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000040', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    perform public.cancel_mission_proposal(
      current_setting('app.test_e2e_proposal_id')::uuid
    );
    raise exception 'An unrelated user cancelled another professional proposal';
  exception when insufficient_privilege then null;
  end;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.cancel_mission_proposal(
  current_setting('app.test_e2e_proposal_id')::uuid
);
commit;

do $$
begin
  if exists (
    select 1 from public.missions
    where booking_id = '60000000-0000-0000-0000-000000000100'
  ) then
    raise exception 'Cancelled proposal was not removed';
  end if;
  if (select status from public.bookings
      where id = '60000000-0000-0000-0000-000000000100') <> 'pending' then
    raise exception 'Booking did not return to pending after proposal cancellation';
  end if;
end
$$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.create_mission_proposal(
  '60000000-0000-0000-0000-000000000100', 42.00, 3.00,
  current_date + 7, '09:30'::time, '[E2E:sql-cleanup] proposal'
)).id;
commit;

insert into public.checkout_attempts (
  mission_id, booking_id, client_id, idempotency_key, status, expires_at
)
select id, booking_id, client_id, 'checkout:e2e-support-cleanup-guard',
       'reserved', now() + interval '30 minutes'
from public.missions
where booking_id = '60000000-0000-0000-0000-000000000100';

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000040', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    perform public.cleanup_e2e_booking('60000000-0000-0000-0000-000000000100');
    raise exception 'A non-administrator cleaned up E2E data';
  exception when insufficient_privilege then null;
  end;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000030', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '60000000-0000-0000-0000-000000000030', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'e2e-support-admin-guard',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
do $$
begin
  begin
    perform public.cleanup_e2e_booking('60000000-0000-0000-0000-000000000100');
    raise exception 'Financially linked E2E data was cleaned up';
  exception when object_not_in_prerequisite_state then null;
  end;
end
$$;
commit;

delete from public.checkout_attempts
where booking_id = '60000000-0000-0000-0000-000000000100';

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000030', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '60000000-0000-0000-0000-000000000030', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'e2e-support-admin-cleanup',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
select public.cleanup_e2e_booking('60000000-0000-0000-0000-000000000100');
commit;

do $$
begin
  if exists (select 1 from public.bookings where id = '60000000-0000-0000-0000-000000000100')
     or exists (select 1 from public.missions where booking_id = '60000000-0000-0000-0000-000000000100')
     or exists (select 1 from public.notifications where entity_id = '60000000-0000-0000-0000-000000000100') then
    raise exception 'E2E cleanup left business data behind';
  end if;
end
$$;

delete from public.app_admins where user_id::text like '60000000-%';
delete from public.admin_account_roles where user_id::text like '60000000-%';
delete from public.admin_accounts where user_id::text like '60000000-%';
delete from public.users where id::text like '60000000-%';
delete from auth.users where id::text like '60000000-%';

select 'booking offer E2E support tests passed' as result;
