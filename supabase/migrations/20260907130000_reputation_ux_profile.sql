-- Reputation UX integration: persistent provider notification and public
-- reputation summaries embedded in server-side discovery results.

begin;

alter table public.notifications drop constraint notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check
check (event_type in (
  'new_message', 'booking_request', 'offer_received', 'mission_confirmed',
  'cancellation_requested', 'mission_cancelled', 'mission_completed',
  'payment_confirmed', 'refund_completed', 'verification_approved',
  'verification_rejected', 'proposal_not_selected',
  'service_provider_completed', 'service_confirmation_requested',
  'service_release_reminder', 'service_funds_released',
  'service_problem_reported', 'service_problem_resolved',
  'review_received'
));

alter table public.notifications drop constraint notifications_source_table_check;
alter table public.notifications add constraint notifications_source_table_check
check (source_table in (
  'messages', 'booking_notifications', 'missions', 'payments',
  'professional_verification_reviews', 'checkout_v2_awards',
  'service_executions_v2', 'fund_releases_v2', 'workflow_transition_events',
  'reviews'
));

alter table public.notifications drop constraint notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check
check (entity_type in (
  'chat', 'booking', 'mission', 'payment', 'verification', 'review'
));

create or replace function public.notification_email_preference_enabled(
  p_user public.users,
  p_event_type text
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    coalesce(p_user.notifications_email, p_user.notif_email, true)
    and case
      when p_event_type = 'new_message'
        then coalesce(p_user.notif_new_messages, true)
      when p_event_type = 'booking_request'
        then coalesce(p_user.notif_job_alerts, true)
      when p_event_type in (
        'offer_received', 'mission_confirmed', 'cancellation_requested',
        'mission_cancelled', 'mission_completed', 'payment_confirmed',
        'refund_completed', 'proposal_not_selected',
        'service_provider_completed', 'service_confirmation_requested',
        'service_release_reminder', 'service_funds_released',
        'service_problem_reported', 'service_problem_resolved',
        'review_received'
      ) then coalesce(p_user.notif_booking_updates, true)
      else true
    end
$$;

create or replace function public.notify_provider_of_published_review_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.review_direction = 'client_to_provider' and new.status = 'published' then
    perform public.enqueue_notification(
      new.target_id,
      'review_received',
      'New review received',
      'A client published a review after a service completed through Glossed.',
      'reviews',
      new.id::text,
      'review',
      new.id,
      jsonb_build_object(
        'review_id', new.id,
        'path', '/profile/' || new.target_id::text
      ),
      'review-received:' || new.id::text
    );
  end if;
  return new;
end
$$;

revoke all on function public.notify_provider_of_published_review_v1()
from public, anon, authenticated;

drop trigger if exists notify_provider_of_published_review_v1 on public.reviews;
create trigger notify_provider_of_published_review_v1
after insert on public.reviews
for each row execute function public.notify_provider_of_published_review_v1();

-- Extend the existing discovery projection instead of issuing one aggregate
-- request per provider from the browser. The lateral call reuses #41's public
-- visibility and published-review rules without duplicating them.
drop function public.search_provider_profiles(
  text, double precision, double precision, numeric, integer, integer
);

create function public.search_provider_profiles(
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
  average_rating numeric,
  review_count bigint,
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
  ),
  paged as (
    select matching.*, count(*) over() as matching_total_count
    from matching
    order by exact_distance_m, id
    limit p_page_size
    offset ((p_page - 1) * p_page_size)
  )
  select
    p.id,
    p.username,
    p.business_name,
    p.description,
    p.profile_photo,
    p.all_service_codes,
    case when p.show_city then p.city end,
    case when p.show_country then p.country end,
    'verified'::text,
    round((p.exact_distance_m / 1000)::numeric, 1),
    case when p.show_working_radius then p.radius_km end,
    reputation.average_rating,
    reputation.review_count,
    p.matching_total_count
  from paged p
  cross join lateral public.get_public_review_summary(p.id) reputation
  order by p.exact_distance_m, p.id;
end
$$;

revoke all on function public.search_provider_profiles(
  text, double precision, double precision, numeric, integer, integer
) from public, anon;
grant execute on function public.search_provider_profiles(
  text, double precision, double precision, numeric, integer, integer
) to authenticated;

commit;
