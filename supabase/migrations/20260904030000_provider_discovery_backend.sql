-- Provider discovery backend: canonical service taxonomy, indexed private
-- geography, separate public-visibility/discoverability predicates, and an
-- atomic idempotent targeted booking operation.

begin;

create extension if not exists postgis with schema extensions;

create table public.service_categories (
  code text primary key,
  translation_key text not null unique,
  fallback_label text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_categories_code_format check (code ~ '^[a-z][a-z0-9_]{1,62}$'),
  constraint service_categories_translation_key_not_blank check (trim(translation_key) <> ''),
  constraint service_categories_fallback_label_not_blank check (trim(fallback_label) <> '')
);

comment on table public.service_categories is
  'Canonical beauty-service taxonomy. Codes are stable; labels are resolved from translation_key. No price or duration belongs here.';

insert into public.service_categories (code, translation_key, fallback_label, sort_order)
values
  ('hair_stylist', 'services.hair_stylist', 'Hair Stylist', 10),
  ('barber', 'services.barber', 'Barber', 20),
  ('makeup_artist', 'services.makeup_artist', 'Makeup Artist', 30),
  ('manicure', 'services.manicure', 'Manicure', 40),
  ('skincare', 'services.skincare', 'Skincare', 50),
  ('kids_makeup', 'services.kids_makeup', 'Kids Makeup', 60),
  ('tattoo_artist', 'services.tattoo_artist', 'Tattoo Artist', 70),
  ('piercing_specialist', 'services.piercing_specialist', 'Piercing Specialist', 80),
  ('massage_therapist', 'services.massage_therapist', 'Massage Therapist', 90)
on conflict (code) do update
set translation_key = excluded.translation_key,
    fallback_label = excluded.fallback_label,
    sort_order = excluded.sort_order,
    updated_at = now();

create table public.provider_service_categories (
  provider_id uuid not null references public.users(id) on delete cascade,
  service_code text not null references public.service_categories(code) on update cascade on delete restrict,
  source text not null default 'legacy_business_type'
    check (source in ('legacy_business_type', 'canonical')),
  created_at timestamptz not null default now(),
  primary key (provider_id, service_code)
);

comment on table public.provider_service_categories is
  'Normalized provider taxonomy. legacy_business_type rows keep the existing business_type UI compatible during migration.';

create index provider_service_categories_service_provider_idx
  on public.provider_service_categories(service_code, provider_id);

create table public.provider_discovery_locations (
  provider_id uuid primary key references public.users(id) on delete cascade,
  location extensions.geography(Point, 4326) not null,
  service_radius_m integer not null check (service_radius_m > 0),
  updated_at timestamptz not null default now()
);

comment on table public.provider_discovery_locations is
  'Private exact provider location used only by server-side discovery. Never return location from a public RPC.';

create index provider_discovery_locations_location_gist
  on public.provider_discovery_locations using gist(location);

create table public.targeted_booking_operations (
  client_id uuid not null references public.users(id) on delete cascade,
  operation_id uuid not null,
  provider_id uuid not null references public.users(id) on delete cascade,
  request_fingerprint text not null,
  -- These are immutable operation results rather than ownership FKs. A booking
  -- may later be cancelled and its invitation is normally deleted as soon as
  -- the provider proposes; retaining both IDs prevents a late retry from
  -- recreating either resource.
  booking_id uuid not null unique,
  notification_id uuid not null unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (client_id, operation_id),
  constraint targeted_booking_operations_fingerprint_format
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint targeted_booking_operations_completion_check
    check (completed_at is null or completed_at >= created_at)
);

comment on table public.targeted_booking_operations is
  'Stable client operation identities for atomic targeted booking creation. A replay returns the original booking and invitation.';

alter table public.service_categories enable row level security;
alter table public.provider_service_categories enable row level security;
alter table public.provider_discovery_locations enable row level security;
alter table public.targeted_booking_operations enable row level security;

revoke all on public.service_categories from public, anon, authenticated;
revoke all on public.provider_service_categories from public, anon, authenticated;
revoke all on public.provider_discovery_locations from public, anon, authenticated;
revoke all on public.targeted_booking_operations from public, anon, authenticated;

