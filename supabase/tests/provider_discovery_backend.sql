\set ON_ERROR_STOP on

select set_config('app.test_database_url', :'TEST_DATABASE_URL', false);

delete from public.targeted_booking_operations where client_id::text like '39000000-%';
delete from public.notifications where recipient_id::text like '39000000-%';
delete from public.booking_notifications where pro_id::text like '39000000-%';
delete from public.bookings where client_id::text like '39000000-%';
delete from public.users where id::text like '39000000-%';
delete from auth.users where id::text like '39000000-%';

insert into auth.users (id, email, raw_user_meta_data) values
  ('39000000-0000-0000-0000-000000000010', 'discovery-client@example.test',
   '{"requested_role":"client"}'::jsonb),
  ('39000000-0000-0000-0000-000000000020', 'discovery-paused@example.test',
   '{"requested_role":"pro","business_name":"Paused Pro"}'::jsonb),
  ('39000000-0000-0000-0000-000000000030', 'discovery-primary@example.test',
   '{"requested_role":"pro","business_name":"Primary Pro"}'::jsonb),
  ('39000000-0000-0000-0000-000000000040', 'discovery-unverified@example.test',
   '{"requested_role":"pro","business_name":"Unverified Pro"}'::jsonb),
  ('39000000-0000-0000-0000-000000000050', 'discovery-far@example.test',
   '{"requested_role":"pro","business_name":"Far Pro"}'::jsonb),
  ('39000000-0000-0000-0000-000000000060', 'discovery-secondary@example.test',
   '{"requested_role":"pro","business_name":"Secondary Pro"}'::jsonb),
  ('39000000-0000-0000-0000-000000000070', 'discovery-small-radius@example.test',
   '{"requested_role":"pro","business_name":"Small Radius Pro"}'::jsonb),
  ('39000000-0000-0000-0000-000000000080', 'discovery-hidden@example.test',
   '{"requested_role":"pro","business_name":"Hidden Pro"}'::jsonb);

update public.users
set onboarding_completed = true,
    verification_status = 'verified',
    accepting_clients = true,
    business_type = array['Hair Stylist'],
    latitude = 50.8503,
    longitude = 4.3517,
    radius_km = 30,
    city = 'Brussels',
    country = 'BE',
    show_city = true,
    show_country = true,
    show_working_radius = true
where id::text like '39000000-%'
  and role = 'pro';

update public.users set accepting_clients = false
where id = '39000000-0000-0000-0000-000000000020';
update public.users set verification_status = 'unverified'
where id = '39000000-0000-0000-0000-000000000040';
update public.users set latitude = 51.5000, longitude = 4.3517, radius_km = 100
where id = '39000000-0000-0000-0000-000000000050';
update public.users set latitude = 50.8540, longitude = 4.3517
where id = '39000000-0000-0000-0000-000000000060';
update public.users set latitude = 50.9400, longitude = 4.3517, radius_km = 2
where id = '39000000-0000-0000-0000-000000000070';
update public.users set onboarding_completed = false
where id = '39000000-0000-0000-0000-000000000080';

-- Simulate a successfully completed operation whose originally valid requested
-- date has since passed. A replay must return its immutable result before
-- applying validations that are only relevant to a new operation.
insert into public.bookings (
  id, client_id, pro_id, service, date, time_slot, address, notes,
  client_lat, client_lng, status
) values (
  '39000000-0000-0000-0000-000000000910',
  '39000000-0000-0000-0000-000000000010',
  '39000000-0000-0000-0000-000000000060',
  'Hair Stylist', current_date - 1, '09:00',
  'Historical private address', 'Historical replay',
  50.8503, 4.3517, 'pending'
);

insert into public.booking_notifications (id, booking_id, pro_id)
values (
  '39000000-0000-0000-0000-000000000911',
  '39000000-0000-0000-0000-000000000910',
  '39000000-0000-0000-0000-000000000060'
);

