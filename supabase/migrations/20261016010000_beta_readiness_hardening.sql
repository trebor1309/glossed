-- Beta-readiness monitoring foundation.
-- Browser reports contain only allow-listed diagnostic codes and coarse client
-- context. Raw exception messages, stacks, URLs with query strings and form
-- values are deliberately rejected before persistence.

begin;

insert into public.admin_permission_definitions (
  permission_code, description, requires_recent_mfa
) values
  ('operations_health.read', 'Read sanitized client incidents and delivery health.', false),
  ('operations_health.manage', 'Resolve or reopen sanitized client incidents.', false)
on conflict (permission_code) do update
set description = excluded.description,
    requires_recent_mfa = excluded.requires_recent_mfa;

insert into public.admin_role_permissions (role_code, permission_code) values
  ('support', 'operations_health.read'),
  ('support', 'operations_health.manage'),
  ('super_admin', 'operations_health.read'),
  ('super_admin', 'operations_health.manage')
on conflict do nothing;

create table public.client_operational_events (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'frontend_render_failure',
    'runtime_error',
    'unhandled_rejection',
    'maps_auth_failure',
    'maps_load_failure',
    'maps_widget_failure'
  )),
  severity text not null check (severity in ('warning', 'error')),
  event_code text not null,
  source_path text not null,
  app_release text,
  sender_fingerprint text not null,
  client_context jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution_note text,
  resolved_at timestamptz,
  resolved_by uuid references public.admin_accounts(user_id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint client_operational_events_code_check check (
    event_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint client_operational_events_path_check check (
    char_length(source_path) between 1 and 200
    and left(source_path, 1) = '/'
    and strpos(source_path, '?') = 0
    and strpos(source_path, '#') = 0
  ),
  constraint client_operational_events_release_check check (
    app_release is null or (
      char_length(app_release) between 1 and 100
      and app_release ~ '^[A-Za-z0-9._-]+$'
    )
  ),
  constraint client_operational_events_fingerprint_check check (
    sender_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint client_operational_events_context_check check (
    jsonb_typeof(client_context) = 'object'
    and octet_length(client_context::text) <= 2048
  ),
  constraint client_operational_events_resolution_note_check check (
    resolution_note is null or char_length(btrim(resolution_note)) between 10 and 2000
  ),
  constraint client_operational_events_lifecycle_check check (
    (status = 'open' and resolved_at is null and resolved_by is null and resolution_note is null)
    or (status = 'resolved' and resolved_at is not null and resolved_by is not null
        and resolution_note is not null)
  )
);

create index client_operational_events_queue_idx
  on public.client_operational_events (status, created_at desc);
create index client_operational_events_type_idx
  on public.client_operational_events (event_type, created_at desc);
create index client_operational_events_fingerprint_idx
  on public.client_operational_events (sender_fingerprint, created_at desc);

alter table public.client_operational_events enable row level security;
revoke all on public.client_operational_events from public, anon, authenticated;
grant all on public.client_operational_events to service_role;

create or replace function public.accept_client_operational_event(
  p_id uuid,
  p_user_id uuid,
  p_event_type text,
  p_severity text,
  p_event_code text,
  p_source_path text,
  p_app_release text,
  p_sender_fingerprint text,
  p_client_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.client_operational_events%rowtype;
  v_now timestamptz := clock_timestamp();
  v_lock bigint := hashtextextended('client-operational-event:' || p_sender_fingerprint, 0);
begin
  perform pg_advisory_xact_lock(v_lock);

  select * into v_existing
  from public.client_operational_events
  where id = p_id;

  if found then
    if v_existing.sender_fingerprint <> p_sender_fingerprint
       or v_existing.event_type <> p_event_type
       or v_existing.event_code <> p_event_code
       or v_existing.source_path <> p_source_path then
      raise exception using errcode = '22023', message = 'operational_event_id_conflict';
    end if;
    return jsonb_build_object('id', v_existing.id, 'created', false);
  end if;

  if (
    select count(*) from public.client_operational_events
    where sender_fingerprint = p_sender_fingerprint
      and created_at >= v_now - interval '15 minutes'
  ) >= 20 or (
    select count(*) from public.client_operational_events
    where sender_fingerprint = p_sender_fingerprint
      and created_at >= v_now - interval '24 hours'
  ) >= 100 then
    raise exception using errcode = 'P0001', message = 'operational_event_rate_limited';
  end if;

  insert into public.client_operational_events (
    id, user_id, event_type, severity, event_code, source_path,
    app_release, sender_fingerprint, client_context
  ) values (
    p_id, p_user_id, p_event_type, p_severity, p_event_code, p_source_path,
    nullif(btrim(p_app_release), ''), p_sender_fingerprint,
    coalesce(p_client_context, '{}'::jsonb)
  );

  return jsonb_build_object('id', p_id, 'created', true);
end
$$;

create or replace function public.admin_list_operational_health(
  p_status text default 'open',
  p_event_type text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total integer;
  v_items jsonb;
  v_counts jsonb;
  v_client_events integer;
  v_contact_failures integer;
begin
  perform public.assert_admin_permission('operations_health.read');
  if p_status not in ('all', 'open', 'resolved') then
    raise exception 'Invalid operational event status filter' using errcode = '22023';
  end if;
  if p_event_type not in (
    'all', 'frontend_render_failure', 'runtime_error', 'unhandled_rejection',
    'maps_auth_failure', 'maps_load_failure', 'maps_widget_failure'
  ) then
    raise exception 'Invalid operational event type filter' using errcode = '22023';
  end if;

  select coalesce(max(item.total_count), 0)::integer,
    coalesce(jsonb_agg((to_jsonb(item) - 'total_count') order by item.created_at desc), '[]'::jsonb)
  into v_total, v_items
  from (
    select event.id, event.user_id, event.event_type, event.severity,
      event.event_code, event.source_path, event.app_release,
      event.client_context, event.status, event.resolution_note,
      event.resolved_at, event.created_at, event.updated_at,
      count(*) over () as total_count
    from public.client_operational_events event
    where (p_status = 'all' or event.status = p_status)
      and (p_event_type = 'all' or event.event_type = p_event_type)
    order by event.created_at desc
    limit v_limit offset v_offset
  ) item;

  select coalesce(jsonb_object_agg(summary.event_type, summary.event_count), '{}'::jsonb)
  into v_counts
  from (
    select event_type, count(*)::integer as event_count
    from public.client_operational_events
    where created_at >= clock_timestamp() - interval '24 hours'
    group by event_type
  ) summary;

  select count(*)::integer into v_client_events
  from public.client_operational_events
  where created_at >= clock_timestamp() - interval '24 hours';

  select count(*)::integer into v_contact_failures
  from public.contact_requests
  where delivery_status = 'email_failed'
    and created_at >= clock_timestamp() - interval '24 hours';

  perform public.record_admin_read_audit(
    'operations.health.list', 'client_operational_event_collection', null,
    jsonb_build_object('status', p_status, 'event_type', p_event_type,
      'result_count', jsonb_array_length(v_items), 'offset', v_offset)
  );

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'last_24_hours', jsonb_build_object(
      'by_type', v_counts,
      'client_event_count', v_client_events,
      'contact_delivery_failures', v_contact_failures
    )
  );
end
$$;

create or replace function public.admin_update_operational_event(
  p_event_id uuid,
  p_status text,
  p_note text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_event public.client_operational_events%rowtype;
  v_previous_status text;
  v_deduplication_key text := 'operational-event-change:' || p_operation_id::text;
begin
  perform public.assert_admin_permission('operations_health.manage');
  if p_event_id is null or p_operation_id is null or p_status not in ('open', 'resolved') then
    raise exception 'Event, target status and operation identifier are required'
      using errcode = '22023';
  end if;
  if p_status = 'resolved' and (v_note is null or char_length(v_note) not between 10 and 2000) then
    raise exception 'A resolution note of at least 10 characters is required'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.admin_audit_log
    where deduplication_key = v_deduplication_key and admin_account_id = v_actor
      and entity_id = p_event_id::text and after_state ->> 'status' = p_status
  ) then
    select * into v_event from public.client_operational_events where id = p_event_id;
    return to_jsonb(v_event) || jsonb_build_object('idempotent', true);
  end if;

  select * into v_event
  from public.client_operational_events
  where id = p_event_id for update;
  if not found then
    raise exception 'Operational event not found' using errcode = 'P0002';
  end if;
  if v_event.status = p_status then
    raise exception 'The operational event already has this status' using errcode = '22023';
  end if;
  v_previous_status := v_event.status;

  update public.client_operational_events
  set status = p_status,
      resolution_note = case when p_status = 'resolved' then v_note else null end,
      resolved_at = case when p_status = 'resolved' then clock_timestamp() else null end,
      resolved_by = case when p_status = 'resolved' then v_actor else null end,
      updated_at = clock_timestamp()
  where id = p_event_id
  returning * into v_event;

  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    reason, before_state, after_state, evidence, session_id,
    mfa_authenticated_at, deduplication_key
  ) values (
    v_actor, 'operational_event_status_changed', 'client_operational_event', p_event_id::text,
    'operations.health.' || p_status, 'success', v_note,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object('status', p_status),
    jsonb_build_object('operation_id', p_operation_id),
    auth.jwt() ->> 'session_id', public.admin_current_mfa_authenticated_at(),
    v_deduplication_key
  );

  return to_jsonb(v_event) || jsonb_build_object('idempotent', false);
end
$$;

revoke all on function public.accept_client_operational_event(
  uuid, uuid, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.accept_client_operational_event(
  uuid, uuid, text, text, text, text, text, text, jsonb
) to service_role;

revoke all on function public.admin_list_operational_health(text,text,integer,integer)
  from public, anon;
grant execute on function public.admin_list_operational_health(text,text,integer,integer)
  to authenticated;

revoke all on function public.admin_update_operational_event(uuid,text,text,uuid)
  from public, anon;
grant execute on function public.admin_update_operational_event(uuid,text,text,uuid)
  to authenticated;

comment on table public.client_operational_events is
  'Sanitized, rate-limited client health signals. Never stores raw exception text, stack traces, query strings or form values.';

commit;
