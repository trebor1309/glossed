-- Admin UX consolidation tranche 3: typed configuration catalog and
-- account-scoped interface preferences. No financial flag is activated here.

begin;

alter table public.provider_payout_policy_versions
  add column if not exists created_by uuid references public.admin_accounts(user_id) on delete restrict;

create table public.admin_user_preferences (
  admin_user_id uuid primary key references public.admin_accounts(user_id) on delete cascade,
  interface_locale text not null default 'fr' check (interface_locale in ('fr','nl','de','en')),
  theme text not null default 'light' check (theme in ('light','dark')),
  notification_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  revision bigint not null default 1 check (revision > 0),
  constraint admin_user_preferences_notifications_size
    check (octet_length(notification_preferences::text) <= 8192)
);

comment on table public.admin_user_preferences is
  'Private per-account admin interface preferences. Notification preferences are reserved for future validated settings.';

alter table public.admin_user_preferences enable row level security;
revoke all on public.admin_user_preferences from public,anon,authenticated;
grant all on public.admin_user_preferences to service_role;

create or replace function public.admin_get_my_preferences()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_preferences public.admin_user_preferences%rowtype;
begin
  perform public.assert_admin_permission('admin.access');
  select * into v_preferences from public.admin_user_preferences where admin_user_id=auth.uid();
  return jsonb_build_object(
    'interface_locale',coalesce(v_preferences.interface_locale,'fr'),
    'theme',coalesce(v_preferences.theme,'light'),
    'notification_preferences',coalesce(v_preferences.notification_preferences,'{}'::jsonb),
    'updated_at',v_preferences.updated_at,
    'revision',coalesce(v_preferences.revision,0)
  );
end
$$;