insert into public.targeted_booking_operations (
  client_id, operation_id, provider_id, request_fingerprint,
  booking_id, notification_id, created_at, completed_at
) values (
  '39000000-0000-0000-0000-000000000010',
  '39000000-0000-0000-0000-000000000110',
  '39000000-0000-0000-0000-000000000060',
  encode(sha256(convert_to(jsonb_build_object(
    'provider_id', '39000000-0000-0000-0000-000000000060'::uuid,
    'service_codes', array['hair_stylist']::text[],
    'date', current_date - 1,
    'time_slot', '09:00',
    'address', 'Historical private address',
    'notes', 'Historical replay',
    'client_latitude', 50.8503::double precision,
    'client_longitude', 4.3517::double precision
  )::text, 'UTF8')), 'hex'),
  '39000000-0000-0000-0000-000000000910',
  '39000000-0000-0000-0000-000000000911',
  clock_timestamp() - interval '2 days',
  clock_timestamp() - interval '2 days'
);

do $$
begin
  if (select count(*) from public.service_categories) <> 9 then
    raise exception 'Canonical service taxonomy was not seeded';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_categories'
      and column_name in ('price', 'duration', 'base_rate')
  ) then
    raise exception 'Taxonomy unexpectedly contains commercial price or duration';
  end if;
  if not exists (
    select 1 from public.provider_service_categories
    where provider_id = '39000000-0000-0000-0000-000000000030'
      and service_code = 'hair_stylist'
      and source = 'legacy_business_type'
  ) then
    raise exception 'Legacy business_type was not synchronized to the canonical taxonomy';
  end if;
  if (select count(*) from public.provider_discovery_locations
      where provider_id::text like '39000000-%') <> 7 then
    raise exception 'Valid provider coordinates were not synchronized to private geography';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'provider_discovery_locations_location_gist'
      and indexdef ilike '%using gist%'
  ) then
    raise exception 'Provider geography GiST index is missing';
  end if;
  if not public.is_provider_profile_visible('39000000-0000-0000-0000-000000000020') then
    raise exception 'Paused professional should retain public profile visibility';
  end if;
  if public.is_provider_discoverable('39000000-0000-0000-0000-000000000020') then
    raise exception 'Paused professional remained discoverable';
  end if;
end
$$;

begin;
set local role anon;
do $$
declare
  v_profile record;
begin
  select * into v_profile
  from public.get_public_profile('39000000-0000-0000-0000-000000000020');

  if not found then
    raise exception 'Paused professional public profile disappeared';
  end if;
  if v_profile.latitude is not null or v_profile.longitude is not null then
    raise exception 'Public profile exposed exact provider coordinates';
  end if;
  if (select count(*) from public.get_public_profile(
      '39000000-0000-0000-0000-000000000080')) <> 0 then
    raise exception 'Non-visible professional profile was publicly exposed';
  end if;

  begin
    perform public.is_provider_discoverable(
      '39000000-0000-0000-0000-000000000030');
    raise exception 'Private discoverability predicate was executable by anon';
  exception when insufficient_privilege then null;
  end;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '39000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temporary table historical_replay_result as
select * from public.create_targeted_booking_request(
  '39000000-0000-0000-0000-000000000110',
  '39000000-0000-0000-0000-000000000060',
  array['hair_stylist'], current_date - 1, '09:00',
  'Historical private address', 'Historical replay', 50.8503, 4.3517
);

do $$
declare
  v_result jsonb;
