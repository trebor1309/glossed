-- Minimum operational controls for consumer/provider accounts and provider
-- eligibility. Account suspension is coordinated with Supabase Auth by the
-- admin-user-account-control Edge Function; this migration remains the source
-- of truth for authorization, history and immutable administration audit.

begin;

insert into public.admin_permission_definitions (
  permission_code, description, requires_recent_mfa
) values (
  'users.manage',
  'Suspend and reactivate consumer or provider accounts.',
  true
)
on conflict (permission_code) do update
set description = excluded.description,
    requires_recent_mfa = excluded.requires_recent_mfa;

insert into public.admin_role_permissions (role_code, permission_code) values
  ('support', 'users.manage'),
  ('super_admin', 'users.manage')
on conflict do nothing;

create table public.user_account_controls (
  user_id uuid primary key references public.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'suspended')),
  reason text,
  suspended_at timestamptz,
  suspended_by uuid references public.admin_accounts(user_id) on delete restrict,
  reactivated_at timestamptz,
  reactivated_by uuid references public.admin_accounts(user_id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  revision bigint not null default 1 check (revision > 0),
  constraint user_account_control_reason_check check (
    reason is null or length(trim(reason)) between 10 and 4000
  ),
  constraint user_account_control_status_check check (
    (status = 'active')
    or (status = 'suspended' and reason is not null and suspended_at is not null
        and suspended_by is not null)
  )
);

comment on table public.user_account_controls is
  'Current operational access state for consumer/provider accounts. Auth banning is applied by the trusted Edge Function before this state is committed.';

insert into public.user_account_controls (user_id)
select id from public.users
on conflict (user_id) do nothing;

