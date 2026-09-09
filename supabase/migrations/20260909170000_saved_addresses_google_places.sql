begin;

create table public.user_addresses (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  label text not null,
  formatted_address text not null,
  city text,
  postal_code text,
  country_code text,
  latitude double precision not null,
  longitude double precision not null,
  is_default boolean not null default false,
  creation_fingerprint text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint user_addresses_label_valid
    check (label = trim(label) and length(label) between 1 and 50),
  constraint user_addresses_formatted_address_valid
    check (
      formatted_address = trim(formatted_address)
      and length(formatted_address) between 1 and 500
    ),
  constraint user_addresses_city_valid
    check (city is null or (city = trim(city) and length(city) between 1 and 120)),
  constraint user_addresses_postal_code_valid
    check (
      postal_code is null
      or (postal_code = trim(postal_code) and length(postal_code) between 1 and 32)
    ),
  constraint user_addresses_country_code_valid
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint user_addresses_latitude_valid check (latitude between -90 and 90),
  constraint user_addresses_longitude_valid check (longitude between -180 and 180)
);

create index user_addresses_owner_order_idx
on public.user_addresses (user_id, is_default desc, created_at, id);

create unique index user_addresses_one_default_idx
on public.user_addresses (user_id)
where is_default;

alter table public.user_addresses enable row level security;

create policy user_addresses_select_own
on public.user_addresses for select to authenticated
using (user_id = auth.uid());

revoke all on table public.user_addresses from public, anon, authenticated;
grant select on table public.user_addresses to authenticated;
grant all on table public.user_addresses to service_role;

create or replace function public.touch_user_address_updated_at_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end
$$;

create trigger user_addresses_touch_updated_at
before update on public.user_addresses
for each row execute function public.touch_user_address_updated_at_v1();

create or replace function public.enforce_user_address_insert_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  if (select count(*) from public.user_addresses where user_id = new.user_id) >= 20 then
    raise exception 'A maximum of 20 saved addresses is allowed'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.user_addresses where user_id = new.user_id and is_default
  ) then
    new.is_default := true;
  elsif new.is_default then
    update public.user_addresses
    set is_default = false
    where user_id = new.user_id and is_default;
  end if;

  return new;
end
$$;

create trigger user_addresses_enforce_insert
before insert on public.user_addresses
for each row execute function public.enforce_user_address_insert_v1();

revoke all on function public.touch_user_address_updated_at_v1()
from public, anon, authenticated;
revoke all on function public.enforce_user_address_insert_v1()
from public, anon, authenticated;

-- One-way compatibility backfill. Keeping it as an idempotent maintenance
-- function makes clean rebuilds and the one-time legacy conversion testable.
create or replace function public.backfill_legacy_user_addresses_v1()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
insert into public.user_addresses (
  id,
  user_id,
  label,
  formatted_address,
  city,
  postal_code,
  country_code,
  latitude,
  longitude,
  is_default,
  creation_fingerprint
)
select
  md5(u.id::text || ':legacy-service-address')::uuid,
  u.id,
  'Home',
  trim(u.address),
  case
    when length(trim(coalesce(u.city, ''))) between 1 and 120
      then trim(u.city)
    else null
  end,
  case
    when length(trim(coalesce(u.postal_code, ''))) between 1 and 32
      then trim(u.postal_code)
    else null
  end,
  case
    when trim(coalesce(u.country, '')) ~ '^[A-Za-z]{2}$'
      then upper(trim(u.country))
    else null
  end,
  u.latitude,
  u.longitude,
  true,
  encode(sha256(convert_to(jsonb_build_object(
    'source', 'legacy_profile_v1',
    'user_id', u.id,
    'address', trim(u.address),
    'latitude', u.latitude,
    'longitude', u.longitude
  )::text, 'UTF8')), 'hex')
from public.users u
where nullif(trim(coalesce(u.address, '')), '') is not null
  and length(trim(u.address)) <= 500
  and u.latitude between -90 and 90
  and u.longitude between -180 and 180
  and not exists (
    select 1 from public.user_addresses ua where ua.user_id = u.id
  )
on conflict (id) do nothing
$$;

revoke all on function public.backfill_legacy_user_addresses_v1()
from public, anon, authenticated;

select public.backfill_legacy_user_addresses_v1();

