-- Operational GDPR request workflow and post-acceptance UX support.
-- Requests are intentionally processed by an administrator: no browser action
-- can erase identity, contractual, audit or financial records automatically.

begin;

insert into public.admin_permission_definitions (
  permission_code, description, requires_recent_mfa
) values
  ('privacy.read', 'Read data-subject requests and their operational deadlines.', false),
  ('privacy.manage', 'Advance and resolve data-subject requests.', true),
  ('support_requests.read', 'Read public support requests.', false),
  ('support_requests.manage', 'Close and reopen public support requests.', false)
on conflict (permission_code) do update
set description = excluded.description,
    requires_recent_mfa = excluded.requires_recent_mfa;

insert into public.admin_role_permissions (role_code, permission_code) values
  ('support', 'privacy.read'),
  ('support', 'privacy.manage'),
  ('support', 'support_requests.read'),
  ('support', 'support_requests.manage'),
  ('super_admin', 'privacy.read'),
  ('super_admin', 'privacy.manage'),
  ('super_admin', 'support_requests.read'),
  ('super_admin', 'support_requests.manage')
on conflict do nothing;

-- The historical SET NULL action targets a primary key and therefore cannot
-- succeed. Make the intended lifecycle explicit: the public profile must be
-- handled by the controlled erasure procedure before an Auth identity can be
-- removed.
alter table public.users drop constraint if exists users_id_fkey;
alter table public.users
  add constraint users_id_fkey foreign key (id) references auth.users(id) on delete restrict;

create table public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  subject_id uuid not null,
  subject_email text not null,
  request_type text not null check (request_type in (
    'access', 'rectification', 'erasure', 'restriction', 'objection', 'portability', 'other'
  )),
  details text,
  status text not null default 'received' check (status in (
    'received', 'identity_check', 'in_progress', 'completed', 'refused', 'cancelled'
  )),
  identity_verification_status text not null default 'authenticated_session' check (
    identity_verification_status in ('authenticated_session', 'additional_check_required', 'verified')
  ),
  received_at timestamptz not null default clock_timestamp(),
  due_at timestamptz not null default (clock_timestamp() + interval '1 month'),
  identity_verified_at timestamptz,
  identity_verified_by uuid references public.admin_accounts(user_id) on delete restrict,
  responded_at timestamptz,
  internal_note text,
  last_updated_by uuid references public.admin_accounts(user_id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  constraint data_subject_request_email_check check (
    subject_email = lower(btrim(subject_email))
    and char_length(subject_email) between 3 and 254
  ),
  constraint data_subject_request_details_check check (
    details is null or char_length(btrim(details)) between 10 and 2000
  ),
  constraint data_subject_request_note_check check (
    internal_note is null or char_length(btrim(internal_note)) between 10 and 4000
  ),
  constraint data_subject_request_deadline_check check (due_at >= received_at),
  constraint data_subject_request_response_check check (
    (status in ('completed', 'refused', 'cancelled') and responded_at is not null)
    or (status not in ('completed', 'refused', 'cancelled') and responded_at is null)
  )
);

create unique index data_subject_requests_one_open_type_idx
  on public.data_subject_requests (user_id, request_type)
  where user_id is not null and status not in ('completed', 'refused', 'cancelled');
create index data_subject_requests_queue_idx
  on public.data_subject_requests (status, due_at, received_at);
create index data_subject_requests_subject_idx
  on public.data_subject_requests (subject_id, received_at desc);

create table public.data_subject_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.data_subject_requests(id) on delete restrict,
  -- Snapshot identifier, deliberately not a foreign key: the audit event must
  -- survive an approved identity erasure without blocking that erasure.
  actor_user_id uuid,
  actor_type text not null check (actor_type in ('subject', 'administrator', 'system')),
  previous_status text check (previous_status is null or previous_status in (
    'received', 'identity_check', 'in_progress', 'completed', 'refused', 'cancelled'
  )),
  new_status text not null check (new_status in (
    'received', 'identity_check', 'in_progress', 'completed', 'refused', 'cancelled'
  )),
  note text,
  operation_id uuid unique,
  created_at timestamptz not null default clock_timestamp()
);

create index data_subject_request_events_request_idx
  on public.data_subject_request_events (request_id, created_at);

create trigger data_subject_request_events_immutable
before update or delete on public.data_subject_request_events
for each row execute function public.reject_financial_definition_mutation();