create or replace function public.create_default_user_account_control()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.user_account_controls (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end
$$;

create trigger users_create_default_account_control
after insert on public.users
for each row execute function public.create_default_user_account_control();

create table public.admin_user_account_change_operations (
  operation_id uuid primary key,
  admin_id uuid not null references public.admin_accounts(user_id) on delete restrict,
  target_user_id uuid not null references public.users(id) on delete restrict,
  previous_status text not null check (previous_status in ('active', 'suspended')),
  target_status text not null check (target_status in ('active', 'suspended')),
  reason text not null check (length(trim(reason)) between 10 and 4000),
  operation_status text not null default 'requested'
    check (operation_status in ('requested', 'applied', 'failed')),
  provider_error text,
  result jsonb,
  session_id text,
  mfa_authenticated_at timestamptz,
  requested_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  constraint admin_user_account_change_transition_check
    check (previous_status <> target_status),
  constraint admin_user_account_change_error_length
    check (provider_error is null or length(provider_error) <= 4000),
  constraint admin_user_account_change_result_object
    check (result is null or jsonb_typeof(result) = 'object')
);

create index admin_user_account_change_target_time_idx
  on public.admin_user_account_change_operations(target_user_id, requested_at desc);

create table public.user_account_control_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique
    references public.admin_user_account_change_operations(operation_id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  actor_admin_id uuid not null references public.admin_accounts(user_id) on delete restrict,
  previous_status text not null check (previous_status in ('active', 'suspended')),
  new_status text not null check (new_status in ('active', 'suspended')),
  reason text not null check (length(trim(reason)) between 10 and 4000),
  created_at timestamptz not null default clock_timestamp(),
  constraint user_account_control_event_transition_check
    check (previous_status <> new_status)
);

create index user_account_control_events_user_time_idx
  on public.user_account_control_events(user_id, created_at desc);

create trigger user_account_control_events_immutable
before update or delete on public.user_account_control_events
for each row execute function public.reject_financial_definition_mutation();

alter table public.user_account_controls enable row level security;
alter table public.admin_user_account_change_operations enable row level security;
alter table public.user_account_control_events enable row level security;

revoke all on public.user_account_controls from public, anon, authenticated;
revoke all on public.admin_user_account_change_operations from public, anon, authenticated;
revoke all on public.user_account_control_events from public, anon, authenticated;
grant all on public.user_account_controls to service_role;
grant all on public.admin_user_account_change_operations to service_role;
grant all on public.user_account_control_events to service_role;

create or replace function public.is_user_account_active(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (
    select 1 from public.user_account_controls control
    where control.user_id = p_user_id and control.status = 'suspended'
  )
$$;

create or replace function public.is_current_user_account_active()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is null or public.is_user_account_active(auth.uid())
$$;

create or replace function public.enforce_active_user_account()
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.role() = 'authenticated'
     and auth.uid() is not null
     and not public.is_user_account_active(auth.uid()) then
    raise exception 'Account suspended' using errcode = '42501';
  end if;
end
$$;

revoke all on function public.is_user_account_active(uuid) from public, anon, authenticated;
grant execute on function public.is_user_account_active(uuid) to service_role;
revoke all on function public.is_current_user_account_active() from public, anon;
grant execute on function public.is_current_user_account_active() to authenticated, service_role;
revoke all on function public.enforce_active_user_account() from public;
grant execute on function public.enforce_active_user_account() to anon, authenticated, service_role;

-- Data API requests from a suspended consumer/provider are rejected before the
-- requested table or RPC is reached. Edge Functions perform the same check in
-- requireUser, and the restrictive Storage policies below cover private files.
alter role authenticator set pgrst.db_pre_request = 'public.enforce_active_user_account';
notify pgrst, 'reload config';

create policy user_account_active_storage_select
on storage.objects as restrictive for select to authenticated
using (public.is_current_user_account_active());
create policy user_account_active_storage_insert
on storage.objects as restrictive for insert to authenticated
with check (public.is_current_user_account_active());
create policy user_account_active_storage_update
on storage.objects as restrictive for update to authenticated
using (public.is_current_user_account_active())
with check (public.is_current_user_account_active());
create policy user_account_active_storage_delete
on storage.objects as restrictive for delete to authenticated
using (public.is_current_user_account_active());

create or replace function public.admin_begin_user_account_change(
  p_target_user_id uuid,
  p_target_status text,
  p_reason text,
  p_operation_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_control public.user_account_controls%rowtype;
  v_operation public.admin_user_account_change_operations%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  perform public.assert_admin_permission('users.manage', true);
  if p_target_user_id is null or p_operation_id is null
     or p_target_status not in ('active', 'suspended')
     or length(v_reason) not between 10 and 4000 then
    raise exception 'A target, valid status, operation identifier and detailed reason are required'
      using errcode = '22023';
  end if;
  if p_target_user_id = v_actor then
    raise exception 'Administrators cannot control their own user account'
      using errcode = '42501';
  end if;
  if exists (select 1 from public.admin_accounts where user_id = p_target_user_id) then
    raise exception 'Administrator identities must be managed from administrator controls'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.users where id = p_target_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'user-account-control:' || p_target_user_id::text, 0
  ));
  select * into v_operation from public.admin_user_account_change_operations
  where operation_id = p_operation_id for update;
  if found then
    if v_operation.admin_id <> v_actor
       or v_operation.target_user_id <> p_target_user_id
       or v_operation.target_status <> p_target_status
       or v_operation.reason <> v_reason then
      raise exception 'Operation identifier was already used with another payload'
        using errcode = '23505';
    end if;
    if v_operation.operation_status = 'failed' then
      update public.admin_user_account_change_operations
      set operation_status = 'requested', provider_error = null, completed_at = null
      where operation_id = p_operation_id returning * into v_operation;
    end if;
    return to_jsonb(v_operation) || jsonb_build_object(
      'idempotent', v_operation.operation_status = 'applied'
    );
  end if;

  select * into v_control from public.user_account_controls
  where user_id = p_target_user_id for update;
  if not found then
    insert into public.user_account_controls (user_id)
    values (p_target_user_id) returning * into v_control;
  end if;
  if v_control.status = p_target_status then
    raise exception 'User account already has the requested status' using errcode = '22023';
  end if;

  insert into public.admin_user_account_change_operations (
    operation_id, admin_id, target_user_id, previous_status, target_status,
    reason, session_id, mfa_authenticated_at
  ) values (
    p_operation_id, v_actor, p_target_user_id, v_control.status, p_target_status,
    v_reason, auth.jwt() ->> 'session_id', public.admin_current_mfa_authenticated_at()
  ) returning * into v_operation;

  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    reason, before_state, after_state, evidence, session_id,
    mfa_authenticated_at, deduplication_key
  ) values (
    v_actor, 'user_account_change_requested', 'user_account', p_target_user_id::text,
    'users.' || p_target_status || '.request', 'success', v_reason,
    jsonb_build_object('status', v_control.status, 'revision', v_control.revision),
    jsonb_build_object('status', p_target_status),
    jsonb_build_object('operation_id', p_operation_id, 'auth_sync_pending', true),
    v_operation.session_id, v_operation.mfa_authenticated_at,
    'user-account-change-request:' || p_operation_id::text
  );

  return to_jsonb(v_operation) || jsonb_build_object('idempotent', false);
