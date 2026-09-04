\set ON_ERROR_STOP on

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  end if;
end
$$;

delete from public.reviews where reviewer_id::text like '20000000-%';
delete from public.messages where sender_id::text like '20000000-%';
delete from public.chats where client_id::text like '20000000-%' or pro_id::text like '20000000-%';
delete from public.missions where client_id::text like '20000000-%' or pro_id::text like '20000000-%';
delete from public.booking_notifications where pro_id::text like '20000000-%';
delete from public.bookings where client_id::text like '20000000-%';
delete from public.users where id::text like '20000000-%';
delete from auth.users where id::text like '20000000-%';

insert into auth.users (id, email, raw_user_meta_data) values
  ('20000000-0000-0000-0000-000000000010', 'functional-client@example.test',
   '{"requested_role":"client"}'::jsonb),
  ('20000000-0000-0000-0000-000000000020', 'functional-pro@example.test',
   '{"requested_role":"pro","username":"functional-pro","business_name":"Functional Pro"}'::jsonb),
  ('20000000-0000-0000-0000-000000000030', 'functional-outsider@example.test',
   '{"requested_role":"client"}'::jsonb),
  ('20000000-0000-0000-0000-000000000040', 'functional-pro-two@example.test',
   '{"requested_role":"pro","username":"functional-pro-two","business_name":"Functional Pro Two"}'::jsonb);

update public.users
set onboarding_completed = true, show_city = true, show_country = true
where id::text like '20000000-%';
update public.users
set first_name = 'Functional', last_name = 'Client',
    profile_photo = 'https://example.test/client-avatar.jpg'
where id = '20000000-0000-0000-0000-000000000010';
update public.users
set profile_photo = 'https://example.test/pro-avatar.jpg'
where id = '20000000-0000-0000-0000-000000000020';
update public.users
set latitude = 50.85,
    longitude = 4.35,
    radius_km = 25,
    business_type = array['Hair Stylist'],
    verification_status = 'verified',
    accepting_clients = true
where id in (
  '20000000-0000-0000-0000-000000000020',
  '20000000-0000-0000-0000-000000000040'
);

do $$
begin
  if (select role from public.users where id = '20000000-0000-0000-0000-000000000020') <> 'pro' then
    raise exception 'Pro signup metadata was not persisted by handle_new_user';
  end if;
end
$$;

update auth.users
set email = 'functional-client-updated@example.test'
where id = '20000000-0000-0000-0000-000000000010';

do $$
begin
  if (select email from public.users
      where id = '20000000-0000-0000-0000-000000000010')
     <> 'functional-client-updated@example.test' then
    raise exception 'Confirmed Auth email changes are not synchronized to the profile';
  end if;
end
$$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.bookings (
  id, client_id, service, date, time_slot, address, status
) values (
  '20000000-0000-0000-0000-000000000100',
  '20000000-0000-0000-0000-000000000010',
  'Functional booking', current_date + 1, '10:00', 'Test address', 'pending'
);

insert into public.booking_notifications (booking_id, pro_id) values
  ('20000000-0000-0000-0000-000000000100', '20000000-0000-0000-0000-000000000020'),
  ('20000000-0000-0000-0000-000000000100', '20000000-0000-0000-0000-000000000040');

do $$
begin
  if (select count(*) from public.find_matching_pro_ids(
      array['Hair Stylist'], 50.85, 4.35)) <> 2 then
    raise exception 'Server-side professional matching returned an unexpected result';
  end if;
  if (select count(*) from public.users
      where id = '20000000-0000-0000-0000-000000000020') <> 0 then
    raise exception 'An authenticated client could still read another raw users row';
  end if;
  if (select count(*) from public.get_user_summary(
      '20000000-0000-0000-0000-000000000020')) <> 1 then
    raise exception 'Safe professional summary is unavailable';
  end if;
end
$$;

do $$
begin
  begin
    insert into public.bookings (
      id, client_id, service, date, time_slot, address, status
    ) values (
      '20000000-0000-0000-0000-000000000101',
      '20000000-0000-0000-0000-000000000030',
      'Forged booking', current_date + 1, '10:00', 'Test address', 'pending'
    );
    raise exception 'A client created a booking for another account';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.users
    set verification_status = 'verified'
    where id = '20000000-0000-0000-0000-000000000010';
    raise exception 'A browser session changed its own trust status';
  exception when insufficient_privilege then null;
  end;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000030', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  if (select count(*) from public.get_user_summary(
      '20000000-0000-0000-0000-000000000010')) <> 0 then
    raise exception 'An unrelated user obtained a private client summary';
  end if;
  begin
    insert into public.booking_notifications (booking_id, pro_id) values (
      '20000000-0000-0000-0000-000000000100',
      '20000000-0000-0000-0000-000000000020'
    );
    raise exception 'An unrelated user created a booking notification';
  exception when insufficient_privilege then null;
  end;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.create_mission_proposal(
  '20000000-0000-0000-0000-000000000100', 50.00, 5.00,
  current_date + 1, '10:00'::time, 'Functional proposal'
)).id;
commit;

