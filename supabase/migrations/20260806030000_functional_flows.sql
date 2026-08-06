-- Stabilize authentication, booking proposals, chat, reviews and public profiles.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := case
    when new.raw_user_meta_data ->> 'requested_role' = 'pro' then 'pro'
    else 'client'
  end;
begin
  insert into public.users (
    id, email, role, active_role, theme, username, business_name
  ) values (
    new.id,
    new.email,
    v_role,
    v_role,
    'light',
    nullif(lower(trim(new.raw_user_meta_data ->> 'username')), ''),
    nullif(trim(new.raw_user_meta_data ->> 'business_name'), '')
  );
  return new;
end
$$;

-- Historical policies were OR-ed together by PostgreSQL. Remove all broad
-- variants before recreating a single policy for each operation.
drop policy if exists "Allow insert for clients" on public.bookings;
drop policy if exists "client can create bookings" on public.bookings;
drop policy if exists "Allow update for related users" on public.bookings;
drop policy if exists "allow update for authenticated users" on public.bookings;
drop policy if exists "client_manage_own_bookings" on public.bookings;
drop policy if exists "Allow select for related users" on public.bookings;
drop policy if exists "client can view own bookings" on public.bookings;
drop policy if exists "pro can read bookings from notifications" on public.bookings;
drop policy if exists "pro can view assigned bookings" on public.bookings;
drop policy if exists "pro_view_assigned_bookings" on public.bookings;
drop policy if exists "pros can read related bookings" on public.bookings;

create policy "bookings_insert_own_pending"
on public.bookings for insert to authenticated
with check (auth.uid() = client_id and status = 'pending');

create policy "bookings_select_related"
on public.bookings for select to authenticated
using (
  auth.uid() = client_id
  or auth.uid() = pro_id
  or exists (
    select 1
    from public.booking_notifications bn
    where bn.booking_id = bookings.id and bn.pro_id = auth.uid()
  )
);

create policy "bookings_update_own_pending"
on public.bookings for update to authenticated
using (auth.uid() = client_id and status = 'pending')
with check (auth.uid() = client_id and status = 'pending');

create policy "bookings_delete_own_pending"
on public.bookings for delete to authenticated
using (
  auth.uid() = client_id
  and status = 'pending'
  and not exists (select 1 from public.missions m where m.booking_id = bookings.id)
);

create or replace function public.protect_booking_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated'
     and current_setting('app.trusted_booking_update', true) is distinct from 'on'
     and (
       new.client_id is distinct from old.client_id
       or new.pro_id is distinct from old.pro_id
       or new.status is distinct from old.status
       or new.price is distinct from old.price
       or new.currency is distinct from old.currency
     ) then
    raise exception 'Booking ownership and workflow fields are server-managed'
      using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists protect_booking_fields on public.bookings;
create trigger protect_booking_fields
before update on public.bookings
for each row execute function public.protect_booking_fields();

drop policy if exists "Allow insert for all authenticated users" on public.booking_notifications;
drop policy if exists "allow insert for authenticated" on public.booking_notifications;

create or replace function public.is_onboarded_pro(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users u
    where u.id = p_user_id and u.role = 'pro' and u.onboarding_completed = true
  )
$$;

revoke all on function public.is_onboarded_pro(uuid) from public, anon;
grant execute on function public.is_onboarded_pro(uuid) to authenticated;

create policy "booking_notifications_insert_for_own_booking"
on public.booking_notifications for insert to authenticated
with check (
  exists (
    select 1 from public.bookings b
    where b.id = booking_id and b.client_id = auth.uid() and b.status = 'pending'
  )
  and public.is_onboarded_pro(pro_id)
);

do $$
begin
  if exists (
    select 1 from public.booking_notifications
    group by booking_id, pro_id having count(*) > 1
  ) then
    raise exception 'Duplicate booking notifications must be reconciled first';
  end if;
end
$$;

create unique index if not exists booking_notifications_booking_pro_uidx
on public.booking_notifications (booking_id, pro_id);