create or replace function public.sync_provider_services_from_business_type()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.provider_service_categories psc
  where psc.provider_id = new.id
    and psc.source = 'legacy_business_type';

  if new.role = 'pro' then
    insert into public.provider_service_categories (provider_id, service_code, source)
    select new.id, sc.code, 'legacy_business_type'
    from public.service_categories sc
    where sc.active
      and exists (
        select 1
        from unnest(coalesce(new.business_type, '{}'::text[])) legacy_label
        where lower(trim(legacy_label)) = lower(sc.fallback_label)
      )
    on conflict (provider_id, service_code) do nothing;
  end if;

  return new;
end
$$;

revoke all on function public.sync_provider_services_from_business_type()
from public, anon, authenticated;

drop trigger if exists sync_provider_services_from_business_type on public.users;
create trigger sync_provider_services_from_business_type
after insert or update of business_type, role on public.users
for each row execute function public.sync_provider_services_from_business_type();

insert into public.provider_service_categories (provider_id, service_code, source)
select u.id, sc.code, 'legacy_business_type'
from public.users u
join public.service_categories sc
  on exists (
    select 1
    from unnest(coalesce(u.business_type, '{}'::text[])) legacy_label
    where lower(trim(legacy_label)) = lower(sc.fallback_label)
  )
where u.role = 'pro' and sc.active
on conflict (provider_id, service_code) do nothing;

create or replace function public.sync_provider_discovery_location()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.role = 'pro'
     and new.latitude between -90 and 90
     and new.longitude between -180 and 180
     and new.radius_km is not null
     and new.radius_km > 0 then
    insert into public.provider_discovery_locations (
      provider_id, location, service_radius_m, updated_at
    ) values (
      new.id,
      extensions.st_setsrid(extensions.st_makepoint(new.longitude, new.latitude), 4326)::extensions.geography,
      round(new.radius_km * 1000)::integer,
      now()
    )
    on conflict (provider_id) do update
    set location = excluded.location,
        service_radius_m = excluded.service_radius_m,
        updated_at = excluded.updated_at;
  else
    delete from public.provider_discovery_locations where provider_id = new.id;
  end if;

  return new;
end
$$;

revoke all on function public.sync_provider_discovery_location()
from public, anon, authenticated;

drop trigger if exists sync_provider_discovery_location on public.users;
create trigger sync_provider_discovery_location
after insert or update of latitude, longitude, radius_km, role on public.users
for each row execute function public.sync_provider_discovery_location();

insert into public.provider_discovery_locations (
  provider_id, location, service_radius_m, updated_at
)
select
  u.id,
  extensions.st_setsrid(extensions.st_makepoint(u.longitude, u.latitude), 4326)::extensions.geography,
  round(u.radius_km * 1000)::integer,
  now()
from public.users u
where u.role = 'pro'
  and u.latitude between -90 and 90
  and u.longitude between -180 and 180
  and u.radius_km > 0
on conflict (provider_id) do update
set location = excluded.location,
    service_radius_m = excluded.service_radius_m,
    updated_at = excluded.updated_at;

create or replace function public.is_provider_profile_visible(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users u
    where u.id = p_provider_id
      and u.role = 'pro'
      and u.onboarding_completed = true
  )
$$;

create or replace function public.is_provider_discoverable(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users u
    join public.provider_discovery_locations pdl on pdl.provider_id = u.id
    where u.id = p_provider_id
      and public.is_provider_profile_visible(u.id)
      and u.verification_status = 'verified'
      and u.accepting_clients = true
      and exists (
        select 1
        from public.provider_service_categories psc
        join public.service_categories sc on sc.code = psc.service_code
        where psc.provider_id = u.id and sc.active
      )
  )
$$;

revoke all on function public.is_provider_profile_visible(uuid)
from public, anon, authenticated;
revoke all on function public.is_provider_discoverable(uuid)
from public, anon, authenticated;
-- The discoverability predicate is intentionally callable by authenticated
-- users because PostgreSQL evaluates the booking RLS policies as the caller.
-- It exposes only a boolean already observable through discovery results.
grant execute on function public.is_provider_discoverable(uuid) to authenticated;

-- Keep the pre-PR2 browser flow safe while the new atomic RPC is not wired to
-- the UI yet. A paused/non-discoverable provider cannot be assigned or invited
-- through direct table calls.
drop policy if exists "bookings_insert_own_pending" on public.bookings;
create policy "bookings_insert_own_pending"
on public.bookings for insert to authenticated
with check (
  auth.uid() = client_id
  and status = 'pending'
  and (pro_id is null or public.is_provider_discoverable(pro_id))
);

