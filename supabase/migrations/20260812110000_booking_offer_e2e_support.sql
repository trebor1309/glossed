-- Make proposal cancellation safe and keep functional E2E data disposable.

begin;

create or replace function public.cancel_mission_proposal(p_mission_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_booking_id uuid;
  v_mission public.missions%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select booking_id into v_booking_id
  from public.missions
  where id = p_mission_id;

  if not found or v_booking_id is null then
    raise exception 'Proposal not found' using errcode = 'P0002';
  end if;

  perform 1 from public.bookings where id = v_booking_id for update;

  select * into v_mission
  from public.missions
  where id = p_mission_id
  for update;

  if not found or v_mission.booking_id is distinct from v_booking_id then
    raise exception 'Proposal not found' using errcode = 'P0002';
  end if;
  if v_mission.pro_id is distinct from v_uid then
    raise exception 'Only the proposal owner may cancel it' using errcode = '42501';
  end if;
  if v_mission.status <> 'proposed' then
    raise exception 'Only a proposed mission may be cancelled' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.checkout_attempts ca where ca.mission_id = p_mission_id
  ) then
    raise exception 'A proposal with a Checkout attempt cannot be cancelled'
      using errcode = '55000';
  end if;

  delete from public.missions where id = p_mission_id;

  if not exists (
    select 1 from public.missions
    where booking_id = v_booking_id and status = 'proposed'
  ) then
    perform set_config('app.trusted_booking_update', 'on', true);
    update public.bookings
    set status = 'pending', updated_at = now()
    where id = v_booking_id and status = 'offers';
    perform set_config('app.trusted_booking_update', 'off', true);
  end if;

  return v_booking_id;
end
$$;

revoke all on function public.cancel_mission_proposal(uuid) from public, anon;
grant execute on function public.cancel_mission_proposal(uuid) to authenticated;

create or replace function public.cleanup_e2e_booking(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
  v_mission_ids uuid[];
begin
  if not public.is_app_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    return false;
  end if;
  if coalesce(v_booking.notes, '') not like '[E2E:%'
     or v_booking.created_at < now() - interval '7 days' then
    raise exception 'Only recent E2E bookings may be cleaned up' using errcode = '42501';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_mission_ids
  from public.missions
  where booking_id = p_booking_id;

  if exists (
    select 1 from public.payments p where p.mission_id = any(v_mission_ids)
  ) or exists (
    select 1 from public.checkout_attempts ca where ca.mission_id = any(v_mission_ids)
  ) or exists (
    select 1 from public.refund_attempts ra where ra.mission_id = any(v_mission_ids)
  ) then
    raise exception 'Financially linked E2E bookings cannot be cleaned up'
      using errcode = '55000';
  end if;

  delete from public.notifications n
  where n.entity_id = p_booking_id
     or n.entity_id = any(v_mission_ids)
     or n.source_id = p_booking_id::text
     or n.source_id = any(v_mission_ids::text[])
     or n.metadata ->> 'booking_id' = p_booking_id::text
     or n.metadata ->> 'mission_id' = any(v_mission_ids::text[]);

  delete from public.booking_notifications where booking_id = p_booking_id;
  delete from public.missions where booking_id = p_booking_id;
  delete from public.bookings where id = p_booking_id;

  return true;
end
$$;

revoke all on function public.cleanup_e2e_booking(uuid) from public, anon;
grant execute on function public.cleanup_e2e_booking(uuid) to authenticated;

commit;