create or replace function public.list_my_user_addresses_v1()
returns table (
  id uuid,
  label text,
  formatted_address text,
  city text,
  postal_code text,
  country_code text,
  latitude double precision,
  longitude double precision,
  is_default boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    ua.id,
    ua.label,
    ua.formatted_address,
    ua.city,
    ua.postal_code,
    ua.country_code,
    ua.latitude,
    ua.longitude,
    ua.is_default,
    ua.created_at,
    ua.updated_at
  from public.user_addresses ua
  where ua.user_id = auth.uid()
  order by ua.is_default desc, ua.created_at, ua.id
$$;

create or replace function public.create_my_user_address_v1(
  p_address_id uuid,
  p_label text,
  p_formatted_address text,
  p_city text,
  p_postal_code text,
  p_country_code text,
  p_latitude double precision,
  p_longitude double precision,
  p_make_default boolean default false
)
returns table (
  address_id uuid,
  is_default boolean,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_label text := trim(coalesce(p_label, ''));
  v_address text := trim(coalesce(p_formatted_address, ''));
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  v_postal_code text := nullif(trim(coalesce(p_postal_code, '')), '');
  v_country_code text := nullif(upper(trim(coalesce(p_country_code, ''))), '');
  v_make_default boolean := coalesce(p_make_default, false);
  v_fingerprint text;
  v_existing public.user_addresses%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_address_id is null then
    raise exception 'Address identifier is required' using errcode = '22023';
  end if;

  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'label', v_label,
    'formatted_address', v_address,
    'city', v_city,
    'postal_code', v_postal_code,
    'country_code', v_country_code,
    'latitude', p_latitude,
    'longitude', p_longitude,
    'make_default', v_make_default
  )::text, 'UTF8')), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select ua.* into v_existing
  from public.user_addresses ua
  where ua.id = p_address_id;

  if found then
    if v_existing.user_id is distinct from v_user_id
       or v_existing.creation_fingerprint is distinct from v_fingerprint then
      raise exception 'Address identifier was already used for a different request'
        using errcode = '22023';
    end if;
    return query select v_existing.id, v_existing.is_default, true;
    return;
  end if;

  insert into public.user_addresses (
    id, user_id, label, formatted_address, city, postal_code, country_code,
    latitude, longitude, is_default, creation_fingerprint
  ) values (
    p_address_id, v_user_id, v_label, v_address, v_city, v_postal_code, v_country_code,
    p_latitude, p_longitude, v_make_default, v_fingerprint
  )
  returning user_addresses.id, user_addresses.is_default
  into address_id, is_default;

  idempotent := false;
  return next;
end
$$;

create or replace function public.update_my_user_address_v1(
  p_address_id uuid,
  p_label text,
  p_formatted_address text,
  p_city text,
  p_postal_code text,
  p_country_code text,
  p_latitude double precision,
  p_longitude double precision
)
returns table (address_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  return query
  update public.user_addresses ua
  set label = trim(coalesce(p_label, '')),
      formatted_address = trim(coalesce(p_formatted_address, '')),
      city = nullif(trim(coalesce(p_city, '')), ''),
      postal_code = nullif(trim(coalesce(p_postal_code, '')), ''),
      country_code = nullif(upper(trim(coalesce(p_country_code, ''))), ''),
      latitude = p_latitude,
      longitude = p_longitude
  where ua.id = p_address_id and ua.user_id = v_user_id
  returning ua.id;

  if not found then
    raise exception 'Saved address not found' using errcode = 'P0002';
  end if;
end
$$;

create or replace function public.set_my_default_user_address_v1(p_address_id uuid)
returns table (address_id uuid, is_default boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  if not exists (
    select 1 from public.user_addresses ua
    where ua.id = p_address_id and ua.user_id = v_user_id
  ) then
    raise exception 'Saved address not found' using errcode = 'P0002';
  end if;

  update public.user_addresses ua
  set is_default = false
  where ua.user_id = v_user_id and ua.is_default and ua.id <> p_address_id;

  update public.user_addresses ua
  set is_default = true
  where ua.user_id = v_user_id and ua.id = p_address_id and not ua.is_default;

  return query
  select ua.id, ua.is_default from public.user_addresses ua
  where ua.id = p_address_id and ua.user_id = v_user_id;
end
$$;

create or replace function public.delete_my_user_address_v1(p_address_id uuid)
returns table (deleted_address_id uuid, new_default_address_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_was_default boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select ua.is_default into v_was_default
  from public.user_addresses ua
  where ua.id = p_address_id and ua.user_id = v_user_id
  for update;

  if not found then
    return query
    select p_address_id, (
      select ua.id from public.user_addresses ua
      where ua.user_id = v_user_id and ua.is_default
      limit 1
    );
    return;
  end if;

  delete from public.user_addresses ua
  where ua.id = p_address_id and ua.user_id = v_user_id;

  if v_was_default then
    update public.user_addresses ua
    set is_default = true
    where ua.id = (
      select candidate.id
      from public.user_addresses candidate
      where candidate.user_id = v_user_id
      order by candidate.created_at, candidate.id
      limit 1
    )
    returning ua.id into new_default_address_id;
  else
    select ua.id into new_default_address_id
    from public.user_addresses ua
    where ua.user_id = v_user_id and ua.is_default
    limit 1;
  end if;

  deleted_address_id := p_address_id;
  return next;
end
$$;

revoke all on function public.list_my_user_addresses_v1() from public, anon;
revoke all on function public.create_my_user_address_v1(
  uuid, text, text, text, text, text, double precision, double precision, boolean
) from public, anon;
revoke all on function public.update_my_user_address_v1(
  uuid, text, text, text, text, text, double precision, double precision
) from public, anon;
revoke all on function public.set_my_default_user_address_v1(uuid) from public, anon;
revoke all on function public.delete_my_user_address_v1(uuid) from public, anon;

grant execute on function public.list_my_user_addresses_v1() to authenticated;
grant execute on function public.create_my_user_address_v1(
  uuid, text, text, text, text, text, double precision, double precision, boolean
) to authenticated;
grant execute on function public.update_my_user_address_v1(
  uuid, text, text, text, text, text, double precision, double precision
) to authenticated;
grant execute on function public.set_my_default_user_address_v1(uuid) to authenticated;
grant execute on function public.delete_my_user_address_v1(uuid) to authenticated;

comment on table public.user_addresses is
  'Private client service addresses. Bookings copy an immutable address/coordinate snapshot.';

commit;