do $$
begin
  if exists (
    select 1 from public.missions
    where booking_id is not null
    group by booking_id, pro_id having count(*) > 1
  ) then
    raise exception 'Duplicate proposals must be reconciled first';
  end if;
end
$$;

create unique index if not exists missions_booking_pro_uidx
on public.missions (booking_id, pro_id)
where booking_id is not null;

drop policy if exists "Pros can create assigned proposals" on public.missions;
drop policy if exists "Allow insert for pros" on public.missions;
drop policy if exists "allow insert for authenticated" on public.missions;

create or replace function public.create_mission_proposal(
  p_booking_id uuid,
  p_service_price numeric,
  p_travel_fee numeric,
  p_date date,
  p_time time,
  p_note text default null
)
returns public.missions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_mission public.missions%rowtype;
  v_total numeric;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_service_price is null or p_service_price <= 0
     or p_travel_fee is null or p_travel_fee < 0
     or p_service_price <> round(p_service_price, 2)
     or p_travel_fee <> round(p_travel_fee, 2) then
    raise exception 'Proposal amounts must be non-negative values with at most two decimals'
      using errcode = '22023';
  end if;
  v_total := p_service_price + p_travel_fee;
  if v_total > 1000000 then
    raise exception 'Proposal amount is too large' using errcode = '22023';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if v_booking.status not in ('pending', 'offers') then
    raise exception 'Booking no longer accepts proposals' using errcode = '55000';
  end if;
  if not exists (select 1 from public.users u where u.id = v_uid and u.role = 'pro') then
    raise exception 'Only professionals can create proposals' using errcode = '42501';
  end if;
  if v_booking.pro_id is distinct from v_uid
     and not exists (
       select 1 from public.booking_notifications bn
       where bn.booking_id = v_booking.id and bn.pro_id = v_uid
     ) then
    raise exception 'This booking is not assigned to this professional'
      using errcode = '42501';
  end if;

  insert into public.missions (
    client_id, pro_id, service, description, date, time, duration,
    service_price, travel_fee, price, total_price, status, booking_id
  ) values (
    v_booking.client_id, v_uid, v_booking.service,
    coalesce(nullif(trim(p_note), ''), v_booking.notes),
    p_date, p_time, 60, p_service_price, p_travel_fee,
    v_total, v_total, 'proposed', v_booking.id
  )
  returning * into v_mission;

  perform set_config('app.trusted_booking_update', 'on', true);
  update public.bookings set status = 'offers', updated_at = now()
  where id = v_booking.id;
  perform set_config('app.trusted_booking_update', 'off', true);

  delete from public.booking_notifications
  where booking_id = v_booking.id and pro_id = v_uid;

  return v_mission;
exception
  when unique_violation then
    raise exception 'A proposal already exists for this booking and professional'
      using errcode = '23505';
end
$$;

revoke all on function public.create_mission_proposal(uuid, numeric, numeric, date, time, text)
from public, anon;
grant execute on function public.create_mission_proposal(uuid, numeric, numeric, date, time, text)
to authenticated;

-- Checkout concurrency also applies across different offers for one booking,
-- not only repeated calls for the same mission.
alter table public.checkout_attempts
add column if not exists booking_id uuid references public.bookings(id) on delete restrict;

update public.checkout_attempts ca
set booking_id = m.booking_id
from public.missions m
where m.id = ca.mission_id and ca.booking_id is null and m.booking_id is not null;

update public.checkout_attempts
set status = 'expired', updated_at = now()
where booking_id is not null
  and status in ('reserved', 'open')
  and expires_at <= now();

do $$
begin
  if exists (
    select 1 from public.checkout_attempts
    where booking_id is not null and status in ('reserved', 'open')
    group by booking_id having count(*) > 1
  ) then
    raise exception 'Concurrent active Checkout attempts for one booking must be reconciled first';
  end if;
  if exists (
    select 1 from public.missions
    where booking_id is not null and status = 'confirmed'
    group by booking_id having count(*) > 1
  ) then
    raise exception 'Bookings with multiple confirmed missions must be reconciled first';
  end if;
