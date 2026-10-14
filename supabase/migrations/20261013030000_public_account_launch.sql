-- Public account launch: profiles and onboarding stay available while every
-- booking and checkout creation path remains closed by default.

create table public.platform_feature_flags (
  flag_code text primary key,
  enabled boolean not null default false,
  public_message text not null,
  reason text not null,
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint platform_feature_flag_code_check
    check (flag_code ~ '^[a-z][a-z0-9_]*$'),
  constraint platform_feature_flag_message_check
    check (length(trim(public_message)) between 1 and 500),
  constraint platform_feature_flag_reason_check
    check (length(trim(reason)) between 10 and 4000)
);

create table public.platform_feature_flag_events (
  id uuid primary key default gen_random_uuid(),
  flag_code text not null references public.platform_feature_flags(flag_code) on delete restrict,
  previous_enabled boolean,
  enabled boolean not null,
  revision bigint not null check (revision > 0),
  reason text not null,
  changed_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default clock_timestamp(),
  constraint platform_feature_flag_event_reason_check
    check (length(trim(reason)) between 10 and 4000)
);

create index platform_feature_flag_events_flag_time_idx
on public.platform_feature_flag_events(flag_code, occurred_at desc);

alter table public.platform_feature_flags enable row level security;
alter table public.platform_feature_flag_events enable row level security;

revoke all on public.platform_feature_flags from public, anon, authenticated;
revoke all on public.platform_feature_flag_events from public, anon, authenticated;

create or replace function public.protect_platform_feature_flag()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Platform feature flags cannot be deleted' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.flag_code := old.flag_code;
    new.created_at := old.created_at;
    new.revision := old.revision + 1;
    new.updated_at := clock_timestamp();
  end if;
  return new;
end
$$;

create trigger protect_platform_feature_flag
before update or delete on public.platform_feature_flags
for each row execute function public.protect_platform_feature_flag();

create or replace function public.record_platform_feature_flag_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.platform_feature_flag_events (
    flag_code, previous_enabled, enabled, revision, reason, changed_by
  ) values (
    new.flag_code,
    case when tg_op = 'UPDATE' then old.enabled else null end,
    new.enabled,
    new.revision,
    new.reason,
    new.updated_by
  );
  return new;
end
$$;

create trigger record_platform_feature_flag_event
after insert or update on public.platform_feature_flags
for each row execute function public.record_platform_feature_flag_event();

insert into public.platform_feature_flags (
  flag_code, enabled, public_message, reason
) values (
  'bookings',
  false,
  'Bookings are not open yet. You can create your account and explore professional profiles in the meantime.',
  'Public account launch starts with booking, proposal and checkout creation disabled.'
);

create or replace function public.platform_feature_enabled(p_flag_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select feature.enabled
    from public.platform_feature_flags feature
    where feature.flag_code = p_flag_code
  ), false)
$$;

revoke all on function public.platform_feature_enabled(text) from public;
grant execute on function public.platform_feature_enabled(text) to anon, authenticated, service_role;

create or replace function public.get_public_platform_capabilities()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'bookings_enabled', feature.enabled,
    'bookings_message', feature.public_message
  )
  from public.platform_feature_flags feature
  where feature.flag_code = 'bookings'
$$;

revoke all on function public.get_public_platform_capabilities() from public;
grant execute on function public.get_public_platform_capabilities() to anon, authenticated;

create or replace function public.assert_platform_feature_enabled(p_flag_code text)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_feature public.platform_feature_flags%rowtype;
begin
  select * into v_feature
  from public.platform_feature_flags
  where flag_code = p_flag_code;

  if not found or not v_feature.enabled then
    raise exception '%', coalesce(
      v_feature.public_message,
      'This feature is not available yet.'
    ) using errcode = '55000';
  end if;
end
$$;

revoke all on function public.assert_platform_feature_enabled(text)
from public, anon, authenticated;
grant execute on function public.assert_platform_feature_enabled(text) to service_role;

create or replace function public.enforce_booking_creation_enabled()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_platform_feature_enabled('bookings');
  return new;
end
$$;

revoke all on function public.enforce_booking_creation_enabled()
from public, anon, authenticated;

create trigger enforce_booking_creation_enabled
before insert on public.bookings
for each row execute function public.enforce_booking_creation_enabled();

create trigger enforce_proposal_creation_enabled
before insert on public.missions
for each row
when (new.booking_id is not null and new.status = 'proposed')
execute function public.enforce_booking_creation_enabled();

create trigger enforce_legacy_checkout_creation_enabled
before insert on public.checkout_attempts
for each row execute function public.enforce_booking_creation_enabled();

create trigger enforce_checkout_v2_creation_enabled
before insert on public.checkout_v2_attempts
for each row execute function public.enforce_booking_creation_enabled();

create or replace function public.admin_set_platform_feature_flag(
  p_flag_code text,
  p_enabled boolean,
  p_reason text,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.platform_feature_flags%rowtype;
  v_after public.platform_feature_flags%rowtype;
  v_result jsonb;
begin
  perform public.assert_admin_permission('configuration.manage', true);

  if length(trim(coalesce(p_reason, ''))) not between 10 and 4000 then
    raise exception 'A detailed reason is required' using errcode = '22023';
  end if;

  select * into v_before
  from public.platform_feature_flags
  where flag_code = p_flag_code
  for update;

  if not found then
    raise exception 'Unknown platform feature flag' using errcode = 'P0002';
  end if;
  if p_expected_revision is null or p_expected_revision <> v_before.revision then
    raise exception 'Platform feature flag changed after review' using errcode = '40001';
  end if;

  if v_before.enabled = p_enabled then
    return jsonb_build_object(
      'flag_code', v_before.flag_code,
      'enabled', v_before.enabled,
      'revision', v_before.revision,
      'idempotent', true
    );
  end if;

  update public.platform_feature_flags
  set enabled = p_enabled,
      reason = trim(p_reason),
      updated_by = auth.uid()
  where flag_code = p_flag_code
  returning * into v_after;

  v_result := jsonb_build_object(
    'flag_code', v_after.flag_code,
    'enabled', v_after.enabled,
    'revision', v_after.revision,
    'idempotent', false
  );

  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    reason, before_state, after_state, mfa_authenticated_at, deduplication_key
  ) values (
    auth.uid(), 'platform_feature_flag_changed', 'platform_feature_flag',
    v_after.flag_code, 'configuration.platform_feature.update', 'success',
    trim(p_reason), to_jsonb(v_before), to_jsonb(v_after),
    public.admin_current_mfa_authenticated_at(),
    concat_ws(':', 'platform-feature', v_after.flag_code, v_after.revision::text)
  );

  return v_result;
end
$$;

revoke all on function public.admin_set_platform_feature_flag(text, boolean, text, bigint)
from public, anon;
grant execute on function public.admin_set_platform_feature_flag(text, boolean, text, bigint)
to authenticated;