alter table public.data_subject_requests enable row level security;
alter table public.data_subject_request_events enable row level security;
revoke all on public.data_subject_requests from public, anon, authenticated;
revoke all on public.data_subject_request_events from public, anon, authenticated;
grant all on public.data_subject_requests to service_role;
grant all on public.data_subject_request_events to service_role;

create or replace function public.submit_my_data_subject_request(
  p_request_type text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_request public.data_subject_requests%rowtype;
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform public.enforce_active_user_account();
  if p_request_type not in (
    'access', 'rectification', 'erasure', 'restriction', 'objection', 'portability', 'other'
  ) then
    raise exception 'Invalid data-subject request type' using errcode = '22023';
  end if;
  if v_details is not null and char_length(v_details) not between 10 and 2000 then
    raise exception 'Request details must contain between 10 and 2000 characters'
      using errcode = '22023';
  end if;

  select lower(email) into v_email from public.users where id = v_user_id;
  if v_email is null then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;

  begin
    insert into public.data_subject_requests (
      user_id, subject_id, subject_email, request_type, details
    ) values (
      v_user_id, v_user_id, v_email, p_request_type, v_details
    ) returning * into v_request;
  exception when unique_violation then
    raise exception 'A request of this type is already being processed'
      using errcode = '23505';
  end;

  insert into public.data_subject_request_events (
    request_id, actor_user_id, actor_type, previous_status, new_status, note
  ) values (
    v_request.id, v_user_id, 'subject', null, 'received',
    'Request submitted from an authenticated Glossed session.'
  );

  return jsonb_build_object(
    'id', v_request.id,
    'request_type', v_request.request_type,
    'status', v_request.status,
    'received_at', v_request.received_at,
    'due_at', v_request.due_at
  );
end
$$;

create or replace function public.get_my_data_subject_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform public.enforce_active_user_account();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', request.id,
    'request_type', request.request_type,
    'status', request.status,
    'received_at', request.received_at,
    'due_at', request.due_at,
    'responded_at', request.responded_at
  ) order by request.received_at desc), '[]'::jsonb)
  into v_items
  from public.data_subject_requests request
  where request.subject_id = v_user_id;

  return v_items;
end
$$;