end
$$;

create unique index if not exists checkout_attempts_booking_active_uidx
on public.checkout_attempts (booking_id)
where booking_id is not null and status in ('reserved', 'open');

create unique index if not exists missions_booking_confirmed_uidx
on public.missions (booking_id)
where booking_id is not null and status = 'confirmed';

create or replace function public.reserve_checkout_attempt(
  p_mission_id uuid,
  p_client_id uuid,
  p_ttl_seconds integer default 1800
)
returns table (
  attempt_id uuid,
  idempotency_key text,
  attempt_status text,
  stripe_session_id text,
  stripe_session_url text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_attempt public.checkout_attempts%rowtype;
  v_attempt_id uuid;
begin
  if p_ttl_seconds < 1800 or p_ttl_seconds > 86400 then
    raise exception 'Invalid checkout TTL' using errcode = '22023';
  end if;

  select * into v_mission from public.missions where id = p_mission_id;
  if not found then raise exception 'Mission not found' using errcode = 'P0002'; end if;

  if v_mission.booking_id is not null then
    perform 1 from public.bookings where id = v_mission.booking_id for update;
  end if;

  select * into v_mission
  from public.missions
  where id = p_mission_id
  for update;

  if v_mission.client_id is distinct from p_client_id then
    raise exception 'Mission does not belong to client' using errcode = '42501';
  end if;
  if v_mission.status <> 'proposed' then
    raise exception 'Mission is not payable' using errcode = '23514';
  end if;
  if exists (select 1 from public.payments where mission_id = p_mission_id and status = 'paid') then
    raise exception 'Mission is already paid' using errcode = '23505';
  end if;

  if v_mission.booking_id is not null then
    update public.checkout_attempts ca
    set status = 'expired', updated_at = now()
    where ca.booking_id = v_mission.booking_id
      and ca.status in ('reserved', 'open')
      and ca.expires_at <= now();

    if exists (
      select 1 from public.missions m
      where m.booking_id = v_mission.booking_id
        and m.id <> v_mission.id
        and m.status in ('confirmed', 'cancel_requested', 'completed')
    ) then
      raise exception 'Another offer for this booking has already been accepted'
        using errcode = '23505';
    end if;

    if exists (
      select 1 from public.checkout_attempts ca
      where ca.booking_id = v_mission.booking_id
        and ca.mission_id <> v_mission.id
        and ca.status in ('reserved', 'open')
    ) then
      raise exception 'Another offer for this booking already has an active Checkout session'
        using errcode = '23505';
    end if;
  end if;

  select * into v_attempt
  from public.checkout_attempts
  where mission_id = p_mission_id
  for update;

  if found and v_attempt.status in ('reserved', 'open') and v_attempt.expires_at > now() then
    return query select v_attempt.id, v_attempt.idempotency_key, v_attempt.status,
      v_attempt.stripe_session_id, v_attempt.stripe_session_url, v_attempt.expires_at;
    return;
  end if;

  v_attempt_id := gen_random_uuid();
  insert into public.checkout_attempts (
    id, mission_id, booking_id, client_id, idempotency_key,
    status, expires_at, created_at, updated_at
  ) values (
    v_attempt_id, p_mission_id, v_mission.booking_id, p_client_id,
    'checkout:' || v_attempt_id::text,
    'reserved', now() + make_interval(secs => p_ttl_seconds), now(), now()
  )
  on conflict (mission_id) do update set
    id = excluded.id,
    booking_id = excluded.booking_id,
    client_id = excluded.client_id,
    idempotency_key = excluded.idempotency_key,
    stripe_session_id = null,
    stripe_session_url = null,
    status = 'reserved',
    expires_at = excluded.expires_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at
  returning * into v_attempt;

  return query select v_attempt.id, v_attempt.idempotency_key, v_attempt.status,
    v_attempt.stripe_session_id, v_attempt.stripe_session_url, v_attempt.expires_at;
end
$$;

create or replace function public.cancel_competing_proposals()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'confirmed'
     and old.status is distinct from 'confirmed'
     and new.booking_id is not null then
    update public.missions
    set status = 'cancelled', updated_at = now()
    where booking_id = new.booking_id and id <> new.id and status = 'proposed';

    update public.checkout_attempts ca
    set status = 'abandoned', updated_at = now()
    where ca.booking_id = new.booking_id
      and ca.mission_id <> new.id
      and ca.status in ('reserved', 'open');
  end if;
  return new;
end
$$;

drop trigger if exists cancel_competing_proposals on public.missions;
create trigger cancel_competing_proposals
after update of status on public.missions
for each row execute function public.cancel_competing_proposals();

-- Chat creation is one atomic operation; participants are derived server-side.
do $$
begin
  if exists (
    select 1 from public.chats where mission_id is not null
    group by mission_id having count(*) > 1
  ) or exists (
    select 1 from public.chats where mission_id is null
    group by pro_id, client_id having count(*) > 1
  ) then
    raise exception 'Duplicate chats must be reconciled first';
  end if;
end
$$;

create unique index if not exists chats_mission_uidx
on public.chats (mission_id) where mission_id is not null;
create unique index if not exists chats_direct_pair_uidx
on public.chats (pro_id, client_id) where mission_id is null;

drop policy if exists "chats_insert_own" on public.chats;

create policy "chats_update_own"
on public.chats for update to authenticated
using (auth.uid() = pro_id or auth.uid() = client_id)
with check (auth.uid() = pro_id or auth.uid() = client_id);

create or replace function public.protect_chat_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' and (
    new.id is distinct from old.id
    or new.mission_id is distinct from old.mission_id
    or new.pro_id is distinct from old.pro_id
    or new.client_id is distinct from old.client_id
    or new.created_at is distinct from old.created_at
    or (new.hidden_for_pro is distinct from old.hidden_for_pro and auth.uid() <> old.pro_id)
    or (new.hidden_for_client is distinct from old.hidden_for_client and auth.uid() <> old.client_id)
  ) then
    raise exception 'Chat participants and ownership are immutable' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists protect_chat_fields on public.chats;