drop policy if exists "booking_notifications_insert_for_own_booking"
on public.booking_notifications;
create policy "booking_notifications_insert_for_own_booking"
on public.booking_notifications for insert to authenticated
with check (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and b.client_id = auth.uid()
      and b.status = 'pending'
      and (b.pro_id is null or b.pro_id = pro_id)
  )
  and public.is_provider_discoverable(pro_id)
);

-- The existing broadcast request screen still consumes this ID-only RPC.
-- Preserve its contract while moving it to the same canonical taxonomy,
-- discoverability guard and indexed PostGIS distance calculation.
create or replace function public.find_matching_pro_ids(
  p_services text[],
  p_client_lat double precision,
  p_client_lng double precision
)
returns table (id uuid)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with requested_raw as (
    select distinct lower(trim(requested_label)) as requested_label
    from unnest(coalesce(p_services, '{}'::text[])) requested_label
    where nullif(trim(requested_label), '') is not null
  ),
  requested as (
    select distinct sc.code
    from requested_raw rr
    join public.service_categories sc
      on sc.active
     and (
       lower(sc.code) = rr.requested_label
       or lower(sc.fallback_label) = rr.requested_label
     )
  ),
  search_point as (
    select extensions.st_setsrid(
      extensions.st_makepoint(p_client_lng, p_client_lat), 4326
    )::extensions.geography as location
  )
  select u.id
  from public.users u
  join public.provider_discovery_locations pdl on pdl.provider_id = u.id
  cross join search_point sp
  where auth.uid() is not null
    and p_client_lat between -90 and 90
    and p_client_lng between -180 and 180
    and (select count(*) from requested_raw) > 0
    and (select count(*) from requested) = (select count(*) from requested_raw)
    and public.is_provider_discoverable(u.id)
    and not exists (
      select 1
      from requested r
      where not exists (
        select 1
        from public.provider_service_categories psc
        where psc.provider_id = u.id and psc.service_code = r.code
      )
    )
    and extensions.st_dwithin(
      pdl.location, sp.location, pdl.service_radius_m::double precision
    )
$$;

revoke all on function public.find_matching_pro_ids(text[], double precision, double precision)
from public, anon;
grant execute on function public.find_matching_pro_ids(text[], double precision, double precision)
to authenticated;