create or replace function public.admin_update_my_preferences(
  p_interface_locale text,p_theme text,p_operation_id uuid
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_admin uuid:=auth.uid(); v_before jsonb; v_after jsonb; v_key text;
begin
  perform public.assert_admin_permission('admin.access');
  if p_interface_locale not in ('fr','nl','de','en') or p_theme not in ('light','dark')
     or p_operation_id is null then
    raise exception 'Invalid administrator preferences' using errcode='22023';
  end if;
  v_key:='admin-preferences:'||v_admin::text||':'||p_operation_id::text;
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select after_state into v_after from public.admin_audit_log where deduplication_key=v_key;
  if found then
    if v_after->>'interface_locale'<>p_interface_locale or v_after->>'theme'<>p_theme then
      raise exception 'Preference operation identity was already used with another payload' using errcode='23505';
    end if;
    return v_after;
  end if;
  select jsonb_build_object('interface_locale',interface_locale,'theme',theme,'revision',revision)
    into v_before from public.admin_user_preferences where admin_user_id=v_admin for update;
  v_before:=coalesce(v_before,jsonb_build_object('interface_locale','fr','theme','light','revision',0));
  insert into public.admin_user_preferences(admin_user_id,interface_locale,theme)
  values(v_admin,p_interface_locale,p_theme)
  on conflict(admin_user_id) do update set interface_locale=excluded.interface_locale,
    theme=excluded.theme,updated_at=clock_timestamp(),revision=public.admin_user_preferences.revision+1;
  select jsonb_build_object('interface_locale',interface_locale,'theme',theme,
    'updated_at',updated_at,'revision',revision) into v_after
  from public.admin_user_preferences where admin_user_id=v_admin;
  insert into public.admin_audit_log(admin_account_id,event_type,entity_type,entity_id,
    action,outcome,before_state,after_state,deduplication_key)
  values(v_admin,'administrator_preferences_updated','admin_user_preferences',v_admin::text,
    'preferences.update','success',v_before,v_after,v_key);
  return v_after;
end
$$;

create or replace function public.admin_get_configuration_catalog_ux_v3()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  perform public.assert_admin_permission('configuration.read');
  select jsonb_build_object(
    'feature_flags',coalesce((select jsonb_agg(to_jsonb(flag) order by flag.flag_code)
      from public.financial_feature_flags flag),'[]'::jsonb),
    'runtime_controls',coalesce((select jsonb_agg(to_jsonb(control) order by control.control_code,control.currency)
      from public.financial_runtime_controls control),'[]'::jsonb),
    'liquidity_limits',coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (select limits.*,creator.email::text created_by_email,
        row_number() over(partition by limits.metric_code,limits.currency order by limits.created_at desc,limits.version desc)=1 is_latest
        from public.financial_limit_versions limits left join auth.users creator on creator.id=limits.created_by) item),'[]'::jsonb),
    'checkout_policies',coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (select policy.*,creator.email::text created_by_email,
        row_number() over(partition by policy.currency order by policy.created_at desc,policy.version desc)=1 is_latest,
        (select count(*) from public.checkout_v2_selections selection where selection.policy_version=policy.version) applied_operation_count
        from public.checkout_v2_policy_versions policy left join auth.users creator on creator.id=policy.created_by) item),'[]'::jsonb),
    'payout_policies',coalesce((select jsonb_agg(to_jsonb(item) order by item.effective_from desc,item.version desc)
      from (select policy.*,creator.email::text created_by_email,
        policy.version=(select active.version from public.provider_payout_policy_versions active
          where active.currency=policy.currency and active.effective_from<=clock_timestamp()
            and (active.effective_until is null or active.effective_until>clock_timestamp())
          order by active.effective_from desc,active.version desc limit 1) is_active,
        (select count(*) from public.provider_payouts_v2 payout where payout.policy_version=policy.version) applied_operation_count
        from public.provider_payout_policy_versions policy left join auth.users creator on creator.id=policy.created_by) item),'[]'::jsonb),
    'eligibility_policies',coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (select policy.*,creator.email::text created_by_email,
        row_number() over(partition by policy.jurisdiction_code,policy.residence_country_code,
          policy.service_country_code,policy.provider_status_code,policy.service_category_code
          order by policy.created_at desc,policy.version desc)=1 is_latest,
        (policy.effective_from<=clock_timestamp()
          and (policy.effective_until is null or policy.effective_until>clock_timestamp())) is_active
        from public.provider_eligibility_policy_versions policy left join auth.users creator on creator.id=policy.created_by) item),'[]'::jsonb),
    'jurisdiction_policies',coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (select policy.*,creator.email::text created_by_email,
        row_number() over(partition by policy.jurisdiction_code,policy.policy_type order by policy.created_at desc,policy.version desc)=1 is_latest,
        (policy.lifecycle_state='approved' and policy.effective_from<=clock_timestamp()
          and (policy.effective_until is null or policy.effective_until>clock_timestamp())) is_active
        from public.jurisdiction_policy_versions_v2 policy left join auth.users creator on creator.id=policy.created_by) item),'[]'::jsonb),
    'admin_security_policies',coalesce((select jsonb_agg(to_jsonb(policy)||jsonb_build_object(
      'is_active',policy.effective_from<=clock_timestamp()
        and (policy.effective_until is null or policy.effective_until>clock_timestamp()))
      order by policy.effective_from desc) from public.admin_security_policy_versions policy),'[]'::jsonb)
  ) into v_result;
  perform public.record_admin_read_audit('configuration.read.ux_v3','configuration_catalog_v2','global','{}'::jsonb);
  return v_result;
end
$$;

