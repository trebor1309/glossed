\set ON_ERROR_STOP on

select set_config('app.test_database_url', :'TEST_DATABASE_URL', false);

do $$
begin
  if has_table_privilege('authenticated', 'public.reviews', 'select')
     or has_table_privilege('authenticated', 'public.reviews', 'insert')
     or has_table_privilege('authenticated', 'public.review_submission_operations_v1', 'select')
     or has_table_privilege('anon', 'public.reviews', 'select') then
    raise exception 'Raw reputation storage is exposed to browser roles';
  end if;
  if not has_function_privilege(
       'authenticated', 'public.submit_review_v1(uuid,uuid,smallint,text)', 'execute'
     )
     or has_function_privilege(
       'anon', 'public.submit_review_v1(uuid,uuid,smallint,text)', 'execute'
     ) then
    raise exception 'Review submission RPC privileges are incorrect';
  end if;
  if not has_function_privilege(
       'anon', 'public.get_public_reviews(uuid,integer,timestamptz,uuid)', 'execute'
     )
     or not has_function_privilege(
       'anon', 'public.get_public_review_summary(uuid)', 'execute'
     ) then
    raise exception 'Public reputation projections are unavailable';
  end if;
end
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('41000000-0000-0000-0000-000000000010', 'reputation-client@example.test',
   '{"requested_role":"client","username":"reputation-client"}'::jsonb),
  ('41000000-0000-0000-0000-000000000020', 'reputation-provider@example.test',
   '{"requested_role":"pro","username":"reputation-provider","business_name":"Reputation Pro"}'::jsonb),
  ('41000000-0000-0000-0000-000000000030', 'reputation-outsider@example.test',
   '{"requested_role":"client","username":"reputation-outsider"}'::jsonb);

update public.users
set role = 'pro', active_role = 'pro', onboarding_completed = true,
    verification_status = 'verified', accepting_clients = true,
    business_type = array['Hair Stylist'],
    latitude = 50.8503, longitude = 4.3517, radius_km = 25,
    city = 'Brussels', country = 'BE', show_city = true, show_country = true
where id = '41000000-0000-0000-0000-000000000020';
update public.users set onboarding_completed = true
where id in (
  '41000000-0000-0000-0000-000000000010',
  '41000000-0000-0000-0000-000000000030'
);

insert into public.missions (
  id, client_id, pro_id, service, description, date, duration,
  price, status, paid_at
) values
  ('41000000-0000-0000-0000-000000000101',
   '41000000-0000-0000-0000-000000000010',
   '41000000-0000-0000-0000-000000000020',
   'Test service', 'Eligible legacy service one', now() - interval '7 days', null,
   50, 'completed', now() - interval '8 days'),
  ('41000000-0000-0000-0000-000000000102',
   '41000000-0000-0000-0000-000000000010',
   '41000000-0000-0000-0000-000000000020',
   'Test service', 'Eligible legacy service two', now() - interval '6 days', null,
   50, 'completed', now() - interval '7 days'),
  ('41000000-0000-0000-0000-000000000103',
   '41000000-0000-0000-0000-000000000010',
   '41000000-0000-0000-0000-000000000020',
   'Test service', 'Eligible legacy service three', now() - interval '5 days', null,
   50, 'completed', now() - interval '6 days'),
  ('41000000-0000-0000-0000-000000000104',
   '41000000-0000-0000-0000-000000000010',
   '41000000-0000-0000-0000-000000000020',
   'Test service', 'Explicit partially performed service', now() - interval '4 days', null,
   50, 'confirmed', now() - interval '5 days'),
  ('41000000-0000-0000-0000-000000000105',
   '41000000-0000-0000-0000-000000000010',
   '41000000-0000-0000-0000-000000000020',
   'Test service', 'Explicit non-performed service', now() - interval '3 days', null,
   50, 'cancelled', now() - interval '4 days'),
  ('41000000-0000-0000-0000-000000000106',
   '41000000-0000-0000-0000-000000000010',
   '41000000-0000-0000-0000-000000000020',
   'Test service', 'Concurrent eligible service', now() - interval '2 days', null,
   50, 'completed', now() - interval '3 days');

insert into public.service_delivery_outcomes_v1 (
  mission_id, outcome, source, recorded_by_actor_type, reason
) values
  ('41000000-0000-0000-0000-000000000104', 'partially_performed',
   'explicit_resolution', 'system', 'Test-only explicit partial performance outcome.'),
  ('41000000-0000-0000-0000-000000000105', 'not_performed',
   'explicit_resolution', 'system', 'Test-only explicit non-performance outcome.');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temporary table first_review_result as
select * from public.submit_review_v1(
  '41000000-0000-0000-0000-000000000201',
  '41000000-0000-0000-0000-000000000101',
  5::smallint,
  '  Great verified service  '
);

