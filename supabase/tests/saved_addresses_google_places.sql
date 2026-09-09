\set ON_ERROR_STOP on

select set_config('app.test_database_url', :'TEST_DATABASE_URL', false);

delete from public.booking_notifications where pro_id::text like '46000000-%';
delete from public.targeted_booking_operations where client_id::text like '46000000-%';
delete from public.bookings where client_id::text like '46000000-%';
delete from public.user_addresses where user_id::text like '46000000-%';
delete from public.users where id::text like '46000000-%';
delete from auth.users where id::text like '46000000-%';

insert into auth.users (id, email, raw_user_meta_data) values
  ('46000000-0000-0000-0000-000000000010', 'addresses-client-a@example.test',
   '{"requested_role":"client"}'::jsonb),
  ('46000000-0000-0000-0000-000000000020', 'addresses-client-b@example.test',
   '{"requested_role":"client"}'::jsonb),
  ('46000000-0000-0000-0000-000000000030', 'addresses-provider@example.test',
   '{"requested_role":"pro","business_name":"Address Test Pro"}'::jsonb),
  ('46000000-0000-0000-0000-000000000040', 'invalid-legacy-address@example.test',
   '{"requested_role":"client"}'::jsonb);

update public.users
set address = '1 Legacy Street, Brussels',
    city = 'Brussels',
    postal_code = '1000',
    country = 'BE',
    latitude = 50.8503,
    longitude = 4.3517,
    onboarding_completed = true
where id = '46000000-0000-0000-0000-000000000010';

update public.users
set address = 'Address without usable coordinates',
    latitude = null,
    longitude = null,
    onboarding_completed = true
where id = '46000000-0000-0000-0000-000000000040';

update public.users
set onboarding_completed = true,
    verification_status = 'verified',
    accepting_clients = true,
    business_type = array['Hair Stylist'],
    latitude = 50.8503,
    longitude = 4.3517,
    radius_km = 30,
    city = 'Brussels',
    country = 'BE'
where id = '46000000-0000-0000-0000-000000000030';

-- The compatibility pass can be rerun without creating duplicates, and does
-- not turn an unresolvable legacy string into a bookable saved address.
select public.backfill_legacy_user_addresses_v1();
select public.backfill_legacy_user_addresses_v1();

do $$
begin
  if (select count(*) from public.user_addresses
      where user_id = '46000000-0000-0000-0000-000000000010') <> 1 then
    raise exception 'Legacy address backfill was not idempotent';
  end if;
  if not (select is_default from public.user_addresses
      where user_id = '46000000-0000-0000-0000-000000000010') then
    raise exception 'First legacy address did not become the default';
  end if;
  if exists (select 1 from public.user_addresses
      where user_id = '46000000-0000-0000-0000-000000000040') then
    raise exception 'Legacy address without coordinates became bookable';
  end if;
end
$$;

begin;
set local role anon;
do $$
begin
  begin
    perform * from public.list_my_user_addresses_v1();
    raise exception 'Anonymous caller listed private saved addresses';
  exception when insufficient_privilege then null;
  end;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '46000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temporary table first_address_create as
select * from public.create_my_user_address_v1(
  '46000000-0000-0000-0000-000000000101',
  'Work', '2 Work Avenue, Brussels', 'Brussels', '1000', 'be',
  50.8467, 4.3525, false
);

create temporary table replayed_address_create as
select * from public.create_my_user_address_v1(
  '46000000-0000-0000-0000-000000000101',
  ' Work ', ' 2 Work Avenue, Brussels ', ' Brussels ', ' 1000 ', 'BE',
  50.8467, 4.3525, false
);

do $$
begin
  if (select idempotent from first_address_create) then
    raise exception 'Initial saved-address creation was marked as a replay';
  end if;
  if not (select idempotent from replayed_address_create) then
    raise exception 'Saved-address retry was not replayed idempotently';
  end if;
  if (select count(*) from public.user_addresses
      where id = '46000000-0000-0000-0000-000000000101') <> 1 then
    raise exception 'Saved-address retry created a duplicate';
  end if;

  begin
    perform * from public.create_my_user_address_v1(
      '46000000-0000-0000-0000-000000000101',
      'Changed', 'Different address', null, null, 'BE', 50.85, 4.35, false
    );
    raise exception 'Stable address identifier accepted a different payload';
  exception when invalid_parameter_value then null;
  end;

  begin
    insert into public.user_addresses (
      id, user_id, label, formatted_address, latitude, longitude, creation_fingerprint
    ) values (
      gen_random_uuid(), '46000000-0000-0000-0000-000000000010',
      'Direct', 'Forbidden direct write', 50.85, 4.35, 'forbidden'
    );
    raise exception 'Authenticated caller bypassed the saved-address RPCs';
  exception when insufficient_privilege then null;
  end;
end
$$;

select * from public.set_my_default_user_address_v1(
  '46000000-0000-0000-0000-000000000101'
);

do $$
begin
  if (select count(*) from public.user_addresses
      where user_id = '46000000-0000-0000-0000-000000000010' and is_default) <> 1
     or not (select is_default from public.user_addresses
      where id = '46000000-0000-0000-0000-000000000101') then
    raise exception 'Atomic default-address switch failed';
  end if;
  if (select count(*) from public.list_my_user_addresses_v1()) <> 2 then
    raise exception 'Owner could not list their saved addresses';
  end if;
end
$$;