begin
  if not (select idempotent from historical_replay_result)
     or (select booking_id from historical_replay_result)
        <> '39000000-0000-0000-0000-000000000910'
     or (select notification_id from historical_replay_result)
        <> '39000000-0000-0000-0000-000000000911' then
    raise exception 'Completed historical operation did not replay its original result';
  end if;

  begin
    perform * from public.create_targeted_booking_request(
      '39000000-0000-0000-0000-000000000111',
      '39000000-0000-0000-0000-000000000060',
      array['hair_stylist'], current_date - 1, '09:00',
      'Historical private address', 'New past request', 50.8503, 4.3517
    );
    raise exception 'A new targeted request accepted a past date';
  exception when invalid_parameter_value then null;
  end;

  if (select count(*) from public.list_service_categories()) <> 9 then
    raise exception 'Authenticated client cannot load the canonical taxonomy';
  end if;

  if (select count(*) from public.search_provider_profiles(
      'hair_stylist', 50.8503, 4.3517, 20, 1, 20)) <> 2 then
    raise exception 'Discovery did not apply visibility, availability and both radii';
  end if;
  if exists (
    select 1 from public.search_provider_profiles(
      'hair_stylist', 50.8503, 4.3517, 20, 1, 20) result
    where result.provider_id in (
      '39000000-0000-0000-0000-000000000020',
      '39000000-0000-0000-0000-000000000040',
      '39000000-0000-0000-0000-000000000050',
      '39000000-0000-0000-0000-000000000070',
      '39000000-0000-0000-0000-000000000080'
    )
  ) then
    raise exception 'An unavailable, unverified, hidden or out-of-radius provider was discoverable';
  end if;

  select to_jsonb(result) into v_result
  from public.search_provider_profiles(
    'hair_stylist', 50.8503, 4.3517, 20, 1, 1) result;
  if v_result ?| array['latitude', 'longitude', 'location', 'address', 'business_address'] then
    raise exception 'Discovery result exposed a private location field';
  end if;
  if (v_result ->> 'distance_km')::numeric <> round((v_result ->> 'distance_km')::numeric, 1) then
    raise exception 'Discovery distance is not rounded';
  end if;
  if (v_result ->> 'total_count')::bigint <> 2 then
    raise exception 'Discovery pagination did not preserve total count';
  end if;
  if (select count(distinct provider_id) from (
      select provider_id from public.search_provider_profiles(
        'hair_stylist', 50.8503, 4.3517, 20, 1, 1)
      union all
      select provider_id from public.search_provider_profiles(
        'hair_stylist', 50.8503, 4.3517, 20, 2, 1)
    ) pages) <> 2 then
    raise exception 'Discovery pages are not deterministic and distinct';
  end if;

  begin
    perform * from public.search_provider_profiles(
      'hair_stylist', 50.8503, 4.3517, 500, 1, 20);
    raise exception 'Oversized search radius was accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform count(*) from public.provider_discovery_locations;
    raise exception 'Authenticated client read private provider geography';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.bookings (
      id, client_id, pro_id, service, date, time_slot, address, status
    ) values (
      '39000000-0000-0000-0000-000000000900',
      '39000000-0000-0000-0000-000000000010',
      '39000000-0000-0000-0000-000000000020',
      'Hair Stylist', current_date + 5, '10:00', 'Private address', 'pending'
    );
    raise exception 'Direct table insert targeted a paused professional';
  exception when insufficient_privilege then null;
  end;
end
$$;

create temporary table first_targeted_result as
select * from public.create_targeted_booking_request(
  '39000000-0000-0000-0000-000000000100',
  '39000000-0000-0000-0000-000000000030',
  array['hair_stylist'], current_date + 5, '10:00',
  'Private client address', 'Personalized request', 50.8503, 4.3517
);

create temporary table replayed_targeted_result as
select * from public.create_targeted_booking_request(
  '39000000-0000-0000-0000-000000000100',
  '39000000-0000-0000-0000-000000000030',
  array['hair_stylist'], current_date + 5, '10:00',
  'Private client address', 'Personalized request', 50.8503, 4.3517
);

do $$
begin
  if (select idempotent from first_targeted_result) then
    raise exception 'Initial targeted request was incorrectly marked as replayed';
  end if;
  if not (select idempotent from replayed_targeted_result) then
    raise exception 'Targeted request retry was not marked idempotent';
  end if;
  if (select booking_id from first_targeted_result)
     is distinct from (select booking_id from replayed_targeted_result) then
    raise exception 'Targeted request retry returned a different booking';
  end if;
  if (select count(*) from public.bookings
      where client_id = '39000000-0000-0000-0000-000000000010'
        and pro_id = '39000000-0000-0000-0000-000000000030') <> 1 then
    raise exception 'Targeted request retry created duplicate bookings';
  end if;
  if (select client_id from public.bookings
      where id = (select booking_id from first_targeted_result))
     <> '39000000-0000-0000-0000-000000000010' then
    raise exception 'Targeted booking identity did not come from the JWT';
  end if;

  begin
    perform * from public.create_targeted_booking_request(
      '39000000-0000-0000-0000-000000000100',
      '39000000-0000-0000-0000-000000000030',
      array['hair_stylist'], current_date + 5, '11:00',
      'Private client address', 'Changed payload', 50.8503, 4.3517
    );
    raise exception 'Operation identity was reused with a different payload';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform * from public.create_targeted_booking_request(
      '39000000-0000-0000-0000-000000000102',
      '39000000-0000-0000-0000-000000000020',
      array['hair_stylist'], current_date + 5, '10:00',
      'Private client address', null, 50.8503, 4.3517
    );
    raise exception 'Paused professional accepted a targeted request';
  exception when object_not_in_prerequisite_state then null;
  end;

  begin
    perform * from public.create_targeted_booking_request(
      '39000000-0000-0000-0000-000000000103',
      '39000000-0000-0000-0000-000000000030',
      array['hair_stylist'], current_date + 5, '10:00',
      'Outside service area', null, 51.5000, 4.3517
    );
    raise exception 'Targeted request outside provider radius was accepted';
  exception when invalid_parameter_value then null;
  end;