create trigger protect_chat_fields
before update on public.chats
for each row execute function public.protect_chat_fields();

create or replace function public.get_or_create_chat(
  p_mission_id uuid default null,
  p_pro_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_mission public.missions%rowtype;
  v_chat_id uuid;
  v_client_id uuid;
  v_pro_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_mission_id is not null then
    select * into v_mission from public.missions where id = p_mission_id;
    if not found or v_uid not in (v_mission.client_id, v_mission.pro_id) then
      raise exception 'Mission chat is not available to this user' using errcode = '42501';
    end if;
    v_client_id := v_mission.client_id;
    v_pro_id := v_mission.pro_id;

    insert into public.chats (mission_id, pro_id, client_id)
    values (p_mission_id, v_pro_id, v_client_id)
    on conflict (mission_id) where mission_id is not null
    do update set mission_id = excluded.mission_id
    returning id into v_chat_id;
  else
    if p_pro_id is null or p_pro_id = v_uid then
      raise exception 'A professional is required' using errcode = '22023';
    end if;
    if not exists (select 1 from public.users u where u.id = p_pro_id and u.role = 'pro') then
      raise exception 'Professional not found' using errcode = 'P0002';
    end if;
    if not exists (
      select 1 from public.users u where u.id = v_uid and u.active_role = 'client'
    ) then
      raise exception 'Only a client can start a direct conversation' using errcode = '42501';
    end if;

    insert into public.chats (mission_id, pro_id, client_id)
    values (null, p_pro_id, v_uid)
    on conflict (pro_id, client_id) where mission_id is null
    do update set pro_id = excluded.pro_id
    returning id into v_chat_id;
  end if;

  return v_chat_id;
end
$$;

revoke all on function public.get_or_create_chat(uuid, uuid) from public, anon;
grant execute on function public.get_or_create_chat(uuid, uuid) to authenticated;

drop policy if exists "messages_mark_read" on public.messages;
drop policy if exists "messages_update_own" on public.messages;

create policy "messages_mark_received_read"
on public.messages for update to authenticated
using (
  sender_id <> auth.uid()
  and exists (
    select 1 from public.chats c
    where c.id = chat_id and auth.uid() in (c.pro_id, c.client_id)
  )
)
with check (read_at is not null);

create policy "messages_update_own"
on public.messages for update to authenticated
using (sender_id = auth.uid())
with check (sender_id = auth.uid());

create or replace function public.protect_message_updates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' and (
    new.id is distinct from old.id
    or new.chat_id is distinct from old.chat_id
    or new.sender_id is distinct from old.sender_id
    or new.created_at is distinct from old.created_at
    or (
      auth.uid() is distinct from old.sender_id
      and (
        new.content is distinct from old.content
        or new.attachment_url is distinct from old.attachment_url
        or new.read_at is null
      )
    )
  ) then
    raise exception 'Only the sender may edit message content' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists protect_message_updates on public.messages;
