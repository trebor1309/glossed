-- Controlled administrator account lifecycle. Auth identities are provisioned
-- outside the browser by a trusted process; this migration only lets a
-- super-administrator activate identities explicitly marked as administrative.

insert into public.admin_permission_definitions (
  permission_code, description, requires_recent_mfa
) values (
  'administrators.read', 'Read administrator accounts, roles and permissions.', false
) on conflict (permission_code) do nothing;

insert into public.admin_role_permissions (role_code, permission_code)
values ('super_admin', 'administrators.read')
on conflict (role_code, permission_code) do nothing;

create table public.admin_account_change_previews (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admin_accounts(user_id) on delete restrict,
  action text not null check (action in ('activate', 'update', 'set_status')),
  target_user_id uuid not null references auth.users(id) on delete restrict,
  target_email text not null,
  expected_revision bigint,
  before_state jsonb not null default '{}'::jsonb,
  proposed_state jsonb not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  execution_operation_id uuid unique,
  execution_result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint admin_account_change_preview_email_check
    check (target_email = lower(trim(target_email))),
  constraint admin_account_change_preview_expiry_check
    check (expires_at > created_at),
  constraint admin_account_change_preview_payload_size_check check (
    octet_length(before_state::text) <= 32768
    and octet_length(proposed_state::text) <= 32768
  ),
  constraint admin_account_change_preview_consumption_check check (
    (consumed_at is null and execution_operation_id is null and execution_result is null)
    or
    (consumed_at is not null and execution_operation_id is not null and execution_result is not null)
  )
);

create index admin_account_change_previews_actor_time_idx
  on public.admin_account_change_previews(admin_id, created_at desc);
create index admin_account_change_previews_target_time_idx
  on public.admin_account_change_previews(target_user_id, created_at desc);

alter table public.admin_account_change_previews enable row level security;
revoke all on public.admin_account_change_previews from public, anon, authenticated;
grant all on public.admin_account_change_previews to service_role;

create or replace function public.admin_list_administrators(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  perform public.assert_admin_permission('administrators.read');
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'Invalid administrator search pagination' using errcode = '22023';
  end if;

  with filtered as (
    select account.user_id, auth_user.email, account.display_name, account.status,
      account.created_by, account.created_at, account.updated_at,
      account.last_authenticated_at, account.revision,
      coalesce(array_agg(role.role_code order by role.role_code)
        filter (where role.role_code is not null), array[]::text[]) roles
    from public.admin_accounts account
    join auth.users auth_user on auth_user.id = account.user_id
    left join public.admin_account_roles role on role.user_id = account.user_id
    where nullif(trim(coalesce(p_query, '')), '') is null
      or concat_ws(' ', auth_user.email, account.display_name, account.user_id::text,
        account.status) ilike '%' || trim(p_query) || '%'
      or exists (select 1 from public.admin_account_roles searched_role
        where searched_role.user_id = account.user_id
          and searched_role.role_code ilike '%' || trim(p_query) || '%')
    group by account.user_id, auth_user.email, account.display_name, account.status,
      account.created_by, account.created_at, account.updated_at,
      account.last_authenticated_at, account.revision
  ), page as (
    select filtered.*, count(*) over() total_count
    from filtered
    order by coalesce(display_name, email), user_id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'total', coalesce(max(total_count), 0),
    'items', coalesce(jsonb_agg(to_jsonb(page) - 'total_count'
      order by coalesce(display_name, email), user_id), '[]'::jsonb)
  ) into v_result from page;

  perform public.record_admin_read_audit(
    'administrators.list', 'admin_account_collection', null,
    jsonb_build_object('query', p_query, 'limit', p_limit, 'offset', p_offset)
  );
  return v_result;
end
$$;

create or replace function public.admin_get_administrator_catalog()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  perform public.assert_admin_permission('administrators.read');
  select jsonb_build_object(
    'roles', coalesce((
      select jsonb_agg(to_jsonb(role_definition) || jsonb_build_object(
        'permissions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'permission_code', permission.permission_code,
            'description', permission.description,
            'requires_recent_mfa', permission.requires_recent_mfa
          ) order by permission.permission_code)
          from public.admin_role_permissions role_permission
          join public.admin_permission_definitions permission
            on permission.permission_code = role_permission.permission_code
          where role_permission.role_code = role_definition.role_code
        ), '[]'::jsonb)
      ) order by role_definition.role_code)
      from public.admin_role_definitions role_definition
    ), '[]'::jsonb),
    'activation_requirements', jsonb_build_object(
      'trusted_identity_required', true,
      'account_type', 'admin',
      'confirmed_email_required', true,
      'consumer_profile_forbidden', true
    )
  ) into v_result;
  perform public.record_admin_read_audit(
    'administrators.catalog', 'admin_role_catalog', 'global', '{}'::jsonb
  );
  return v_result;