create or replace function public.admin_list_data_subject_requests(
  p_status text default 'open',
  p_request_type text default 'all',
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total integer;
  v_items jsonb;
begin
  perform public.assert_admin_permission('privacy.read');
  if p_status not in ('all', 'open', 'history', 'received', 'identity_check', 'in_progress', 'completed', 'refused', 'cancelled') then
    raise exception 'Invalid privacy request status filter' using errcode = '22023';
  end if;
  if p_request_type not in ('all', 'access', 'rectification', 'erasure', 'restriction', 'objection', 'portability', 'other') then
    raise exception 'Invalid privacy request type filter' using errcode = '22023';
  end if;
  if char_length(v_query) > 200 then
    raise exception 'Search query is too long' using errcode = '22023';
  end if;

  select coalesce(max(item.total_count), 0)::integer,
    coalesce(jsonb_agg((to_jsonb(item) - 'total_count') order by item.due_at, item.received_at), '[]'::jsonb)
  into v_total, v_items
  from (
    select request.id, request.user_id, request.subject_id, request.subject_email,
      request.request_type, request.details, request.status,
      request.identity_verification_status, request.received_at, request.due_at,
      request.identity_verified_at, request.responded_at, request.updated_at,
      request.internal_note,
      user_profile.username, user_profile.first_name, user_profile.last_name,
      user_profile.business_name, user_profile.role,
      case
        when request.status not in ('completed', 'refused', 'cancelled')
          and request.due_at < clock_timestamp() then true
        else false
      end as overdue,
      count(*) over () as total_count
    from public.data_subject_requests request
    left join public.users user_profile on user_profile.id = request.user_id
    where (
      p_status = 'all'
      or (p_status = 'open' and request.status not in ('completed', 'refused', 'cancelled'))
      or (p_status = 'history' and request.status in ('completed', 'refused', 'cancelled'))
      or request.status = p_status
    )
      and (p_request_type = 'all' or request.request_type = p_request_type)
      and (
        v_query = ''
        or strpos(lower(request.id::text), v_query) > 0
        or strpos(lower(request.subject_email), v_query) > 0
        or strpos(lower(coalesce(user_profile.username, '')), v_query) > 0
        or strpos(lower(coalesce(user_profile.first_name, '')), v_query) > 0
        or strpos(lower(coalesce(user_profile.last_name, '')), v_query) > 0
        or strpos(lower(coalesce(user_profile.business_name, '')), v_query) > 0
      )
    order by request.due_at, request.received_at
    limit v_limit offset v_offset
  ) item;

  perform public.record_admin_read_audit(
    'privacy.requests.list', 'data_subject_request_collection', null,
    jsonb_build_object(
      'status', p_status, 'request_type', p_request_type,
      'query_length', char_length(v_query), 'result_count', jsonb_array_length(v_items),
      'offset', v_offset
    )
  );
  return jsonb_build_object('items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
end
$$;

create or replace function public.admin_update_data_subject_request(
  p_request_id uuid,
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
  v_request public.data_subject_requests%rowtype;
  v_existing public.data_subject_request_events%rowtype;
  v_previous_status text;
begin
  perform public.assert_admin_permission('privacy.manage', true);
  if p_request_id is null or p_operation_id is null then
    raise exception 'Request and operation identifiers are required' using errcode = '22023';
  end if;
  if p_status not in ('identity_check', 'in_progress', 'completed', 'refused', 'cancelled') then
    raise exception 'Invalid target status' using errcode = '22023';
  end if;
  if p_status in ('completed', 'refused', 'cancelled')
     and (v_note is null or char_length(v_note) not between 10 and 4000) then
    raise exception 'A detailed resolution note is required' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) not between 10 and 4000 then
    raise exception 'The note must contain between 10 and 4000 characters' using errcode = '22023';
  end if;

  select * into v_existing from public.data_subject_request_events
  where operation_id = p_operation_id;
  if found then
    if v_existing.request_id <> p_request_id or v_existing.new_status <> p_status
       or v_existing.actor_user_id <> v_actor then
      raise exception 'Operation identifier was already used with another payload'
        using errcode = '23505';
    end if;
    select * into v_request from public.data_subject_requests where id = p_request_id;
    return to_jsonb(v_request) || jsonb_build_object('idempotent', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('privacy-request:' || p_request_id::text, 0));
  select * into v_request from public.data_subject_requests
  where id = p_request_id for update;
  if not found then raise exception 'Data-subject request not found' using errcode = 'P0002'; end if;
  if v_request.status in ('completed', 'refused', 'cancelled') then
    raise exception 'A closed data-subject request cannot be changed' using errcode = '22023';
  end if;
  if p_status = 'completed' and v_request.status <> 'in_progress' then
    raise exception 'The request must be in progress before completion' using errcode = '22023';
  end if;
  if p_status = v_request.status then
    raise exception 'The request already has this status' using errcode = '22023';
  end if;
  v_previous_status := v_request.status;

  update public.data_subject_requests
  set status = p_status,
      identity_verification_status = case
        when p_status = 'identity_check' then 'additional_check_required'
        when p_status in ('in_progress', 'completed') then 'verified'
        else identity_verification_status
      end,
      identity_verified_at = case
        when p_status in ('in_progress', 'completed') then coalesce(identity_verified_at, clock_timestamp())
        else identity_verified_at
      end,
      identity_verified_by = case
        when p_status in ('in_progress', 'completed') then coalesce(identity_verified_by, v_actor)
        else identity_verified_by
      end,
      responded_at = case
        when p_status in ('completed', 'refused', 'cancelled') then clock_timestamp()
        else null
      end,
      internal_note = coalesce(v_note, internal_note),
      last_updated_by = v_actor,
      updated_at = clock_timestamp()
  where id = p_request_id
  returning * into v_request;

  insert into public.data_subject_request_events (
    request_id, actor_user_id, actor_type, previous_status, new_status, note, operation_id
  ) values (
    p_request_id, v_actor, 'administrator',
    v_previous_status, p_status, v_note, p_operation_id
  );

  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    reason, before_state, after_state, evidence, session_id,
    mfa_authenticated_at, deduplication_key
  ) values (
    v_actor, 'data_subject_request_status_changed', 'data_subject_request', p_request_id::text,
    'privacy.request.' || p_status, 'success', v_note,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object('status', p_status),
    jsonb_build_object('operation_id', p_operation_id, 'request_type', v_request.request_type),
    auth.jwt() ->> 'session_id', public.admin_current_mfa_authenticated_at(),
    'privacy-request-change:' || p_operation_id::text
  );

  return to_jsonb(v_request) || jsonb_build_object('idempotent', false);
end
$$;

-- Role-aware user search used by the administrator filter added in this PR.
create or replace function public.admin_list_users(
  p_query text default null,
  p_role text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total integer;
  v_items jsonb;
begin
  perform public.assert_admin_permission('users.read');
  if length(v_query) > 200 then raise exception 'Search query is too long' using errcode = '22023'; end if;
  if p_role not in ('all', 'client', 'pro') then
    raise exception 'Invalid user role filter' using errcode = '22023';
  end if;

  select coalesce(max(item.total_count), 0)::integer,
    coalesce(jsonb_agg((to_jsonb(item) - 'total_count') order by item.created_at desc), '[]'::jsonb)
  into v_total, v_items
  from (
    select u.id, u.email, u.username, u.first_name, u.last_name, u.business_name,
      u.role, u.active_role, u.verification_status, u.onboarding_completed,
      u.created_at, a.status as eligibility_status,
      c.creation_state as connect_creation_state,
      c.stripe_transfers_status, c.payouts_status,
      count(*) over () as total_count
    from public.users u
    left join lateral (
      select assessment.status from public.provider_eligibility_assessments assessment
      where assessment.provider_id = u.id
      order by assessment.revision desc, assessment.created_at desc limit 1
    ) a on true
    left join public.provider_connect_accounts c on c.provider_id = u.id
    where (p_role = 'all' or u.role = p_role)
      and (
        v_query = ''
        or strpos(lower(u.id::text), v_query) > 0
        or strpos(lower(coalesce(u.email, '')), v_query) > 0
        or strpos(lower(coalesce(u.username, '')), v_query) > 0
        or strpos(lower(coalesce(u.first_name, '')), v_query) > 0
        or strpos(lower(coalesce(u.last_name, '')), v_query) > 0
        or strpos(lower(coalesce(u.business_name, '')), v_query) > 0
      )
    order by u.created_at desc, u.id
    limit v_limit offset v_offset
  ) item;

  perform public.record_admin_read_audit(
    'users.list', 'user_collection', null,
    jsonb_build_object('query_length', length(v_query), 'role', p_role,
      'result_count', jsonb_array_length(v_items), 'offset', v_offset)
  );
  return jsonb_build_object('items', v_items, 'total', v_total,
    'limit', v_limit, 'offset', v_offset);
end
$$;

revoke all on function public.submit_my_data_subject_request(text,text) from public, anon;
grant execute on function public.submit_my_data_subject_request(text,text) to authenticated;
revoke all on function public.get_my_data_subject_requests() from public, anon;
grant execute on function public.get_my_data_subject_requests() to authenticated;
revoke all on function public.admin_list_data_subject_requests(text,text,text,integer,integer) from public, anon;
grant execute on function public.admin_list_data_subject_requests(text,text,text,integer,integer) to authenticated;
revoke all on function public.admin_update_data_subject_request(uuid,text,text,uuid) from public, anon;
grant execute on function public.admin_update_data_subject_request(uuid,text,text,uuid) to authenticated;
revoke all on function public.admin_list_users(text,text,integer,integer) from public, anon;
grant execute on function public.admin_list_users(text,text,integer,integer) to authenticated;

comment on table public.data_subject_requests is
  'Operational queue for authenticated GDPR rights requests. Resolution records workflow state; erasure is executed separately under the approved retention matrix.';

alter table public.contact_requests
  add column case_status text not null default 'open',
  add column resolution_note text,
  add column closed_at timestamptz,
  add column closed_by uuid references public.admin_accounts(user_id) on delete restrict,
  add constraint contact_requests_resolution_note_check check (
    resolution_note is null or char_length(btrim(resolution_note)) between 10 and 4000
  ),
  add constraint contact_requests_case_status_value_check check (
    case_status in ('open', 'closed')
  ),
  add constraint contact_requests_case_lifecycle_check check (
    (case_status = 'open' and closed_at is null and closed_by is null)
    or (case_status = 'closed' and closed_at is not null and closed_by is not null
        and resolution_note is not null)
  );

create index contact_requests_case_queue_idx
  on public.contact_requests (case_status, created_at desc);

create or replace function public.admin_list_contact_requests(
  p_case_status text default 'open',
  p_category text default 'all',
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total integer;
  v_items jsonb;
begin
  perform public.assert_admin_permission('support_requests.read');
  if p_case_status not in ('all', 'open', 'closed') then
    raise exception 'Invalid support request status filter' using errcode = '22023';
  end if;
  if p_category not in ('all', 'general', 'booking', 'account', 'professional', 'safety', 'privacy', 'partnership', 'press') then
    raise exception 'Invalid support request category filter' using errcode = '22023';
  end if;
  if char_length(v_query) > 200 then
    raise exception 'Search query is too long' using errcode = '22023';
  end if;

  select coalesce(max(item.total_count), 0)::integer,
    coalesce(jsonb_agg((to_jsonb(item) - 'total_count') order by item.created_at desc), '[]'::jsonb)
  into v_total, v_items
  from (
    select request.id, request.user_id, request.category, request.name, request.email,
      request.subject, request.message, request.locale, request.source_path,
      request.delivery_status, request.provider_message_id, request.delivery_error,
      request.created_at, request.emailed_at, request.updated_at,
      request.case_status, request.resolution_note, request.closed_at,
      count(*) over () as total_count
    from public.contact_requests request
    where (p_case_status = 'all' or request.case_status = p_case_status)
      and (p_category = 'all' or request.category = p_category)
      and (
        v_query = ''
        or strpos(lower(request.id::text), v_query) > 0
        or strpos(lower(request.name), v_query) > 0
        or strpos(lower(request.email), v_query) > 0
        or strpos(lower(coalesce(request.subject, '')), v_query) > 0
        or strpos(lower(request.message), v_query) > 0
      )
    order by request.created_at desc
    limit v_limit offset v_offset
  ) item;

  perform public.record_admin_read_audit(
    'support.requests.list', 'contact_request_collection', null,
    jsonb_build_object('case_status', p_case_status, 'category', p_category,
      'query_length', char_length(v_query), 'result_count', jsonb_array_length(v_items),
      'offset', v_offset)
  );
  return jsonb_build_object('items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
end
$$;

create or replace function public.admin_update_contact_request(
  p_request_id uuid,
  p_case_status text,
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
  v_request public.contact_requests%rowtype;
  v_deduplication_key text := 'support-request-change:' || p_operation_id::text;
begin
  perform public.assert_admin_permission('support_requests.manage');
  if p_request_id is null or p_operation_id is null
     or p_case_status not in ('open', 'closed') then
    raise exception 'Request, target status and operation identifier are required'
      using errcode = '22023';
  end if;
  if p_case_status = 'closed' and (v_note is null or char_length(v_note) not between 10 and 4000) then
    raise exception 'A detailed resolution note is required' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.admin_audit_log
    where deduplication_key = v_deduplication_key and admin_account_id = v_actor
      and entity_id = p_request_id::text and after_state ->> 'case_status' = p_case_status
  ) then
    select * into v_request from public.contact_requests where id = p_request_id;
    return to_jsonb(v_request) || jsonb_build_object('idempotent', true);
  end if;

  select * into v_request from public.contact_requests where id = p_request_id for update;
  if not found then raise exception 'Support request not found' using errcode = 'P0002'; end if;
  if v_request.case_status = p_case_status then
    raise exception 'The support request already has this status' using errcode = '22023';
  end if;

  update public.contact_requests
  set case_status = p_case_status,
      resolution_note = case when p_case_status = 'closed' then v_note else null end,
      closed_at = case when p_case_status = 'closed' then clock_timestamp() else null end,
      closed_by = case when p_case_status = 'closed' then v_actor else null end,
      updated_at = clock_timestamp()
  where id = p_request_id
  returning * into v_request;

  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    reason, before_state, after_state, evidence, session_id,
    mfa_authenticated_at, deduplication_key
  ) values (
    v_actor, 'support_request_status_changed', 'contact_request', p_request_id::text,
    'support.request.' || p_case_status, 'success', v_note,
    jsonb_build_object('case_status', case when p_case_status = 'closed' then 'open' else 'closed' end),
    jsonb_build_object('case_status', p_case_status),
    jsonb_build_object('operation_id', p_operation_id),
    auth.jwt() ->> 'session_id', public.admin_current_mfa_authenticated_at(),
    v_deduplication_key
  );

  return to_jsonb(v_request) || jsonb_build_object('idempotent', false);
end
$$;

revoke all on function public.admin_list_contact_requests(text,text,text,integer,integer) from public, anon;
grant execute on function public.admin_list_contact_requests(text,text,text,integer,integer) to authenticated;
revoke all on function public.admin_update_contact_request(uuid,text,text,uuid) from public, anon;
grant execute on function public.admin_update_contact_request(uuid,text,text,uuid) to authenticated;

commit;