do $$
begin
  if (select count(*) from public.missions
      where booking_id = '20000000-0000-0000-0000-000000000100'
        and pro_id = '20000000-0000-0000-0000-000000000020') <> 1 then
    raise exception 'Proposal was not created exactly once';
  end if;
  if (select status from public.bookings
      where id = '20000000-0000-0000-0000-000000000100') <> 'offers' then
    raise exception 'Booking and proposal were not updated atomically';
  end if;
  if exists (select 1 from public.booking_notifications
             where booking_id = '20000000-0000-0000-0000-000000000100'
               and pro_id = '20000000-0000-0000-0000-000000000020') then
    raise exception 'Submitting professional notification was not removed';
  end if;
  if not exists (select 1 from public.booking_notifications
                 where booking_id = '20000000-0000-0000-0000-000000000100'
                   and pro_id = '20000000-0000-0000-0000-000000000040') then
    raise exception 'Other professionals should still be able to submit an offer';
  end if;
end
$$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    perform public.create_mission_proposal(
      '20000000-0000-0000-0000-000000000100', 50.00, 5.00,
      current_date + 1, '10:00'::time, 'Duplicate proposal'
    );
    raise exception 'The same professional submitted two proposals';
  exception when unique_violation or insufficient_privilege then null;
  end;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000040', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.create_mission_proposal(
  '20000000-0000-0000-0000-000000000100', 60.00, 0.00,
  current_date + 1, '11:00'::time, 'Competing proposal'
)).id;
commit;

select set_config(
  'app.test_first_offer_id',
  (select id::text from public.missions
   where booking_id = '20000000-0000-0000-0000-000000000100'
     and pro_id = '20000000-0000-0000-0000-000000000020'),
  false
);
select set_config(
  'app.test_second_offer_id',
  (select id::text from public.missions
   where booking_id = '20000000-0000-0000-0000-000000000100'
     and pro_id = '20000000-0000-0000-0000-000000000040'),
  false
);

select attempt_id from public.reserve_checkout_attempt(
  current_setting('app.test_first_offer_id')::uuid,
  '20000000-0000-0000-0000-000000000010', 1800
);

do $$
begin
  begin
    perform public.reserve_checkout_attempt(
      current_setting('app.test_second_offer_id')::uuid,
      '20000000-0000-0000-0000-000000000010', 1800
    );
    raise exception 'Two offers for one booking obtained active Checkout attempts';
  exception when unique_violation then null;
  end;

  if (select count(*) from public.checkout_attempts
      where booking_id = '20000000-0000-0000-0000-000000000100'
        and status in ('reserved', 'open')) <> 1 then
    raise exception 'Booking-level Checkout reservation is not unique';
  end if;
end
$$;

create temporary table functional_chat_ids (id uuid);
grant all on functional_chat_ids to authenticated;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into functional_chat_ids values
  (public.get_or_create_chat(null, '20000000-0000-0000-0000-000000000020')),
  (public.get_or_create_chat(null, '20000000-0000-0000-0000-000000000020'));
commit;

do $$
begin
  if (select count(distinct id) from functional_chat_ids) <> 1 then
    raise exception 'Repeated chat creation returned multiple conversations';
  end if;
end
$$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into public.messages (id, chat_id, sender_id, content) values (
  '20000000-0000-0000-0000-000000000200',
  (select id from functional_chat_ids limit 1),
  '20000000-0000-0000-0000-000000000020',
  'Original content'
);
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
declare
  v_chat_id uuid := (select id from functional_chat_ids limit 1);
begin
  if (select count(*) from public.get_my_chat_summaries(null)) <> 1 then
    raise exception 'Client chat summary is unavailable';
  end if;
  if (select partner_business_name from public.get_my_chat_summaries(v_chat_id))
      <> 'Functional Pro' then
    raise exception 'Client chat summary does not expose the professional display name';
  end if;
  if (select partner_profile_photo from public.get_my_chat_summaries(v_chat_id))
      <> 'https://example.test/pro-avatar.jpg' then
    raise exception 'Client chat summary does not expose the professional avatar';
  end if;
  if (select unread_count from public.get_my_chat_summaries(v_chat_id)) <> 1 then
    raise exception 'Client chat unread count is incorrect';
  end if;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