end
$$;

create or replace function public.complete_admin_user_account_change(
  p_operation_id uuid,
  p_auth_provider_evidence jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_operation public.admin_user_account_change_operations%rowtype;
  v_control public.user_account_controls%rowtype;
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_operation_id is null
     or jsonb_typeof(coalesce(p_auth_provider_evidence, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_auth_provider_evidence, '{}'::jsonb)::text) > 8192 then
    raise exception 'Invalid account change completion' using errcode = '22023';
  end if;

  select * into v_operation from public.admin_user_account_change_operations
  where operation_id = p_operation_id for update;
  if not found then raise exception 'Account change operation not found' using errcode = 'P0002'; end if;
  if v_operation.operation_status = 'applied' then
    return v_operation.result || jsonb_build_object('idempotent', true);
  end if;
  if v_operation.operation_status <> 'requested' then
    raise exception 'Account change operation is not pending' using errcode = '55000';
  end if;

  select * into v_control from public.user_account_controls
  where user_id = v_operation.target_user_id for update;
  if not found or v_control.status <> v_operation.previous_status then
    raise exception 'User account state changed while Auth synchronization was running'
      using errcode = '40001';
  end if;

  update public.user_account_controls set
    status = v_operation.target_status,
    reason = v_operation.reason,
    suspended_at = case when v_operation.target_status = 'suspended'
      then clock_timestamp() else suspended_at end,
    suspended_by = case when v_operation.target_status = 'suspended'
      then v_operation.admin_id else suspended_by end,
    reactivated_at = case when v_operation.target_status = 'active'
      then clock_timestamp() else reactivated_at end,
    reactivated_by = case when v_operation.target_status = 'active'
      then v_operation.admin_id else reactivated_by end,
    updated_at = clock_timestamp(), revision = revision + 1
  where user_id = v_operation.target_user_id
  returning * into v_control;

  insert into public.user_account_control_events (
    operation_id, user_id, actor_admin_id, previous_status, new_status, reason
  ) values (
    v_operation.operation_id, v_operation.target_user_id, v_operation.admin_id,
    v_operation.previous_status, v_operation.target_status, v_operation.reason
  );

  v_result := jsonb_build_object(
    'operation_id', v_operation.operation_id,
    'user_id', v_operation.target_user_id,
    'status', v_control.status,
    'reason', v_control.reason,
    'revision', v_control.revision,
    'updated_at', v_control.updated_at,
    'idempotent', false
  );
  update public.admin_user_account_change_operations set
    operation_status = 'applied', result = v_result,
    provider_error = null, completed_at = clock_timestamp()
  where operation_id = v_operation.operation_id;

  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    reason, before_state, after_state, evidence, session_id,
    mfa_authenticated_at, deduplication_key
  ) values (
    v_operation.admin_id, 'user_account_status_changed', 'user_account',
    v_operation.target_user_id::text, 'users.' || v_operation.target_status,
    'success', v_operation.reason,
    jsonb_build_object('status', v_operation.previous_status),
    v_result - 'idempotent',
    coalesce(p_auth_provider_evidence, '{}'::jsonb)
      || jsonb_build_object('operation_id', v_operation.operation_id),
    v_operation.session_id, v_operation.mfa_authenticated_at,
    'user-account-change:' || v_operation.operation_id::text
  );
  return v_result;