create trigger protect_message_updates
before update on public.messages
for each row execute function public.protect_message_updates();

-- Own-profile writes remain flexible, but trust and identity fields do not.
create or replace function public.protect_user_stripe_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' and (
    new.id is distinct from old.id
    or (
      new.email is distinct from old.email
      and current_setting('app.trusted_user_email_sync', true) is distinct from 'on'
    )
    or new.stripe_account_id is distinct from old.stripe_account_id
    or new.stripe_account_ready is distinct from old.stripe_account_ready
    or new.payouts_enabled is distinct from old.payouts_enabled
    or new.verified_at is distinct from old.verified_at
    or new.verified_by is distinct from old.verified_by
    or new.verification_status not in ('unverified', 'pending')
    or (old.role = 'pro' and new.role <> 'pro')
    or new.role not in ('client', 'pro')
    or new.active_role not in ('client', 'pro')
    or (new.active_role = 'pro' and new.role <> 'pro')
  ) then
    raise exception 'Trusted account fields cannot be changed from the browser'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace function public.sync_user_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    perform set_config('app.trusted_user_email_sync', 'on', true);
    update public.users set email = new.email, updated_at = now() where id = new.id;
    perform set_config('app.trusted_user_email_sync', 'off', true);
  end if;
  return new;
end
$$;

drop trigger if exists sync_user_email_from_auth on auth.users;
create trigger sync_user_email_from_auth
after update of email on auth.users
for each row execute function public.sync_user_email_from_auth();

-- RLS is row-level, so the former "all authenticated profiles" policy also
-- exposed private columns such as IBAN and verification documents. Cross-user
-- reads now go through whitelisted functions.
drop policy if exists "Users can view public profiles" on public.users;