end
$$;

create or replace function public.admin_preview_administrator_change(
  p_action text,
  p_target_user_id uuid default null,
  p_target_email text default null,
  p_display_name text default null,
  p_roles text[] default null,
  p_status text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_target_id uuid;
  v_email text;
  v_auth_user auth.users%rowtype;
  v_account public.admin_accounts%rowtype;
  v_roles text[];
  v_current_roles text[] := array[]::text[];
  v_before jsonb := '{}'::jsonb;
  v_proposed jsonb;
  v_preview public.admin_account_change_previews%rowtype;
  v_max_age integer;
begin
  perform public.assert_admin_permission('administrators.manage', true);
  if p_action not in ('activate', 'update', 'set_status') then
    raise exception 'Unsupported administrator action' using errcode = '22023';
  end if;

  if p_action = 'activate' then
    v_email := lower(trim(coalesce(p_target_email, '')));
    if v_email = '' then
      raise exception 'A target email is required' using errcode = '22023';
    end if;
    select * into v_auth_user from auth.users
      where lower(email) = v_email for update;
    if not found then
      raise exception 'Trusted administrator identity not found' using errcode = 'P0002';
    end if;
    v_target_id := v_auth_user.id;
    if v_auth_user.email_confirmed_at is null
       or v_auth_user.raw_app_meta_data ->> 'account_type' is distinct from 'admin'
       or exists (select 1 from public.users app_user where app_user.id = v_target_id) then
      raise exception 'Identity is not eligible for administrator activation' using errcode = '42501';
    end if;
    if exists (select 1 from public.admin_accounts where user_id = v_target_id) then
      raise exception 'Administrator account already exists' using errcode = '23505';
    end if;
  else
    if p_target_user_id is null then
      raise exception 'A target administrator is required' using errcode = '22023';
    end if;
    v_target_id := p_target_user_id;
    select * into v_account from public.admin_accounts
      where user_id = v_target_id for update;
    if not found then
      raise exception 'Administrator account not found' using errcode = 'P0002';
    end if;
    select * into strict v_auth_user from auth.users where id = v_target_id;
    v_email := lower(v_auth_user.email);
    select coalesce(array_agg(role_code order by role_code), array[]::text[])
      into v_current_roles from public.admin_account_roles where user_id = v_target_id;
    v_before := jsonb_build_object(
      'user_id', v_target_id, 'email', v_email, 'display_name', v_account.display_name,
      'status', v_account.status, 'roles', to_jsonb(v_current_roles),
      'revision', v_account.revision
    );
  end if;

  if v_target_id = v_actor then
    raise exception 'Administrators cannot change their own account or roles'
      using errcode = '42501';
  end if;

  if p_action in ('activate', 'update') then
    select coalesce(array_agg(distinct requested_role order by requested_role), array[]::text[])
      into v_roles from unnest(coalesce(p_roles, array[]::text[])) requested_role;
    if cardinality(v_roles) = 0
       or exists (select 1 from unnest(v_roles) requested_role
         where not exists (select 1 from public.admin_role_definitions definition
           where definition.role_code = requested_role)) then
      raise exception 'At least one valid administrator role is required' using errcode = '22023';
    end if;
  else
    v_roles := v_current_roles;
  end if;

  if p_action = 'set_status' then
    if p_status not in ('active', 'suspended', 'disabled') or p_status = v_account.status then
      raise exception 'A different valid administrator status is required' using errcode = '22023';
    end if;
  elsif p_status is not null then
    raise exception 'Status can only be changed by the set_status action' using errcode = '22023';
  end if;

  v_proposed := jsonb_build_object(
    'user_id', v_target_id,
    'email', v_email,
    'display_name', case when p_action = 'set_status' then v_account.display_name
      else nullif(trim(coalesce(p_display_name, '')), '') end,
    'status', case when p_action = 'activate' then 'active'
      when p_action = 'set_status' then p_status else v_account.status end,
    'roles', to_jsonb(v_roles)
  );

  select financial_reauthentication_max_age_seconds into v_max_age
  from public.admin_security_policy_versions
  where effective_from <= clock_timestamp()
    and (effective_until is null or effective_until > clock_timestamp())
  order by effective_from desc limit 1;

  insert into public.admin_account_change_previews (
    admin_id, action, target_user_id, target_email, expected_revision,
    before_state, proposed_state, expires_at
  ) values (
    v_actor, p_action, v_target_id, v_email,
    case when p_action = 'activate' then null else v_account.revision end,
    v_before, v_proposed,
    clock_timestamp() + make_interval(secs => coalesce(v_max_age, 300))
  ) returning * into v_preview;

  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    before_state, after_state, session_id, mfa_authenticated_at, deduplication_key
  ) values (
    v_actor, 'administrator_change_previewed', 'admin_account', v_target_id::text,
    'administrators.' || p_action || '.preview', 'success', v_before, v_proposed,
    auth.jwt() ->> 'session_id', public.admin_current_mfa_authenticated_at(),
    'admin-account-preview:' || v_preview.id::text
  );

  return to_jsonb(v_preview);