end
$$;

create or replace function public.fail_admin_user_account_change(
  p_operation_id uuid,
  p_error text,
  p_evidence jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_operation public.admin_user_account_change_operations%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_operation from public.admin_user_account_change_operations
  where operation_id = p_operation_id for update;
  if not found or v_operation.operation_status = 'applied' then return; end if;
  update public.admin_user_account_change_operations set
    operation_status = 'failed', provider_error = left(coalesce(p_error, 'Unknown error'), 4000),
    completed_at = clock_timestamp()
  where operation_id = p_operation_id;
  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    reason, before_state, after_state, evidence, session_id,
    mfa_authenticated_at, deduplication_key
  ) values (
    v_operation.admin_id, 'user_account_change_failed', 'user_account',
    v_operation.target_user_id::text, 'users.' || v_operation.target_status,
    'failed', v_operation.reason,
    jsonb_build_object('status', v_operation.previous_status),
    jsonb_build_object('status', v_operation.previous_status),
    coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object(
      'operation_id', p_operation_id, 'provider_error', left(coalesce(p_error, 'Unknown error'), 4000)
    ),
    v_operation.session_id, v_operation.mfa_authenticated_at,
    'user-account-change-failed:' || p_operation_id::text
  ) on conflict (deduplication_key) do nothing;
end
$$;

create or replace function public.admin_create_provider_eligibility_policy_version(
  p_version text,
  p_payload jsonb,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := auth.uid();
  v_policy public.provider_eligibility_policy_versions%rowtype;
begin
  perform public.assert_admin_permission('configuration.manage', true);
  if coalesce(jsonb_typeof(p_payload), '') <> 'object'
     or length(trim(coalesce(p_reason, ''))) not between 10 and 4000 then
    raise exception 'A valid eligibility policy and detailed reason are required'
      using errcode = '22023';
  end if;
  insert into public.provider_eligibility_policy_versions (
    version, jurisdiction_code, residence_country_code, service_country_code,
    provider_status_code, service_category_code, requirement_definitions,
    effective_from, effective_until, created_by, notes
  ) values (
    p_version,
    upper(p_payload ->> 'jurisdiction_code'),
    nullif(upper(trim(p_payload ->> 'residence_country_code')), ''),
    nullif(upper(trim(p_payload ->> 'service_country_code')), ''),
    nullif(lower(trim(p_payload ->> 'provider_status_code')), ''),
    nullif(lower(trim(p_payload ->> 'service_category_code')), ''),
    coalesce(p_payload -> 'requirement_definitions', '[]'::jsonb),
    (p_payload ->> 'effective_from')::timestamptz,
    nullif(p_payload ->> 'effective_until', '')::timestamptz,
    v_admin,
    coalesce(nullif(trim(p_payload ->> 'notes'), ''), trim(p_reason))
  ) returning * into v_policy;
  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    reason, after_state, deduplication_key
  ) values (
    v_admin, 'eligibility_policy_created', 'provider_eligibility_policy',
    v_policy.version, 'configuration.eligibility_policy.create', 'success',
    trim(p_reason), to_jsonb(v_policy), 'eligibility-policy-created:' || v_policy.version
  );
  return to_jsonb(v_policy);
end
$$;