declare
  v_chat_id uuid := (select id from functional_chat_ids limit 1);
begin
  if (select partner_first_name from public.get_my_chat_summaries(v_chat_id))
      <> 'Functional' then
    raise exception 'Professional chat summary does not expose the client display name';
  end if;
  if (select partner_profile_photo from public.get_my_chat_summaries(v_chat_id))
      <> 'https://example.test/client-avatar.jpg' then
    raise exception 'Professional chat summary does not expose the client avatar';
  end if;
  if (select unread_count from public.get_my_chat_summaries(v_chat_id)) <> 0 then
    raise exception 'Sender chat summary has an unexpected unread message';
  end if;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000030', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  if (select count(*) from public.get_my_chat_summaries(null)) <> 0 then
    raise exception 'An unrelated user obtained chat summaries';
  end if;
end
$$;
commit;

do $$
declare
  v_chat_id uuid := (select id from functional_chat_ids limit 1);
begin
  if (select last_message from public.chats where id = v_chat_id) <> 'Original content' then
    raise exception 'Message insertion did not update the chat preview';
  end if;
end
$$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    update public.messages
    set content = 'Tampered content', read_at = now()
    where id = '20000000-0000-0000-0000-000000000200';
    raise exception 'A recipient edited the sender message';
  exception when insufficient_privilege then null;
  end;
end
$$;
update public.messages set read_at = now()
where id = '20000000-0000-0000-0000-000000000200';
commit;

do $$
begin
  if (select content from public.messages
      where id = '20000000-0000-0000-0000-000000000200') <> 'Original content' then
    raise exception 'Message content changed while being marked read';
  end if;
  if (select read_at from public.messages
      where id = '20000000-0000-0000-0000-000000000200') is null then
    raise exception 'Recipient could not mark a message as read';
  end if;
end
$$;

update public.missions set status = 'confirmed'
where id = current_setting('app.test_first_offer_id')::uuid;

do $$
begin
  if (select status from public.missions
      where id = current_setting('app.test_second_offer_id')::uuid) <> 'cancelled' then
    raise exception 'Confirming one offer did not cancel competing proposals';
  end if;
end
$$;

update public.missions set status = 'completed'
where id = current_setting('app.test_first_offer_id')::uuid;

select set_config(
  'app.test_mission_id',
  (select id::text from public.missions
   where booking_id = '20000000-0000-0000-0000-000000000100'
     and pro_id = '20000000-0000-0000-0000-000000000020'),
  false
);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into public.reviews (mission_id, reviewer_id, target_id, rating, comment)
select id,
       '20000000-0000-0000-0000-000000000020',
       '20000000-0000-0000-0000-000000000010', 5, 'Functional review'
from public.missions
where booking_id = '20000000-0000-0000-0000-000000000100'
  and pro_id = '20000000-0000-0000-0000-000000000020';
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000030', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    insert into public.reviews (mission_id, reviewer_id, target_id, rating) values (
      current_setting('app.test_mission_id')::uuid,
      '20000000-0000-0000-0000-000000000030',
      '20000000-0000-0000-0000-000000000010', 1
    );
    raise exception 'An unrelated user reviewed a mission';
  exception when insufficient_privilege then null;
  end;
end
$$;
commit;

set role anon;
do $$
begin
  if (select count(*) from public.get_public_profile(
      '20000000-0000-0000-0000-000000000020')) <> 1 then
    raise exception 'Anonymous public profile RPC is unavailable';
  end if;
  if (select count(*) from public.get_public_reviews(
      '20000000-0000-0000-0000-000000000010')) <> 1 then
    raise exception 'Anonymous public reviews RPC is unavailable';
  end if;
end
$$;
reset role;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bookings'
      and policyname in (
        'Allow insert for clients', 'Allow update for related users',
        'allow update for authenticated users', 'client_manage_own_bookings'
      )
  ) then
    raise exception 'A permissive historical booking policy remains active';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users'
      and policyname = 'Users can view public profiles'
  ) then
    raise exception 'The raw authenticated profile directory policy remains active';
  end if;
end
$$;

delete from public.reviews where reviewer_id::text like '20000000-%';
delete from public.messages where sender_id::text like '20000000-%';
delete from public.chats where client_id::text like '20000000-%' or pro_id::text like '20000000-%';
delete from public.missions where client_id::text like '20000000-%' or pro_id::text like '20000000-%';
delete from public.booking_notifications where pro_id::text like '20000000-%';
delete from public.bookings where client_id::text like '20000000-%';
delete from public.users where id::text like '20000000-%';
delete from auth.users where id::text like '20000000-%';

select 'functional flow tests passed' as result;