end
$$;
commit;

do $$
begin
  if (select count(*) from public.booking_notifications bn
      join first_targeted_result r on r.notification_id = bn.id) <> 1 then
    raise exception 'Targeted request did not create exactly one invitation';
  end if;
  if (select count(*) from public.notifications n
      where n.recipient_id = '39000000-0000-0000-0000-000000000030'
        and n.event_type = 'booking_request') <> 1 then
    raise exception 'Targeted request did not produce exactly one provider notification';
  end if;
end
$$;

-- Concurrent calls with the same stable operation identity must converge on
-- one committed booking and one invitation.
create or replace function public.discovery_test_create_targeted()
returns table (booking_id uuid, notification_id uuid, idempotent boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('request.jwt.claim.sub', '39000000-0000-0000-0000-000000000010', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  return query
  select * from public.create_targeted_booking_request(
    '39000000-0000-0000-0000-000000000101',
    '39000000-0000-0000-0000-000000000030',
    array['hair_stylist'], current_date + 6, '14:00',
    'Concurrent private address', 'Concurrent retry', 50.8503, 4.3517
  );
end
$$;
revoke all on function public.discovery_test_create_targeted() from public, anon, authenticated;
grant execute on function public.discovery_test_create_targeted() to service_role;

select extensions.dblink_connect_u('discovery_1', current_setting('app.test_database_url'));
select extensions.dblink_connect_u('discovery_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('discovery_1',
  'select * from public.discovery_test_create_targeted()');
select extensions.dblink_send_query('discovery_2',
  'select * from public.discovery_test_create_targeted()');

create temporary table concurrent_targeted_results (
  booking_id uuid, notification_id uuid, idempotent boolean
);
insert into concurrent_targeted_results
select * from extensions.dblink_get_result('discovery_1')
  as result(booking_id uuid, notification_id uuid, idempotent boolean);
insert into concurrent_targeted_results
select * from extensions.dblink_get_result('discovery_2')
  as result(booking_id uuid, notification_id uuid, idempotent boolean);

do $$
begin
  if (select count(*) from concurrent_targeted_results) <> 2
     or (select count(distinct booking_id) from concurrent_targeted_results) <> 1
     or (select count(distinct notification_id) from concurrent_targeted_results) <> 1
     or (select count(*) from concurrent_targeted_results where not idempotent) <> 1
     or (select count(*) from concurrent_targeted_results where idempotent) <> 1 then
    raise exception 'Concurrent targeted retries did not converge idempotently';
  end if;
  if (select count(*) from public.bookings
      where id = (select booking_id from concurrent_targeted_results limit 1)) <> 1 then
    raise exception 'Concurrent targeted retries did not create exactly one booking';
  end if;
  if (select count(*) from public.booking_notifications
      where id = (select notification_id from concurrent_targeted_results limit 1)) <> 1 then
    raise exception 'Concurrent targeted retries did not create exactly one invitation';
  end if;
end
$$;

select extensions.dblink_disconnect('discovery_1');
select extensions.dblink_disconnect('discovery_2');
drop function public.discovery_test_create_targeted();

delete from public.targeted_booking_operations where client_id::text like '39000000-%';
delete from public.notifications where recipient_id::text like '39000000-%';
delete from public.booking_notifications where pro_id::text like '39000000-%';
delete from public.bookings where client_id::text like '39000000-%';
delete from public.users where id::text like '39000000-%';
delete from auth.users where id::text like '39000000-%';

select 'provider discovery backend tests passed' as result;