create or replace function public.list_service_categories()
returns table (
  code text,
  translation_key text,
  fallback_label text,
  sort_order integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sc.code, sc.translation_key, sc.fallback_label, sc.sort_order
  from public.service_categories sc
  where sc.active
  order by sc.sort_order, sc.code
$$;

revoke all on function public.list_service_categories() from public, anon;
grant execute on function public.list_service_categories() to authenticated;

create or replace function public.search_provider_profiles(
  p_service_code text,
  p_search_latitude double precision,
  p_search_longitude double precision,
  p_search_radius_km numeric,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  provider_id uuid,
  username text,
  business_name text,
  description text,
  profile_photo text,
  service_codes text[],
  city text,
  country text,
  verification_status text,
  distance_km numeric,
  public_service_radius_km numeric,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_service_code text := lower(trim(coalesce(p_service_code, '')));
  v_search_point extensions.geography(Point, 4326);
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_search_latitude is null or p_search_latitude not between -90 and 90
     or p_search_longitude is null or p_search_longitude not between -180 and 180 then
    raise exception 'Search coordinates are invalid' using errcode = '22023';
  end if;
  if p_search_radius_km is null or p_search_radius_km < 1 or p_search_radius_km > 200 then
    raise exception 'Search radius must be between 1 and 200 kilometres'
      using errcode = '22023';
  end if;
  if p_page is null or p_page < 1 or p_page > 10000
     or p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'Invalid discovery pagination' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.service_categories sc
    where sc.code = v_service_code and sc.active
  ) then
    raise exception 'Unknown or inactive service category' using errcode = '22023';
  end if;

  v_search_point := extensions.st_setsrid(
    extensions.st_makepoint(p_search_longitude, p_search_latitude), 4326
  )::extensions.geography;

  return query
  with matching as (
    select
      u.id,
      u.username,
      u.business_name,
      u.description,
      u.profile_photo,
      u.city,
      u.country,
      u.show_city,
      u.show_country,
      u.show_working_radius,
      u.radius_km,
      extensions.st_distance(pdl.location, v_search_point) as exact_distance_m,
      array(
        select psc_all.service_code
        from public.provider_service_categories psc_all
        join public.service_categories sc_all on sc_all.code = psc_all.service_code
        where psc_all.provider_id = u.id and sc_all.active
        order by sc_all.sort_order, psc_all.service_code
      ) as all_service_codes
    from public.users u
    join public.provider_discovery_locations pdl on pdl.provider_id = u.id
    join public.provider_service_categories psc
      on psc.provider_id = u.id and psc.service_code = v_service_code
    where public.is_provider_discoverable(u.id)
      and extensions.st_dwithin(
        pdl.location, v_search_point, (p_search_radius_km * 1000)::double precision
      )
      and extensions.st_dwithin(
        pdl.location, v_search_point, pdl.service_radius_m::double precision
      )
  )
  select
    m.id,
    m.username,
    m.business_name,
    m.description,
    m.profile_photo,
    m.all_service_codes,
    case when m.show_city then m.city end,
    case when m.show_country then m.country end,
    'verified'::text,
    round((m.exact_distance_m / 1000)::numeric, 1),
    case when m.show_working_radius then m.radius_km end,
    count(*) over()
  from matching m
  order by m.exact_distance_m, m.id
  limit p_page_size
  offset ((p_page - 1) * p_page_size);
end
$$;

revoke all on function public.search_provider_profiles(text, double precision, double precision, numeric, integer, integer)
from public, anon;
grant execute on function public.search_provider_profiles(text, double precision, double precision, numeric, integer, integer)
to authenticated;

-- Preserve the public profile contract while ensuring exact provider
-- coordinates never cross the server boundary. accepting_clients deliberately
-- does not participate in public visibility.
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
  country text,
  verification_status text
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
    null::double precision,
    null::double precision,
    case when u.role = 'pro' and u.show_working_radius then u.radius_km end,
    case when u.show_city then u.city end,
    case when u.show_country then u.country end,
    case when u.role = 'pro' and u.verification_status = 'verified'
      then 'verified' else 'unverified' end
  from public.users u
  where u.id = p_user_id
    and (
      (u.role = 'pro' and public.is_provider_profile_visible(u.id))
      or (u.role = 'client' and u.onboarding_completed = true)
    )
$$;

revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;

create or replace function public.create_targeted_booking_request(
  p_operation_id uuid,
  p_provider_id uuid,
  p_service_codes text[],
  p_date date,
  p_time_slot text,
  p_address text,
  p_notes text,
  p_client_latitude double precision,
  p_client_longitude double precision
)
returns table (
  booking_id uuid,
  notification_id uuid,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_client_id uuid := auth.uid();
  v_service_codes text[];
  v_requested_service_count integer;
  v_service_labels text;
  v_fingerprint text;
  v_operation public.targeted_booking_operations%rowtype;
  v_inserted boolean := false;
  v_client_point extensions.geography(Point, 4326);
begin
  if v_client_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_operation_id is null or p_provider_id is null then
    raise exception 'Operation and provider identifiers are required' using errcode = '22023';
  end if;
  if p_provider_id = v_client_id then
    raise exception 'A client cannot target their own provider profile' using errcode = '22023';
  end if;
  if p_service_codes is null or cardinality(p_service_codes) = 0 then
    raise exception 'At least one service category is required' using errcode = '22023';
  end if;
  if p_date is null or p_date < current_date then
    raise exception 'The requested date must not be in the past' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_time_slot, '')), '') is null
     or length(trim(p_time_slot)) > 120 then
    raise exception 'A valid time slot is required' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_address, '')), '') is null
     or length(trim(p_address)) > 500 then
    raise exception 'A valid private service address is required' using errcode = '22023';
  end if;
  if p_notes is not null and length(p_notes) > 5000 then
    raise exception 'Booking notes are too long' using errcode = '22023';
  end if;
  if p_client_latitude is null or p_client_latitude not between -90 and 90
     or p_client_longitude is null or p_client_longitude not between -180 and 180 then
    raise exception 'Client coordinates are invalid' using errcode = '22023';
  end if;

  select count(distinct lower(trim(requested)))
  into v_requested_service_count
  from unnest(p_service_codes) requested
  where nullif(trim(requested), '') is not null;

  select array_agg(sc.code order by sc.sort_order, sc.code),
         string_agg(sc.fallback_label, ', ' order by sc.sort_order, sc.code)
  into v_service_codes, v_service_labels
  from public.service_categories sc
  where sc.active
    and sc.code in (
      select distinct lower(trim(requested))
      from unnest(p_service_codes) requested
      where nullif(trim(requested), '') is not null
    );

  if v_service_codes is null
     or cardinality(v_service_codes) <> v_requested_service_count then
    raise exception 'One or more service categories are unknown or inactive'
      using errcode = '22023';
  end if;

  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
      'provider_id', p_provider_id,
      'service_codes', v_service_codes,
      'date', p_date,
      'time_slot', trim(p_time_slot),
      'address', trim(p_address),
      'notes', nullif(trim(coalesce(p_notes, '')), ''),
      'client_latitude', p_client_latitude,
      'client_longitude', p_client_longitude
    )::text, 'UTF8')), 'hex');

  select tbo.* into v_operation
  from public.targeted_booking_operations tbo
  where tbo.client_id = v_client_id and tbo.operation_id = p_operation_id
  for update;

  if found then
    if v_operation.provider_id is distinct from p_provider_id
       or v_operation.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Operation identifier was already used for a different request'
        using errcode = '22023';
    end if;
    if v_operation.completed_at is null then
      raise exception 'Targeted booking operation is incomplete and requires review'
        using errcode = '55000';
    end if;

    return query select v_operation.booking_id, v_operation.notification_id, true;
    return;
  end if;

  perform 1
  from public.users u
  where u.id = p_provider_id and public.is_provider_discoverable(u.id)
  for share;
  if not found then
    raise exception 'Professional is not accepting discoverable requests'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from unnest(v_service_codes) requested_code
    where not exists (
      select 1
      from public.provider_service_categories psc
      join public.service_categories sc on sc.code = psc.service_code and sc.active
      where psc.provider_id = p_provider_id
        and psc.service_code = requested_code
    )
  ) then
    raise exception 'Professional does not offer every requested service'
      using errcode = '23514';
  end if;

  v_client_point := extensions.st_setsrid(
    extensions.st_makepoint(p_client_longitude, p_client_latitude), 4326
  )::extensions.geography;

  if not exists (
    select 1
    from public.provider_discovery_locations pdl
    where pdl.provider_id = p_provider_id
      and extensions.st_dwithin(
        pdl.location, v_client_point, pdl.service_radius_m::double precision
      )
  ) then
    raise exception 'Requested address is outside the professional service area'
      using errcode = '22023';
  end if;

  insert into public.targeted_booking_operations (
    client_id, operation_id, provider_id, request_fingerprint,
    booking_id, notification_id
  ) values (
    v_client_id, p_operation_id, p_provider_id, v_fingerprint,
    gen_random_uuid(), gen_random_uuid()
  )
  on conflict (client_id, operation_id) do nothing
  returning * into v_operation;

  if found then
    v_inserted := true;
  else
    select tbo.* into v_operation
    from public.targeted_booking_operations tbo
    where tbo.client_id = v_client_id and tbo.operation_id = p_operation_id
    for update;

    if v_operation.provider_id is distinct from p_provider_id
       or v_operation.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Operation identifier was already used for a different request'
        using errcode = '22023';
    end if;
  end if;

  if not v_inserted then
    if v_operation.completed_at is null then
      raise exception 'Targeted booking operation is incomplete and requires review'
        using errcode = '55000';
    end if;

    return query select v_operation.booking_id, v_operation.notification_id, true;
    return;
  end if;

  insert into public.bookings (
    id, client_id, pro_id, service, date, time_slot, address, notes,
    client_lat, client_lng, status
  ) values (
    v_operation.booking_id, v_client_id, p_provider_id, v_service_labels,
    p_date, trim(p_time_slot), trim(p_address),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_client_latitude, p_client_longitude, 'pending'
  );

  insert into public.booking_notifications (id, booking_id, pro_id)
  values (v_operation.notification_id, v_operation.booking_id, p_provider_id);

  update public.targeted_booking_operations
  set completed_at = clock_timestamp()
  where client_id = v_client_id and operation_id = p_operation_id;

  return query select v_operation.booking_id, v_operation.notification_id, false;
end
$$;

revoke all on function public.create_targeted_booking_request(
  uuid, uuid, text[], date, text, text, text, double precision, double precision
) from public, anon;
grant execute on function public.create_targeted_booking_request(
  uuid, uuid, text[], date, text, text, text, double precision, double precision
) to authenticated;

commit;
