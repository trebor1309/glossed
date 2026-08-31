-- Admin UX consolidation, tranche 1. This migration enriches existing read
-- models and previews without changing financial workflows or state machines.

create or replace function public.get_my_admin_access(
  p_client_context jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.admin_accounts%rowtype;
  v_roles text[] := array[]::text[];
  v_permissions text[] := array[]::text[];
  v_account_exists boolean := false;
  v_aal text := public.admin_current_aal();
  v_mfa_at timestamptz := public.admin_current_mfa_authenticated_at();
  v_mfa_max_age integer;
  v_mfa_recent boolean := false;
  v_mfa_configured boolean := false;
  v_session_id text := nullif(auth.jwt() ->> 'session_id', '');
  v_event_type text;
  v_outcome text;
  v_deduplication_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if octet_length(coalesce(p_client_context, '{}'::jsonb)::text) > 8192 then
    raise exception 'Client context is too large' using errcode = '22023';
  end if;

  select * into v_account from public.admin_accounts where user_id = auth.uid();
  v_account_exists := found;
  select exists (
    select 1 from auth.mfa_factors factor
    where factor.user_id = auth.uid() and factor.status::text = 'verified'
  ) into v_mfa_configured;
  select policy.financial_reauthentication_max_age_seconds into v_mfa_max_age
  from public.admin_security_policy_versions policy
  where policy.effective_from <= clock_timestamp()
    and (policy.effective_until is null or policy.effective_until > clock_timestamp())
  order by policy.effective_from desc limit 1;
  v_mfa_recent := v_aal = 'aal2' and v_mfa_at is not null
    and v_mfa_max_age is not null
    and v_mfa_at <= clock_timestamp() + interval '5 seconds'
    and v_mfa_at >= clock_timestamp() - make_interval(secs => v_mfa_max_age);

  if not v_account_exists or v_account.status <> 'active' then
    v_event_type := 'access_denied'; v_outcome := 'denied';
  elsif v_aal <> 'aal2' then
    v_event_type := 'mfa_required'; v_outcome := 'challenge_required';
  else
    v_event_type := 'access_granted'; v_outcome := 'success';
    select coalesce(array_agg(role.role_code order by role.role_code), array[]::text[]) into v_roles
    from public.admin_account_roles role where role.user_id = auth.uid();
    select coalesce(array_agg(distinct permission.permission_code
      order by permission.permission_code), array[]::text[]) into v_permissions
    from public.admin_account_roles account_role
    join public.admin_role_permissions permission
      on permission.role_code = account_role.role_code
    where account_role.user_id = auth.uid();
    update public.admin_accounts set last_authenticated_at = clock_timestamp(),
      updated_at = clock_timestamp(), revision = revision + 1
    where user_id = auth.uid();
  end if;

  v_deduplication_key := concat_ws(':', 'admin-auth', auth.uid()::text,
    coalesce(v_session_id, 'no-session'), v_event_type, v_aal);
  insert into public.admin_auth_events (
    user_id, admin_account_id, event_type, outcome, session_id, aal,
    mfa_authenticated_at, client_context, deduplication_key
  ) values (
    auth.uid(), case when v_account_exists then auth.uid() else null end,
    v_event_type, v_outcome, v_session_id, v_aal, v_mfa_at,
    coalesce(p_client_context, '{}'::jsonb), v_deduplication_key
  ) on conflict (deduplication_key) do nothing;

  return jsonb_build_object(
    'account_exists', v_account_exists,
    'authorized', v_account_exists and v_account.status = 'active' and v_aal = 'aal2',
    'status', coalesce(v_account.status, 'unavailable'),
    'display_name', v_account.display_name,
    'roles', to_jsonb(v_roles),
    'permissions', to_jsonb(v_permissions),
    'aal', v_aal,
    'mfa_configured', v_mfa_configured,
    'mfa_authenticated_at', v_mfa_at,
    'mfa_recent', v_mfa_recent,
    'mfa_reauthentication_expires_at', case when v_mfa_at is not null and v_mfa_max_age is not null
      then v_mfa_at + make_interval(secs => v_mfa_max_age) else null end,
    'financial_reauthentication_required',
      'finance.execute' = any(v_permissions) and not v_mfa_recent
  );
end
$$;

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
      account.last_authenticated_at, auth_user.last_sign_in_at,
      auth_user.email_confirmed_at,
      auth_user.raw_app_meta_data ->> 'account_type' as account_type,
      account.revision,
      coalesce((select array_agg(role.role_code order by role.role_code)
        from public.admin_account_roles role where role.user_id = account.user_id),
        array[]::text[]) as roles,
      (select count(*)::integer from auth.mfa_factors factor
        where factor.user_id = account.user_id and factor.status::text = 'verified')
        as verified_mfa_factor_count
    from public.admin_accounts account
    join auth.users auth_user on auth_user.id = account.user_id
    where nullif(trim(coalesce(p_query, '')), '') is null
      or concat_ws(' ', auth_user.email, account.display_name, account.user_id::text,
        account.status) ilike '%' || trim(p_query) || '%'
      or exists (select 1 from public.admin_account_roles searched_role
        where searched_role.user_id = account.user_id
          and searched_role.role_code ilike '%' || trim(p_query) || '%')
  ), page as (
    select filtered.*, verified_mfa_factor_count > 0 as mfa_configured,
      count(*) over() total_count
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
    ),
    'current_user_id', auth.uid(),
    'active_super_administrator_count', (
      select count(*) from public.admin_accounts account
      join public.admin_account_roles role on role.user_id = account.user_id
      where account.status = 'active' and role.role_code = 'super_admin'
    )
  ) into v_result;
  perform public.record_admin_read_audit(
    'administrators.catalog', 'admin_role_catalog', 'global', '{}'::jsonb
  );
  return v_result;