create or replace function public.get_user_summary(p_user_id uuid)
returns table (
  id uuid,
  username text,
  first_name text,
  last_name text,
  full_name text,
  email text,
  profile_photo text,
  role text,
  business_name text,
  business_type text[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with access as (
    select
      u.*,
      (
        u.id = auth.uid()
        or exists (
          select 1 from public.missions m
          where auth.uid() in (m.client_id, m.pro_id)
            and u.id in (m.client_id, m.pro_id)
        )
        or exists (
          select 1 from public.bookings b
          where b.client_id = u.id
            and (
              b.pro_id = auth.uid()
              or exists (
                select 1 from public.booking_notifications bn
                where bn.booking_id = b.id and bn.pro_id = auth.uid()
              )
            )
        )
        or exists (
          select 1 from public.chats c
          where auth.uid() in (c.client_id, c.pro_id)
            and u.id in (c.client_id, c.pro_id)
        )
      ) as is_related
    from public.users u
    where u.id = p_user_id
  )
  select
    a.id,
    a.username,
    a.first_name,
    a.last_name,
    nullif(trim(concat_ws(' ', a.first_name, a.last_name)), ''),
    case when a.is_related then a.email end,
    a.profile_photo,
    a.role,
    a.business_name,
    a.business_type
  from access a
  where a.is_related or (a.role = 'pro' and a.onboarding_completed = true)
$$;

create or replace function public.find_matching_pro_ids(
  p_services text[],
  p_client_lat double precision,
  p_client_lng double precision
)
returns table (id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id
  from public.users u
  where auth.uid() is not null
    and u.role = 'pro'
    and u.onboarding_completed = true
    and u.accepting_clients = true
    and u.latitude is not null
    and u.longitude is not null
    and coalesce(u.radius_km, 20) > 0
    and (
      select bool_and(
        exists (
          select 1 from unnest(coalesce(u.business_type, '{}'::text[])) offered
          where lower(offered) = lower(requested)
        )
      )
      from unnest(p_services) requested
    )
    and (
      6371 * acos(least(1, greatest(-1,
        cos(radians(p_client_lat)) * cos(radians(u.latitude)) *
        cos(radians(u.longitude) - radians(p_client_lng)) +
        sin(radians(p_client_lat)) * sin(radians(u.latitude))
      )))
    ) <= coalesce(u.radius_km, 20)
$$;

revoke all on function public.get_user_summary(uuid) from public, anon;
revoke all on function public.find_matching_pro_ids(text[], double precision, double precision)
from public, anon;
grant execute on function public.get_user_summary(uuid) to authenticated;
grant execute on function public.find_matching_pro_ids(text[], double precision, double precision)
to authenticated;
revoke execute on function public.match_pros_for_multiple_services(text[], double precision, double precision)
from public, anon, authenticated;
revoke execute on function public.match_pros_for_request(text, double precision, double precision)
from public, anon, authenticated;

-- Canonical, idempotent reviews tied to completed missions.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  reviewer_id uuid not null references public.users(id) on delete cascade,
  target_id uuid not null references public.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  constraint reviews_mission_reviewer_key unique (mission_id, reviewer_id),
  constraint reviews_distinct_users_check check (reviewer_id <> target_id)
);

alter table public.reviews enable row level security;
revoke all on public.reviews from anon;
grant select, insert on public.reviews to authenticated;

create policy "reviews_insert_completed_mission_participant"
on public.reviews for insert to authenticated
with check (
  reviewer_id = auth.uid()
  and exists (
    select 1 from public.missions m
    where m.id = mission_id
      and m.status = 'completed'
      and auth.uid() in (m.client_id, m.pro_id)
      and target_id = case when auth.uid() = m.client_id then m.pro_id else m.client_id end
  )
);

create policy "reviews_select_authenticated"
on public.reviews for select to authenticated
using (true);

create or replace function public.get_public_profile(p_user_id uuid)
returns table (
  id uuid,
  username text,
  first_name text,
  last_name text,
  role text,
  business_name text,
  description text,
  profile_photo text,
  portfolio text[],
  business_type text[],
  latitude double precision,
  longitude double precision,
  radius_km numeric,
  city text,
  country text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    u.id,
    u.username,
    u.first_name,
    u.last_name,
    u.role,
    u.business_name,
    u.description,
    u.profile_photo,
    u.portfolio,
    u.business_type,
    case when u.role = 'pro' and u.show_working_radius then u.latitude end,
    case when u.role = 'pro' and u.show_working_radius then u.longitude end,
    case when u.role = 'pro' and u.show_working_radius then u.radius_km end,
    case when u.show_city then u.city end,
    case when u.show_country then u.country end
  from public.users u
  where u.id = p_user_id and u.onboarding_completed = true
$$;

create or replace function public.get_public_reviews(p_target_id uuid)
returns table (
  id uuid,
  rating smallint,
  comment text,
  created_at timestamptz,
  reviewer_username text,
  reviewer_profile_photo text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.rating, r.comment, r.created_at, u.username, u.profile_photo
  from public.reviews r
  join public.users u on u.id = r.reviewer_id
  where r.target_id = p_target_id
  order by r.created_at desc
$$;

revoke all on function public.get_public_profile(uuid) from public;
revoke all on function public.get_public_reviews(uuid) from public;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;
grant execute on function public.get_public_reviews(uuid) to anon, authenticated;