do $$
begin
  if (select count(*) from first_review_result) <> 1
     or (select idempotent from first_review_result)
     or (select comment from first_review_result) <> 'Great verified service'
     or not (select verified_glossed_service from first_review_result) then
    raise exception 'Initial verified review submission is incorrect';
  end if;
end
$$;
commit;

do $$
begin
  if (select count(*) from public.notifications
      where event_type = 'review_received'
        and recipient_id = '41000000-0000-0000-0000-000000000020'
        and source_table = 'reviews'
        and entity_type = 'review') <> 1
     or not exists (
       select 1 from public.notifications
       where event_type = 'review_received'
         and metadata ->> 'path' =
           '/profile/41000000-0000-0000-0000-000000000020'
     ) then
    raise exception 'Published review did not create the provider notification';
  end if;
end
$$;

-- A completed replay is resolved before current mission eligibility. The
-- canonical trimmed payload remains identical.
update public.missions set status = 'cancelled'
where id = '41000000-0000-0000-0000-000000000101';

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
declare v_result record;
begin
  select * into v_result from public.submit_review_v1(
    '41000000-0000-0000-0000-000000000201',
    '41000000-0000-0000-0000-000000000101',
    5::smallint,
    'Great verified service'
  );
  if not v_result.idempotent
     or v_result.review_id <> (select review_id from first_review_result) then
    raise exception 'Completed review replay did not return the retained review';
  end if;
  begin
    perform * from public.submit_review_v1(
      '41000000-0000-0000-0000-000000000201',
      '41000000-0000-0000-0000-000000000101',
      4::smallint,
      'Great verified service'
    );
    raise exception 'Changed payload reused a completed operation_id';
  exception when unique_violation then null;
  end;

  begin
    perform * from public.submit_review_v1(
      '41000000-0000-0000-0000-000000000202',
      '41000000-0000-0000-0000-000000000101',
      5::smallint,
      'A new operation after cancellation'
    );
    raise exception 'A new review operation ignored current ineligibility';
  exception when check_violation then null;
  end;

  begin
    perform * from public.submit_review_v1(
      '41000000-0000-0000-0000-000000000203',
      '41000000-0000-0000-0000-000000000105',
      1::smallint,
      'No service happened'
    );
    raise exception 'A non-performed outcome was reviewable';
  exception when check_violation then null;
  end;

  begin
    perform * from public.submit_review_v1(
      '41000000-0000-0000-0000-000000000204',
      '41000000-0000-0000-0000-000000000102',
      5::smallint,
      repeat('x', 2001)
    );
    raise exception 'An oversized review comment was accepted';
  exception when invalid_parameter_value then null;
  end;
end
$$;

select * from public.submit_review_v1(
  '41000000-0000-0000-0000-000000000205',
  '41000000-0000-0000-0000-000000000102',
  4::smallint,
  null
);
select * from public.submit_review_v1(
  '41000000-0000-0000-0000-000000000206',
  '41000000-0000-0000-0000-000000000103',
  3::smallint,
  'Third review'
);
select * from public.submit_review_v1(
  '41000000-0000-0000-0000-000000000207',
  '41000000-0000-0000-0000-000000000104',
  2::smallint,
  'Partially performed but explicitly established'
);
commit;

do $$
begin
  if (select count(*) from public.notifications
      where event_type = 'review_received'
        and source_id = (select review_id::text from first_review_result)) <> 1 then
    raise exception 'Review replay duplicated the provider notification';
  end if;
end
$$;

-- Provider and unrelated users can never author the public provider review.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    perform * from public.submit_review_v1(
      '41000000-0000-0000-0000-000000000208',
      '41000000-0000-0000-0000-000000000102',
      5::smallint,
      'Provider-to-client review'
    );
    raise exception 'Provider submitted a public client review';
  exception when insufficient_privilege then null;
  end;
end
$$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000030', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    perform * from public.submit_review_v1(
      '41000000-0000-0000-0000-000000000209',
      '41000000-0000-0000-0000-000000000102',
      5::smallint,
      'Unrelated review'
    );
    raise exception 'Unrelated user submitted a review';
  exception when insufficient_privilege then null;
  end;
end
$$;
rollback;

-- Public projection is keyset-paginated and never exposes mission/party IDs.
set role anon;
create temporary table public_review_page_one as
select * from public.get_public_reviews(
  '41000000-0000-0000-0000-000000000020', 2, null, null
);
do $$
declare v_cursor record;
begin
  if (select count(*) from public_review_page_one) <> 2 then
    raise exception 'First public review page has the wrong size';
  end if;
  if exists (
    select 1 from public_review_page_one row
    where to_jsonb(row) ?| array['mission_id', 'reviewer_id', 'target_id']
  ) then
    raise exception 'Public review projection exposes a private identifier';
  end if;
  select created_at, id into v_cursor
  from public_review_page_one order by created_at, id limit 1;
  if (select count(*) from public.get_public_reviews(
       '41000000-0000-0000-0000-000000000020', 2,
       v_cursor.created_at, v_cursor.id
     )) <> 2 then
    raise exception 'Second public review page has the wrong size';
  end if;
  if not exists (
    select 1 from public.get_public_review_summary(
      '41000000-0000-0000-0000-000000000020'
    ) where average_rating = 3.5 and review_count = 4
  ) then
    raise exception 'Published review aggregate is incorrect';
  end if;
