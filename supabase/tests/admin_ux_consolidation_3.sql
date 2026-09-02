\set ON_ERROR_STOP on

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '89300000-%' or entity_id like '89300000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
alter table public.financial_limit_versions disable trigger financial_limit_versions_immutable;
delete from public.financial_limit_versions where version='ux3_limit_v1';
alter table public.financial_limit_versions enable trigger financial_limit_versions_immutable;
alter table public.provider_payout_policy_versions disable trigger provider_payout_policy_versions_immutable;
delete from public.provider_payout_policy_versions where version='ux3_payout_v1';
alter table public.provider_payout_policy_versions enable trigger provider_payout_policy_versions_immutable;
delete from public.admin_user_preferences where admin_user_id::text like '89300000-%';
delete from public.admin_account_roles where user_id::text like '89300000-%';
delete from public.admin_accounts where user_id::text like '89300000-%';
delete from public.users where id::text like '89300000-%';
delete from auth.users where id::text like '89300000-%';

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 ('89300000-0000-0000-0000-000000000001','ux3-admin@example.test',clock_timestamp(),'{"account_type":"admin"}','{}'),
 ('89300000-0000-0000-0000-000000000002','ux3-outsider@example.test',clock_timestamp(),'{}','{}');
insert into public.admin_accounts(user_id,display_name) values
 ('89300000-0000-0000-0000-000000000001','UX3 administrator');
insert into public.admin_account_roles(user_id,role_code) values
 ('89300000-0000-0000-0000-000000000001','super_admin');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','89300000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','89300000-0000-0000-0000-000000000001','role','authenticated','aal','aal2','session_id','ux3-session','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from clock_timestamp())::bigint)))::text,true);
do $$
declare v_result jsonb; v_revision bigint; v_flags_before jsonb;
begin
  v_result:=public.admin_get_my_preferences();
  if v_result->>'interface_locale'<>'fr' or v_result->>'theme'<>'light' or (v_result->>'revision')::bigint<>0 then
    raise exception 'Default admin preferences are invalid';
  end if;
  v_result:=public.admin_update_my_preferences('nl','dark','89300000-0000-0000-0000-000000000101');
  v_revision:=(v_result->>'revision')::bigint;
  if v_result->>'interface_locale'<>'nl' or v_result->>'theme'<>'dark' then raise exception 'Preferences were not saved'; end if;
  v_result:=public.admin_update_my_preferences('nl','dark','89300000-0000-0000-0000-000000000101');
  if (v_result->>'revision')::bigint<>v_revision then raise exception 'Preference retry was not idempotent'; end if;
  begin
    perform public.admin_update_my_preferences('de','light','89300000-0000-0000-0000-000000000101');
    raise exception 'Operation identity accepted another payload';
  exception when unique_violation then null; end;
  v_result:=public.admin_search_audit_ux_v2('preferences.update','admin','success',
    'ux3-admin@example.test',null,null,50,0);
  if (v_result->>'total')::integer<>1 then raise exception 'Preference update audit is not unique'; end if;
  v_flags_before:=public.admin_get_configuration_catalog_ux_v3()->'feature_flags';
  perform public.admin_create_configuration_version('liquidity_limit','ux3_limit_v1',
    '{"metric_code":"checkout_liquidity_exposure","currency":"eur","comparison_operator":"above","warning_threshold_cents":100000,"blocking_threshold_cents":200000}'::jsonb,
    'Targeted tranche three configuration test.');
  perform public.admin_create_configuration_version('payout_policy','ux3_payout_v1',
    '{"currency":"eur","schedule_timezone":"Europe/Brussels","standard_payout_isodays":[1,4],"standard_payout_local_time":"09:00:00","minimum_payout_amount_cents":0,"instant_quote_ttl_seconds":300,"stripe_instant_cost_rate_bps":100,"effective_from":"2099-01-01T00:00:00Z"}'::jsonb,
    'Future inactive payout configuration test.');
  v_result:=public.admin_get_configuration_catalog_ux_v3();
  if not exists(select 1 from jsonb_array_elements(v_result->'liquidity_limits') item
    where item->>'version'='ux3_limit_v1' and item->>'created_by_email'='ux3-admin@example.test' and (item->>'is_latest')::boolean) then
    raise exception 'Liquidity version projection is incomplete';
  end if;
  if not exists(select 1 from jsonb_array_elements(v_result->'payout_policies') item
    where item->>'version'='ux3_payout_v1' and item->>'created_by_email'='ux3-admin@example.test' and not (item->>'is_active')::boolean) then
    raise exception 'Payout author or active projection is incomplete';
  end if;
  if v_result->'feature_flags'<>v_flags_before then
    raise exception 'Configuration version creation changed a financial feature flag';
  end if;
  begin perform 1 from public.admin_user_preferences; raise exception 'Direct preference table read was allowed';
  exception when insufficient_privilege then null; end;
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','89300000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','89300000-0000-0000-0000-000000000002','role','authenticated','aal','aal2')::text,true);
do $$ begin
  begin perform public.admin_get_my_preferences(); raise exception 'Outsider read admin preferences'; exception when insufficient_privilege then null; end;
  begin perform public.admin_update_my_preferences('fr','light',gen_random_uuid()); raise exception 'Outsider updated admin preferences'; exception when insufficient_privilege then null; end;
  begin perform public.admin_get_configuration_catalog_ux_v3(); raise exception 'Outsider read configuration'; exception when insufficient_privilege then null; end;
end $$;
commit;

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '89300000-%' or entity_id like '89300000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
alter table public.financial_limit_versions disable trigger financial_limit_versions_immutable;
delete from public.financial_limit_versions where version='ux3_limit_v1';
alter table public.financial_limit_versions enable trigger financial_limit_versions_immutable;
alter table public.provider_payout_policy_versions disable trigger provider_payout_policy_versions_immutable;
delete from public.provider_payout_policy_versions where version='ux3_payout_v1';
alter table public.provider_payout_policy_versions enable trigger provider_payout_policy_versions_immutable;
delete from public.admin_user_preferences where admin_user_id::text like '89300000-%';
delete from public.admin_account_roles where user_id::text like '89300000-%';
delete from public.admin_accounts where user_id::text like '89300000-%';
delete from public.users where id::text like '89300000-%';
delete from auth.users where id::text like '89300000-%';

select 'admin UX consolidation tranche 3 tests passed' as result;