create or replace function public.admin_create_configuration_version(
  p_configuration_type text,p_version text,p_payload jsonb,p_reason text
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_admin uuid:=auth.uid(); v_result jsonb;
begin
  perform public.assert_admin_permission('configuration.manage',true);
  if length(trim(coalesce(p_reason,''))) not between 10 and 4000
     or coalesce(jsonb_typeof(p_payload),'')<>'object' then
    raise exception 'A valid payload and detailed reason are required' using errcode='22023';
  end if;
  if p_configuration_type='liquidity_limit' then
    insert into public.financial_limit_versions(version,metric_code,currency,
      comparison_operator,warning_threshold_cents,blocking_threshold_cents,notes,created_by)
    values(p_version,coalesce(p_payload->>'metric_code','checkout_liquidity_exposure'),
      lower(p_payload->>'currency'),coalesce(p_payload->>'comparison_operator','above'),
      (p_payload->>'warning_threshold_cents')::bigint,(p_payload->>'blocking_threshold_cents')::bigint,
      coalesce(nullif(trim(p_payload->>'notes'),''),trim(p_reason)),v_admin);
  elsif p_configuration_type='checkout_policy' then
    insert into public.checkout_v2_policy_versions(version,currency,
      payment_window_open_before_start_seconds,payment_deadline_seconds,checkout_ttl_seconds,
      checkout_expiry_margin_before_start_seconds,liquidity_limit_version,
      stripe_payment_method_configuration_reference,notes,created_by)
    values(p_version,lower(p_payload->>'currency'),
      (p_payload->>'payment_window_open_before_start_seconds')::bigint,
      (p_payload->>'payment_deadline_seconds')::bigint,(p_payload->>'checkout_ttl_seconds')::bigint,
      (p_payload->>'checkout_expiry_margin_before_start_seconds')::bigint,
      p_payload->>'liquidity_limit_version',p_payload->>'stripe_payment_method_configuration_reference',
      coalesce(nullif(trim(p_payload->>'notes'),''),trim(p_reason)),v_admin);
  elsif p_configuration_type='payout_policy' then
    insert into public.provider_payout_policy_versions(version,currency,schedule_timezone,
      standard_payout_isodays,standard_payout_local_time,minimum_payout_amount_cents,
      instant_quote_ttl_seconds,stripe_instant_cost_rate_bps,effective_from,notes,created_by)
    values(p_version,lower(p_payload->>'currency'),p_payload->>'schedule_timezone',
      array(select jsonb_array_elements_text(p_payload->'standard_payout_isodays')::smallint),
      (p_payload->>'standard_payout_local_time')::time,
      coalesce((p_payload->>'minimum_payout_amount_cents')::bigint,0),
      (p_payload->>'instant_quote_ttl_seconds')::integer,
      (p_payload->>'stripe_instant_cost_rate_bps')::integer,
      (p_payload->>'effective_from')::timestamptz,
      coalesce(nullif(trim(p_payload->>'notes'),''),trim(p_reason)),v_admin);
  elsif p_configuration_type='jurisdiction_policy_structure' then
    if coalesce(p_payload->>'lifecycle_state','draft')<>'draft' then
      raise exception 'Jurisdiction policy foundations can only be created as drafts' using errcode='23514';
    end if;
    insert into public.jurisdiction_policy_versions_v2(version,jurisdiction_code,policy_type,lifecycle_state,notes,created_by)
    values(p_version,upper(p_payload->>'jurisdiction_code'),p_payload->>'policy_type','draft',
      coalesce(nullif(trim(p_payload->>'notes'),''),trim(p_reason)),v_admin);
  else raise exception 'Unsupported configuration type' using errcode='22023';
  end if;
  v_result:=jsonb_build_object('configuration_type',p_configuration_type,'version',p_version,
    'created_by',v_admin,'feature_flags_changed',false);
  insert into public.admin_audit_log(admin_account_id,event_type,entity_type,entity_id,
    action,outcome,reason,after_state,mfa_authenticated_at,deduplication_key)
  values(v_admin,'configuration_version_created',p_configuration_type,p_version,
    'configuration.create','success',trim(p_reason),p_payload,public.admin_current_mfa_authenticated_at(),
    'admin-config:'||p_configuration_type||':'||p_version);
  return v_result;
end
$$;

revoke all on function public.admin_get_my_preferences() from public,anon;
revoke all on function public.admin_update_my_preferences(text,text,uuid) from public,anon;
revoke all on function public.admin_get_configuration_catalog_ux_v3() from public,anon;
grant execute on function public.admin_get_my_preferences() to authenticated;
grant execute on function public.admin_update_my_preferences(text,text,uuid) to authenticated;
grant execute on function public.admin_get_configuration_catalog_ux_v3() to authenticated;

commit;