create or replace function public.admin_record_provider_eligibility_assessment(
  p_provider_id uuid,
  p_policy_version text,
  p_service_category_code text,
  p_status text,
  p_valid_until timestamptz,
  p_reason text,
  p_operation_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := auth.uid();
  v_policy public.provider_eligibility_policy_versions%rowtype;
  v_declaration public.provider_eligibility_declarations%rowtype;
  v_existing public.provider_eligibility_assessments%rowtype;
  v_result public.provider_eligibility_assessments%rowtype;
  v_category text := lower(trim(coalesce(p_service_category_code, '*')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_revision integer;
  v_key text;
begin
  perform public.assert_admin_permission('verification.review');
  if p_provider_id is null or p_operation_id is null
     or p_status not in ('eligible', 'ineligible', 'review_required')
     or (v_category <> '*' and v_category !~ '^[a-z][a-z0-9_.-]{1,99}$')
     or length(v_reason) not between 10 and 4000 then
    raise exception 'A provider, decision, category, operation identifier and detailed reason are required'
      using errcode = '22023';
  end if;
  if p_status = 'eligible' and (p_valid_until is null or p_valid_until <= clock_timestamp()) then
    raise exception 'An eligible assessment requires a future validity date'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.users where id = p_provider_id and role = 'pro') then
    raise exception 'Professional profile not found' using errcode = 'P0002';
  end if;
  select * into v_declaration from public.provider_eligibility_declarations
  where provider_id = p_provider_id order by revision desc, created_at desc limit 1;
  if not found then
    raise exception 'The provider must submit an eligibility declaration before assessment'
      using errcode = '55000';
  end if;
  select * into v_policy from public.provider_eligibility_policy_versions
  where version = p_policy_version
    and effective_from <= clock_timestamp()
    and (effective_until is null or effective_until > clock_timestamp());
  if not found then raise exception 'Active eligibility policy not found' using errcode = 'P0002'; end if;
  if (v_policy.residence_country_code is not null
      and v_policy.residence_country_code <> v_declaration.residence_country_code)
     or (v_policy.service_country_code is not null
      and v_policy.service_country_code <> v_declaration.service_country_code)
     or (v_policy.provider_status_code is not null
      and v_policy.provider_status_code <> v_declaration.provider_status_code)
     or (v_policy.service_category_code is not null
      and v_policy.service_category_code <> v_category) then
    raise exception 'Eligibility policy is not applicable to this provider declaration'
      using errcode = '23514';
  end if;

  v_key := 'admin-eligibility-assessment:' || p_operation_id::text;
  select * into v_existing from public.provider_eligibility_assessments
  where deduplication_key = v_key;
  if found then
    if v_existing.provider_id <> p_provider_id
       or v_existing.policy_version <> p_policy_version
       or v_existing.service_category_code <> v_category
       or v_existing.status <> p_status
       or v_existing.valid_until is distinct from p_valid_until
       or v_existing.reason <> v_reason then
      raise exception 'Operation identifier was already used with another eligibility decision'
        using errcode = '23505';
    end if;
    return to_jsonb(v_existing) || jsonb_build_object('idempotent', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'eligibility-assessment:' || p_provider_id::text || ':' || p_policy_version
      || ':' || v_declaration.service_country_code || ':' || v_category, 0
  ));
  select coalesce(max(revision), 0) + 1 into v_revision
  from public.provider_eligibility_assessments
  where provider_id = p_provider_id and policy_version = p_policy_version
    and service_country_code = v_declaration.service_country_code
    and service_category_code = v_category;

  insert into public.provider_eligibility_assessments (
    provider_id, policy_version, declaration_id, service_country_code,
    service_category_code, revision, status, valid_until, reason, evidence,
    actor_type, actor_user_id, deduplication_key
  ) values (
    p_provider_id, p_policy_version, v_declaration.id,
    v_declaration.service_country_code, v_category, v_revision, p_status,
    p_valid_until, v_reason,
    jsonb_build_object('source', 'admin_backoffice', 'operation_id', p_operation_id),
    'admin', v_admin, v_key
  ) returning * into v_result;

  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    reason, before_state, after_state, evidence, session_id,
    mfa_authenticated_at, deduplication_key
  ) values (
    v_admin, 'provider_eligibility_assessed', 'provider_eligibility',
    p_provider_id::text, 'verification.eligibility.assess', 'success', v_reason,
    coalesce((select to_jsonb(previous) from public.provider_eligibility_assessments previous
      where previous.provider_id = p_provider_id and previous.id <> v_result.id
      order by previous.created_at desc limit 1), '{}'::jsonb),
    to_jsonb(v_result),
    jsonb_build_object('operation_id', p_operation_id, 'declaration_id', v_declaration.id),
    auth.jwt() ->> 'session_id', public.admin_current_mfa_authenticated_at(),
    'provider-eligibility-assessed:' || p_operation_id::text
  );
  return to_jsonb(v_result) || jsonb_build_object('idempotent', false);