end
$$;

create or replace function public.admin_execute_administrator_change(
  p_preview_id uuid,
  p_reason text,
  p_operation_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_preview public.admin_account_change_previews%rowtype;
  v_account public.admin_accounts%rowtype;
  v_auth_user auth.users%rowtype;
  v_roles text[];
  v_status text;
  v_display_name text;
  v_result jsonb;
begin
  perform public.assert_admin_permission('administrators.manage', true);
  if p_operation_id is null then
    raise exception 'An operation identifier is required' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 10 and 4000 then
    raise exception 'A detailed justification is required' using errcode = '22023';
  end if;

  select * into v_preview from public.admin_account_change_previews
    where id = p_preview_id for update;
  if not found then
    raise exception 'Administrator change preview not found' using errcode = 'P0002';
  end if;
  if v_preview.admin_id <> v_actor then
    raise exception 'Preview belongs to another administrator' using errcode = '42501';
  end if;
  if v_preview.consumed_at is not null then
    if v_preview.execution_operation_id <> p_operation_id then
      raise exception 'Preview already consumed by another operation' using errcode = '23505';
    end if;
    return v_preview.execution_result || jsonb_build_object('idempotent', true);
  end if;
  if v_preview.expires_at < clock_timestamp() then
    raise exception 'Administrator change preview expired' using errcode = '22023';
  end if;
  if v_preview.target_user_id = v_actor then
    raise exception 'Administrators cannot change their own account or roles'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('admin-account-management:last-super-admin'));
  select * into strict v_auth_user from auth.users
    where id = v_preview.target_user_id for update;
  select array_agg(value order by value) into v_roles
    from jsonb_array_elements_text(v_preview.proposed_state -> 'roles') value;
  v_status := v_preview.proposed_state ->> 'status';
  v_display_name := nullif(trim(v_preview.proposed_state ->> 'display_name'), '');
  if v_status = 'active' and cardinality(v_roles) = 0 then
    raise exception 'An active administrator must retain at least one role'
      using errcode = '23514';
  end if;

  if v_preview.action = 'activate' then
    if v_auth_user.email_confirmed_at is null
       or v_auth_user.raw_app_meta_data ->> 'account_type' is distinct from 'admin'
       or exists (select 1 from public.users app_user where app_user.id = v_preview.target_user_id)
       or exists (select 1 from public.admin_accounts where user_id = v_preview.target_user_id) then
      raise exception 'Administrator activation prerequisites changed after preview'
        using errcode = '40001';
    end if;
    insert into public.admin_accounts (
      user_id, status, display_name, created_by, created_at, updated_at
    ) values (
      v_preview.target_user_id, 'active', v_display_name, v_actor,
      clock_timestamp(), clock_timestamp()
    ) returning * into v_account;
  else
    select * into v_account from public.admin_accounts
      where user_id = v_preview.target_user_id for update;
    if not found or v_account.revision <> v_preview.expected_revision then
      raise exception 'Administrator account changed after preview' using errcode = '40001';
    end if;
  end if;

  if v_account.status = 'active'
     and exists (select 1 from public.admin_account_roles existing_role
       where existing_role.user_id = v_account.user_id
         and existing_role.role_code = 'super_admin')
     and (v_status <> 'active' or not ('super_admin' = any(v_roles)))
     and not exists (
       select 1 from public.admin_accounts other_account
       join public.admin_account_roles other_role on other_role.user_id = other_account.user_id
       where other_account.status = 'active'
         and other_role.role_code = 'super_admin'
         and other_account.user_id <> v_account.user_id
     ) then
    raise exception 'The last active super administrator cannot be removed or suspended'
      using errcode = '23514';
  end if;

  if v_preview.action = 'update' then
    update public.admin_accounts set display_name = v_display_name,
      updated_at = clock_timestamp(), revision = revision + 1
    where user_id = v_account.user_id returning * into v_account;
    delete from public.admin_account_roles where user_id = v_account.user_id;
    insert into public.admin_account_roles (user_id, role_code, granted_by)
      select v_account.user_id, requested_role, v_actor from unnest(v_roles) requested_role;
  elsif v_preview.action = 'set_status' then
    update public.admin_accounts set status = v_status,
      updated_at = clock_timestamp(), revision = revision + 1
    where user_id = v_account.user_id returning * into v_account;
  else
    insert into public.admin_account_roles (user_id, role_code, granted_by)
      select v_account.user_id, requested_role, v_actor from unnest(v_roles) requested_role;
  end if;

  select coalesce(array_agg(role_code order by role_code), array[]::text[])
    into v_roles from public.admin_account_roles where user_id = v_account.user_id;
  v_result := jsonb_build_object(
    'user_id', v_account.user_id,
    'email', lower(v_auth_user.email),
    'display_name', v_account.display_name,
    'status', v_account.status,
    'roles', to_jsonb(v_roles),
    'revision', v_account.revision,
    'idempotent', false
  );

  update public.admin_account_change_previews set
    consumed_at = clock_timestamp(), execution_operation_id = p_operation_id,
    execution_result = v_result
  where id = v_preview.id;

  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    reason, before_state, after_state, evidence, session_id,
    mfa_authenticated_at, deduplication_key
  ) values (
    v_actor, 'administrator_account_changed', 'admin_account', v_account.user_id::text,
    'administrators.' || v_preview.action, 'success', trim(p_reason),
    v_preview.before_state, v_result - 'idempotent',
    jsonb_build_object('preview_id', v_preview.id, 'operation_id', p_operation_id),
    auth.jwt() ->> 'session_id', public.admin_current_mfa_authenticated_at(),
    'admin-account-change:' || p_operation_id::text
  );

  return v_result;
end
$$;

revoke all on function public.admin_list_administrators(text,integer,integer) from public, anon;
revoke all on function public.admin_get_administrator_catalog() from public, anon;
revoke all on function public.admin_preview_administrator_change(text,uuid,text,text,text[],text) from public, anon;
revoke all on function public.admin_execute_administrator_change(uuid,text,uuid) from public, anon;
grant execute on function public.admin_list_administrators(text,integer,integer) to authenticated;
grant execute on function public.admin_get_administrator_catalog() to authenticated;
grant execute on function public.admin_preview_administrator_change(text,uuid,text,text,text[],text) to authenticated;
grant execute on function public.admin_execute_administrator_change(uuid,text,uuid) to authenticated;