end
$$;
reset role;

-- Hidden rows remain retained but are excluded from both public projection and
-- aggregate. Direct hard deletion remains forbidden.
select set_config('app.review_moderation_v1_mutation', 'on', false);
update public.reviews set status = 'hidden', status_changed_at = clock_timestamp()
where mission_id = '41000000-0000-0000-0000-000000000104';
select set_config('app.review_moderation_v1_mutation', 'off', false);

do $$
begin
  if not exists (
    select 1 from public.get_public_review_summary(
      '41000000-0000-0000-0000-000000000020'
    ) where average_rating = 4.0 and review_count = 3
  ) then
    raise exception 'Hidden review affected the public aggregate';
  end if;
  begin
    delete from public.reviews
    where mission_id = '41000000-0000-0000-0000-000000000104';
    raise exception 'A review was physically deleted without maintenance mode';
  exception when insufficient_privilege then null;
  end;
end
$$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
declare v_result jsonb;
begin
  select to_jsonb(result) into v_result
  from public.search_provider_profiles(
    'hair_stylist', 50.8503, 4.3517, 20, 1, 20
  ) result
  where result.provider_id = '41000000-0000-0000-0000-000000000020';

  if v_result is null
     or (v_result ->> 'average_rating')::numeric <> 4.0
     or (v_result ->> 'review_count')::bigint <> 3 then
    raise exception 'Discovery did not reuse the published public reputation aggregate';
  end if;
  if v_result ?| array[
    'mission_id', 'reviewer_id', 'target_id', 'latitude', 'longitude',
    'address', 'business_address'
  ] then
    raise exception 'Discovery reputation result exposed private data';
  end if;
end
$$;
commit;

-- Concurrent retries with the same operation identity converge on one review.
create or replace function public.reputation_test_submit_concurrently()
returns table (
  review_id uuid, rating smallint, comment text, status text,
  created_at timestamptz, verified_glossed_service boolean, idempotent boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000010', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  return query select * from public.submit_review_v1(
    '41000000-0000-0000-0000-000000000210',
    '41000000-0000-0000-0000-000000000106',
    5::smallint,
    'Concurrent review'
  );
end
$$;
revoke all on function public.reputation_test_submit_concurrently()
from public, anon, authenticated;
grant execute on function public.reputation_test_submit_concurrently() to service_role;

select extensions.dblink_connect_u('reputation_1', current_setting('app.test_database_url'));
select extensions.dblink_connect_u('reputation_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('reputation_1',
  'select * from public.reputation_test_submit_concurrently()');
select extensions.dblink_send_query('reputation_2',
  'select * from public.reputation_test_submit_concurrently()');

create temporary table concurrent_review_results (
  review_id uuid, rating smallint, comment text, status text,
  created_at timestamptz, verified_glossed_service boolean, idempotent boolean
);
insert into concurrent_review_results
select * from extensions.dblink_get_result('reputation_1') as result(
  review_id uuid, rating smallint, comment text, status text,
  created_at timestamptz, verified_glossed_service boolean, idempotent boolean
);
insert into concurrent_review_results
select * from extensions.dblink_get_result('reputation_2') as result(
  review_id uuid, rating smallint, comment text, status text,
  created_at timestamptz, verified_glossed_service boolean, idempotent boolean
);

do $$
begin
  if (select count(*) from concurrent_review_results) <> 2
     or (select count(distinct review_id) from concurrent_review_results) <> 1
     or (select count(*) from concurrent_review_results where idempotent) <> 1
     or (select count(*) from concurrent_review_results where not idempotent) <> 1
     or (select count(*) from public.reviews
         where mission_id = '41000000-0000-0000-0000-000000000106') <> 1 then
    raise exception 'Concurrent review retries did not converge idempotently';
  end if;
end
$$;

select extensions.dblink_disconnect('reputation_1');
select extensions.dblink_disconnect('reputation_2');
drop function public.reputation_test_submit_concurrently();

select set_config('app.review_maintenance_v1', 'on', false);
delete from public.review_status_events_v1 where review_id in (
  select id from public.reviews where reviewer_id::text like '41000000-%'
);
delete from public.review_submission_operations_v1
where client_id::text like '41000000-%';
delete from public.reviews where reviewer_id::text like '41000000-%';
select set_config('app.review_maintenance_v1', 'off', false);
delete from public.service_delivery_outcomes_v1
where mission_id::text like '41000000-%';
delete from public.missions where id::text like '41000000-%';
delete from public.users where id::text like '41000000-%';
delete from auth.users where id::text like '41000000-%';

select 'reputation trust foundation tests passed' as result;