end
$$;

create or replace function public.admin_get_user_control_context(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_control jsonb;
  v_account_history jsonb;
  v_eligibility_history jsonb;
  v_policies jsonb;
  v_declaration public.provider_eligibility_declarations%rowtype;
begin
  perform public.assert_admin_permission('users.read');
  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  select to_jsonb(control) into v_control from public.user_account_controls control
  where control.user_id = p_user_id;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at desc), '[]'::jsonb)
  into v_account_history from (
    select event.*, actor.display_name as actor_label
    from public.user_account_control_events event
    left join public.admin_accounts actor on actor.user_id = event.actor_admin_id
    where event.user_id = p_user_id order by event.created_at desc limit 25
  ) item;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at desc), '[]'::jsonb)
  into v_eligibility_history from (
    select assessment.id, assessment.policy_version, assessment.declaration_id,
      assessment.service_country_code, assessment.service_category_code,
      assessment.revision, assessment.status, assessment.valid_until,
      assessment.reason, assessment.actor_type, assessment.actor_user_id,
      actor.display_name as actor_label, assessment.created_at
    from public.provider_eligibility_assessments assessment
    left join public.admin_accounts actor on actor.user_id = assessment.actor_user_id
    where assessment.provider_id = p_user_id
    order by assessment.created_at desc limit 25
  ) item;
  select * into v_declaration from public.provider_eligibility_declarations
  where provider_id = p_user_id order by revision desc, created_at desc limit 1;
  if found then
    select coalesce(jsonb_agg(to_jsonb(policy) order by policy.effective_from desc), '[]'::jsonb)
    into v_policies from public.provider_eligibility_policy_versions policy
    where policy.effective_from <= clock_timestamp()
      and (policy.effective_until is null or policy.effective_until > clock_timestamp())
      and (policy.residence_country_code is null
        or policy.residence_country_code = v_declaration.residence_country_code)
      and (policy.service_country_code is null
        or policy.service_country_code = v_declaration.service_country_code)
      and (policy.provider_status_code is null
        or policy.provider_status_code = v_declaration.provider_status_code);
  else
    v_policies := '[]'::jsonb;
  end if;
  perform public.record_admin_read_audit(
    'user.control-context', 'user', p_user_id::text,
    jsonb_build_object('account_event_count', jsonb_array_length(v_account_history),
      'eligibility_event_count', jsonb_array_length(v_eligibility_history),
      'applicable_policy_count', jsonb_array_length(v_policies))
  );
  return jsonb_build_object(
    'account_control', coalesce(v_control, jsonb_build_object(
      'user_id', p_user_id, 'status', 'active', 'revision', 0)),
    'account_control_history', v_account_history,
    'eligibility_assessment_history', v_eligibility_history,
    'applicable_eligibility_policies', v_policies
  );
end
$$;

revoke all on function public.admin_begin_user_account_change(uuid,text,text,uuid)
from public, anon;
grant execute on function public.admin_begin_user_account_change(uuid,text,text,uuid)
to authenticated;
revoke all on function public.complete_admin_user_account_change(uuid,jsonb)
from public, anon, authenticated;
grant execute on function public.complete_admin_user_account_change(uuid,jsonb)
to service_role;
revoke all on function public.fail_admin_user_account_change(uuid,text,jsonb)
from public, anon, authenticated;
grant execute on function public.fail_admin_user_account_change(uuid,text,jsonb)
to service_role;
revoke all on function public.admin_create_provider_eligibility_policy_version(text,jsonb,text)
from public, anon;
grant execute on function public.admin_create_provider_eligibility_policy_version(text,jsonb,text)
to authenticated;
revoke all on function public.admin_record_provider_eligibility_assessment(uuid,text,text,text,timestamptz,text,uuid)
from public, anon;
grant execute on function public.admin_record_provider_eligibility_assessment(uuid,text,text,text,timestamptz,text,uuid)
to authenticated;
revoke all on function public.admin_get_user_control_context(uuid) from public, anon;
grant execute on function public.admin_get_user_control_context(uuid) to authenticated;

commit;