end
$$;

create or replace function public.admin_preview_administrator_change_ux_v1(
  p_action text,
  p_target_user_id uuid default null,
  p_target_email text default null,
  p_display_name text default null,
  p_roles text[] default null,
  p_status text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_auth_user auth.users%rowtype;
  v_display_name text := nullif(trim(coalesce(p_display_name, '')), '');
  v_preview public.admin_account_change_previews%rowtype;
begin
  perform public.assert_admin_permission('administrators.manage', true);
  if p_action = 'activate' then
    select * into v_auth_user from auth.users
    where lower(email) = lower(trim(coalesce(p_target_email, '')));
    if found and v_display_name is null then
      v_display_name := coalesce(
        nullif(trim(v_auth_user.raw_user_meta_data ->> 'display_name'), ''),
        nullif(trim(v_auth_user.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(v_auth_user.raw_user_meta_data ->> 'name'), '')
      );
    end if;
  end if;

  select * into v_preview from jsonb_populate_record(
    null::public.admin_account_change_previews,
    public.admin_preview_administrator_change(
      p_action, p_target_user_id, p_target_email, v_display_name, p_roles, p_status
    )
  );

  if p_action = 'activate' then
    update public.admin_account_change_previews
    set proposed_state = proposed_state || jsonb_build_object(
      'security_checks', jsonb_build_object(
        'identity_found', v_auth_user.id is not null,
        'email_confirmed', v_auth_user.email_confirmed_at is not null,
        'account_type_admin', v_auth_user.raw_app_meta_data ->> 'account_type' = 'admin',
        'consumer_profile_absent', not exists (
          select 1 from public.users app_user where app_user.id = v_auth_user.id
        )
      )
    )
    where id = v_preview.id
    returning * into v_preview;
  end if;
  return to_jsonb(v_preview);
end
$$;

create or replace function public.admin_get_administrator_history(
  p_target_user_id uuid,
  p_limit integer default 25
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_items jsonb;
begin
  perform public.assert_admin_permission('administrators.read');
  if p_target_user_id is null or p_limit not between 1 and 100 then
    raise exception 'Invalid administrator history request' using errcode = '22023';
  end if;
  if not exists (select 1 from public.admin_accounts where user_id = p_target_user_id) then
    raise exception 'Administrator account not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(to_jsonb(history) order by history.occurred_at desc), '[]'::jsonb)
  into v_items from (
    select audit.id, audit.event_type, audit.action, audit.outcome, audit.reason,
      audit.before_state, audit.after_state, audit.occurred_at,
      audit.admin_account_id as actor_id,
      coalesce(actor.display_name, actor_user.email, 'Système') as actor_label
    from public.admin_audit_log audit
    left join public.admin_accounts actor on actor.user_id = audit.admin_account_id
    left join auth.users actor_user on actor_user.id = audit.admin_account_id
    where audit.entity_type = 'admin_account'
      and audit.entity_id = p_target_user_id::text
      and audit.event_type = 'administrator_account_changed'
    order by audit.occurred_at desc
    limit p_limit
  ) history;

  perform public.record_admin_read_audit(
    'administrators.history', 'admin_account', p_target_user_id::text,
    jsonb_build_object('limit', p_limit)
  );
  return jsonb_build_object('items', v_items);
end
$$;

create or replace function public.admin_get_connect_action_queue(p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  perform public.assert_admin_permission('users.read');
  if p_limit not between 1 and 100 then
    raise exception 'Invalid Connect action queue limit' using errcode = '22023';
  end if;

  with actionable as (
    select c.provider_id,
      coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
        u.business_name, u.email, 'Prestataire') as label,
      c.stripe_account_id, c.account_api_version, c.creation_state,
      c.stripe_transfers_status, c.payouts_status,
      c.requirements, c.future_requirements,
      c.livemode, c.closed, c.connection_enabled,
      c.last_synced_at, c.updated_at
    from public.provider_connect_accounts c
    join public.users u on u.id = c.provider_id
    where c.creation_state in ('creating', 'sync_failed')
       or c.closed or not c.connection_enabled
       or c.account_api_version = 'accounts_v1_legacy'
       or c.stripe_transfers_status <> 'active'
       or c.payouts_status <> 'active'
  ), page as (
    select actionable.*, count(*) over() as total_count
    from actionable order by updated_at asc, provider_id limit p_limit
  )
  select jsonb_build_object(
    'available', true,
    'count', coalesce(max(total_count), 0),
    'items', coalesce(jsonb_agg(to_jsonb(page) - 'total_count'
      order by updated_at asc, provider_id), '[]'::jsonb)
  ) into v_result from page;

  perform public.record_admin_read_audit(
    'connect.actions.list', 'provider_connect_account_collection', null,
    jsonb_build_object('limit', p_limit)
  );
  return v_result;
end
$$;

revoke all on function public.admin_preview_administrator_change_ux_v1(
  text,uuid,text,text,text[],text
) from public, anon;
revoke all on function public.admin_get_administrator_history(uuid,integer) from public, anon;
revoke all on function public.admin_get_connect_action_queue(integer) from public, anon;
grant execute on function public.admin_preview_administrator_change_ux_v1(
  text,uuid,text,text,text[],text
) to authenticated;
grant execute on function public.admin_get_administrator_history(uuid,integer) to authenticated;
grant execute on function public.admin_get_connect_action_queue(integer) to authenticated;