-- Both booking paths keep a copied snapshot rather than a dynamic relation to
-- user_addresses.
insert into public.bookings (
  id, client_id, service, date, time_slot, address, notes,
  client_lat, client_lng, status
) values (
  '46000000-0000-0000-0000-000000000201',
  '46000000-0000-0000-0000-000000000010',
  'Hair Stylist', current_date + 5, '09:00', '2 Work Avenue, Brussels',
  'Normal saved-address snapshot', 50.8467, 4.3525, 'pending'
);

create temporary table targeted_address_booking as
select * from public.create_targeted_booking_request(
  '46000000-0000-0000-0000-000000000202',
  '46000000-0000-0000-0000-000000000030',
  array['hair_stylist'], current_date + 5, '10:00',
  '2 Work Avenue, Brussels', 'Targeted saved-address snapshot', 50.8467, 4.3525
);

select * from public.update_my_user_address_v1(
  '46000000-0000-0000-0000-000000000101',
  'Work', '99 Changed Later Street', 'Brussels', '1000', 'BE', 50.86, 4.36
);

do $$
begin
  if exists (
    select 1 from public.bookings
    where id in (
      '46000000-0000-0000-0000-000000000201',
      (select booking_id from targeted_address_booking)
    )
      and (address <> '2 Work Avenue, Brussels'
        or client_lat <> 50.8467 or client_lng <> 4.3525)
  ) then
    raise exception 'Editing a saved address changed a booking snapshot';
  end if;
end
$$;

select * from public.delete_my_user_address_v1(
  '46000000-0000-0000-0000-000000000101'
);

do $$
begin
  if (select count(*) from public.user_addresses
      where user_id = '46000000-0000-0000-0000-000000000010' and is_default) <> 1 then
    raise exception 'Deleting the default did not choose one deterministic replacement';
  end if;
end
$$;

-- Fill the remaining quota and prove that it cannot be exceeded.
select *
from generate_series(1, 19) sequence_number
cross join lateral public.create_my_user_address_v1(
  md5('address-quota-' || sequence_number::text)::uuid,
  'Address ' || sequence_number,
  sequence_number || ' Quota Street', null, null, 'BE',
  50.80 + sequence_number / 10000.0,
  4.30 + sequence_number / 10000.0,
  false
);

do $$
begin
  if (select count(*) from public.user_addresses
      where user_id = '46000000-0000-0000-0000-000000000010') <> 20 then
    raise exception 'Saved-address quota setup did not reach 20';
  end if;
  begin
    perform * from public.create_my_user_address_v1(
      '46000000-0000-0000-0000-000000000199',
      'Too many', '21 Quota Street', null, null, 'BE', 50.9, 4.4, false
    );
    raise exception 'Saved-address quota allowed more than 20 rows';
  exception when check_violation then null;
  end;
end
$$;
commit;

-- RLS keeps exact address data private from another authenticated user.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '46000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  if exists (select 1 from public.user_addresses
      where user_id = '46000000-0000-0000-0000-000000000010') then
    raise exception 'RLS exposed another user saved addresses';
  end if;
  if exists (select 1 from public.list_my_user_addresses_v1()) then
    raise exception 'JWT-bound list returned another user saved addresses';
  end if;
end
$$;
commit;

-- Concurrent retries with the same client-generated row identity converge on
-- exactly one saved address.
create or replace function public.saved_address_test_create_concurrently()
returns table (address_id uuid, is_default boolean, idempotent boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config(
    'request.jwt.claim.sub', '46000000-0000-0000-0000-000000000020', true
  );
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  return query select * from public.create_my_user_address_v1(
    '46000000-0000-0000-0000-000000000301',
    'Home', '3 Concurrent Street', 'Brussels', '1000', 'BE', 50.84, 4.34, false
  );
end
$$;
revoke all on function public.saved_address_test_create_concurrently()
from public, anon, authenticated;
grant execute on function public.saved_address_test_create_concurrently() to service_role;

select extensions.dblink_connect_u('saved_address_1', current_setting('app.test_database_url'));
select extensions.dblink_connect_u('saved_address_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query(
  'saved_address_1', 'select * from public.saved_address_test_create_concurrently()'
);
select extensions.dblink_send_query(
  'saved_address_2', 'select * from public.saved_address_test_create_concurrently()'
);

create temporary table concurrent_saved_address_results (
  address_id uuid, is_default boolean, idempotent boolean
);
insert into concurrent_saved_address_results
select * from extensions.dblink_get_result('saved_address_1')
  as result(address_id uuid, is_default boolean, idempotent boolean);
insert into concurrent_saved_address_results
select * from extensions.dblink_get_result('saved_address_2')
  as result(address_id uuid, is_default boolean, idempotent boolean);

do $$
begin
  if (select count(*) from concurrent_saved_address_results) <> 2
     or (select count(distinct address_id) from concurrent_saved_address_results) <> 1
     or (select count(*) from concurrent_saved_address_results where idempotent) <> 1
     or (select count(*) from concurrent_saved_address_results where not idempotent) <> 1
     or (select count(*) from public.user_addresses
         where id = '46000000-0000-0000-0000-000000000301') <> 1 then
    raise exception 'Concurrent saved-address retries did not converge exactly once';
  end if;
end
$$;

select extensions.dblink_disconnect('saved_address_1');
select extensions.dblink_disconnect('saved_address_2');
drop function public.saved_address_test_create_concurrently();

delete from public.booking_notifications where pro_id::text like '46000000-%';
delete from public.targeted_booking_operations where client_id::text like '46000000-%';
delete from public.bookings where client_id::text like '46000000-%';
delete from public.user_addresses where user_id::text like '46000000-%';
delete from public.users where id::text like '46000000-%';
delete from auth.users where id::text like '46000000-%';

select 'saved addresses and booking snapshots tests passed' as result;
