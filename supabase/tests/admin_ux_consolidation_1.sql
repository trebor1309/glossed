\set ON_ERROR_STOP on

alter table public.admin_auth_events disable trigger admin_auth_events_immutable;
delete from public.admin_auth_events where user_id::text like '89100000-%';
alter table public.admin_auth_events enable trigger admin_auth_events_immutable;
alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '89100000-%'
  or entity_id like '89100000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
delete from public.admin_account_change_previews where admin_id::text like '89100000-%'
  or target_user_id::text like '89100000-%';
delete from public.admin_account_roles where user_id::text like '89100000-%';
delete from public.admin_accounts where user_id::text like '89100000-%';
alter table public.provider_connect_accounts disable trigger protect_provider_connect_account;
delete from public.provider_connect_accounts where provider_id::text like '89100000-%';
alter table public.provider_connect_accounts enable trigger protect_provider_connect_account;
alter table public.provider_connect_account_identities disable trigger provider_connect_account_identities_immutable;
delete from public.provider_connect_account_identities where provider_id::text like '89100000-%';
alter table public.provider_connect_account_identities enable trigger provider_connect_account_identities_immutable;
delete from public.users where id::text like '89100000-%';
delete from auth.users where id::text like '89100000-%';

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('89100000-0000-0000-0000-000000000001', 'ux-super-admin@example.test', clock_timestamp(), '{"account_type":"admin"}', '{}'),
  ('89100000-0000-0000-0000-000000000002', 'ux-candidate@example.test', clock_timestamp(), '{"account_type":"admin"}', '{"display_name":"Candidate metadata name"}'),
  ('89100000-0000-0000-0000-000000000003', 'ux-outsider@example.test', clock_timestamp(), '{}', '{}'),
  ('89100000-0000-0000-0000-000000000010', 'ux-provider@example.test', clock_timestamp(), '{}', '{"requested_role":"pro","business_name":"UX provider"}');

update public.users set role = 'pro', active_role = 'pro'
where id = '89100000-0000-0000-0000-000000000010';
insert into public.admin_accounts (user_id, display_name) values
  ('89100000-0000-0000-0000-000000000001', 'UX super admin');
insert into public.admin_account_roles (user_id, role_code) values
  ('89100000-0000-0000-0000-000000000001', 'super_admin');
insert into public.provider_connect_account_identities (
  stripe_account_id, provider_id, creation_generation, account_api_version
) values (
  'acct_UxLegacyTest', '89100000-0000-0000-0000-000000000010', 1, 'accounts_v1_legacy'
);
insert into public.provider_connect_accounts (
  provider_id, stripe_account_id, account_api_version, creation_state,
  creation_idempotency_key, stripe_transfers_status, payouts_status,
  requirements, livemode
) values (
  '89100000-0000-0000-0000-000000000010', 'acct_UxLegacyTest',
  'accounts_v1_legacy', 'created', 'admin-ux-connect-test', 'unknown', 'unknown',
  '{"currently_due":["external_account"]}', false
);

-- The server exposes configured and recent MFA as distinct concepts, and the
-- enriched administrator/Connect read models remain permission gated.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '89100000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '89100000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'admin-ux-fresh-mfa',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
do $$
declare v_access jsonb; v_list jsonb; v_catalog jsonb; v_queue jsonb; v_connect jsonb;
  v_preview jsonb; v_result jsonb; v_history jsonb;
begin
  v_access := public.get_my_admin_access();
  if not (v_access ->> 'mfa_recent')::boolean
     or (v_access ->> 'financial_reauthentication_required')::boolean
     or not (v_access ? 'mfa_configured')
     or not (v_access ? 'mfa_reauthentication_expires_at') then
    raise exception 'MFA status projection is incomplete';
  end if;

  v_list := public.admin_list_administrators();
  if not ((v_list -> 'items' -> 0) ?& array[
    'mfa_configured', 'verified_mfa_factor_count', 'email_confirmed_at', 'account_type'
  ]) then raise exception 'Administrator security summary is incomplete'; end if;
  v_catalog := public.admin_get_administrator_catalog();
  if (v_catalog ->> 'active_super_administrator_count')::integer < 1
     or v_catalog ->> 'current_user_id' <> '89100000-0000-0000-0000-000000000001' then
    raise exception 'Contextual super-administrator guard data is incomplete';
  end if;

  v_queue := public.admin_get_connect_action_queue(100);
  select item into v_connect from jsonb_array_elements(v_queue -> 'items') item
  where item ->> 'provider_id' = '89100000-0000-0000-0000-000000000010';
  if v_connect is null
     or v_connect ->> 'account_api_version' <> 'accounts_v1_legacy'
     or v_connect -> 'requirements' -> 'currently_due' ->> 0 <> 'external_account' then
    raise exception 'Actionable Connect queue lacks operational context';
  end if;

  v_preview := public.admin_preview_administrator_change_ux_v1(
    'activate', null, 'ux-candidate@example.test', null, array['support'], null
  );
  if v_preview -> 'proposed_state' ->> 'display_name' <> 'Candidate metadata name'
     or not ((v_preview -> 'proposed_state' -> 'security_checks') @> '{
       "identity_found": true,
       "email_confirmed": true,
       "account_type_admin": true,
       "consumer_profile_absent": true
     }'::jsonb) then
    raise exception 'Activation preview does not expose trusted server checks';
  end if;
  v_result := public.admin_execute_administrator_change(
    (v_preview ->> 'id')::uuid, 'Activation approved by the UX security test.',
    '89100000-0000-0000-0000-000000000101'
  );
  if v_result ->> 'display_name' <> 'Candidate metadata name' then
    raise exception 'Auth metadata display name was not retained';
  end if;
  v_history := public.admin_get_administrator_history(
    '89100000-0000-0000-0000-000000000002', 25
  );
  if jsonb_array_length(v_history -> 'items') <> 1
     or v_history -> 'items' -> 0 ->> 'actor_label' <> 'UX super admin' then
    raise exception 'Administrator lifecycle history is incomplete';
  end if;
end $$;
commit;

-- A stale token remains AAL2/configured but is no longer recent for financial
-- operations. This normal expiry is data, not an authorization failure.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '89100000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '89100000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'admin-ux-stale-mfa',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp() - interval '10 minutes')::bigint))
)::text, true);
do $$ declare v_access jsonb;
begin
  v_access := public.get_my_admin_access();
  if (v_access ->> 'mfa_recent')::boolean
     or not (v_access ->> 'financial_reauthentication_required')::boolean then
    raise exception 'Expired MFA window was not represented correctly';
  end if;
end $$;
commit;

-- A normal authenticated identity cannot enumerate the enriched operational
-- data or obtain a trusted activation preview.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '89100000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '89100000-0000-0000-0000-000000000003', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'admin-ux-outsider',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
do $$ begin
  begin perform public.admin_get_connect_action_queue();
    raise exception 'Outsider accessed the Connect action queue';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_get_administrator_history('89100000-0000-0000-0000-000000000001');
    raise exception 'Outsider accessed administrator history';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_preview_administrator_change_ux_v1(
    'update', '89100000-0000-0000-0000-000000000001', null,
    'Tampered', array['support'], null
  );
    raise exception 'Outsider previewed an administrator change';
  exception when insufficient_privilege then null; end;
end $$;
commit;

alter table public.admin_auth_events disable trigger admin_auth_events_immutable;
delete from public.admin_auth_events where user_id::text like '89100000-%';
alter table public.admin_auth_events enable trigger admin_auth_events_immutable;
alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '89100000-%'
  or entity_id like '89100000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
delete from public.admin_account_change_previews where admin_id::text like '89100000-%'
  or target_user_id::text like '89100000-%';
delete from public.admin_account_roles where user_id::text like '89100000-%';
delete from public.admin_accounts where user_id::text like '89100000-%';
alter table public.provider_connect_accounts disable trigger protect_provider_connect_account;
delete from public.provider_connect_accounts where provider_id::text like '89100000-%';
alter table public.provider_connect_accounts enable trigger protect_provider_connect_account;
alter table public.provider_connect_account_identities disable trigger provider_connect_account_identities_immutable;
delete from public.provider_connect_account_identities where provider_id::text like '89100000-%';
alter table public.provider_connect_account_identities enable trigger provider_connect_account_identities_immutable;
delete from public.users where id::text like '89100000-%';
delete from auth.users where id::text like '89100000-%';

select 'admin UX consolidation tranche 1 tests passed' as result;
