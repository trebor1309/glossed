\set ON_ERROR_STOP on

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '89000000-%'
  or entity_id like '89000000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
delete from public.admin_account_change_previews where admin_id::text like '89000000-%'
  or target_user_id::text like '89000000-%';
delete from public.admin_account_roles where user_id::text like '89000000-%';
delete from public.admin_accounts where user_id::text like '89000000-%';
delete from public.users where id::text like '89000000-%';
delete from auth.users where id::text like '89000000-%';

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('89000000-0000-0000-0000-000000000001', 'account-manager@example.test', clock_timestamp(), '{"account_type":"admin"}', '{}'),
  ('89000000-0000-0000-0000-000000000002', 'trusted-admin@example.test', clock_timestamp(), '{"account_type":"admin"}', '{}'),
  ('89000000-0000-0000-0000-000000000003', 'consumer@example.test', clock_timestamp(), '{}', '{"requested_role":"client"}'),
  ('89000000-0000-0000-0000-000000000004', 'outsider@example.test', clock_timestamp(), '{"account_type":"admin"}', '{}');

insert into public.admin_accounts (user_id, display_name) values
  ('89000000-0000-0000-0000-000000000001', 'Account manager');
insert into public.admin_account_roles (user_id, role_code) values
  ('89000000-0000-0000-0000-000000000001', 'super_admin');

-- A normal authenticated identity cannot enumerate administrator accounts.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '89000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '89000000-0000-0000-0000-000000000004', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'admin-account-outsider',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
do $$ begin
  begin
    perform public.admin_list_administrators();
    raise exception 'Outsider listed administrator accounts';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

-- Listing needs read permission, while every mutation requires recent MFA.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '89000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '89000000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'admin-account-stale-mfa',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp() - interval '10 minutes')::bigint))
)::text, true);
do $$ declare v_list jsonb;
begin
  v_list := public.admin_list_administrators();
  if (v_list ->> 'total')::integer < 1 then
    raise exception 'Administrator read permission failed';
  end if;
  begin
    perform public.admin_preview_administrator_change(
      'activate', null, 'trusted-admin@example.test', 'Trusted admin', array['support'], null);
    raise exception 'Stale MFA previewed an administrator mutation';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

-- Fresh MFA activates only a trusted, confirmed admin identity. Execution is
-- idempotent and records the complete before/after audit.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '89000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '89000000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'admin-account-fresh-mfa',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
do $$
declare v_preview jsonb; v_result jsonb;
  v_operation uuid := '89000000-0000-0000-0000-000000000101';
begin
  begin
    perform public.admin_preview_administrator_change(
      'activate', null, 'consumer@example.test', 'Consumer', array['support'], null);
    raise exception 'A consumer identity was eligible for admin activation';
  exception when insufficient_privilege then null;
  end;

  v_preview := public.admin_preview_administrator_change(
    'activate', null, 'trusted-admin@example.test', 'Trusted admin',
    array['verification','support','support'], null);
  v_result := public.admin_execute_administrator_change(
    (v_preview ->> 'id')::uuid, 'Activation approved for support coverage.', v_operation);
  if v_result ->> 'status' <> 'active'
     or not ((v_result -> 'roles') ?& array['support','verification']) then
    raise exception 'Trusted administrator activation result is incomplete';
  end if;
  v_result := public.admin_execute_administrator_change(
    (v_preview ->> 'id')::uuid, 'Activation approved for support coverage.', v_operation);
  if not (v_result ->> 'idempotent')::boolean then
    raise exception 'Administrator activation retry was not idempotent';
  end if;

  begin
    perform public.admin_preview_administrator_change(
      'update', '89000000-0000-0000-0000-000000000001', null,
      'Self edit', array['super_admin'], null);
    raise exception 'Administrator previewed a self mutation';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

-- Two previews of the same revision cannot both commit.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '89000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '89000000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'admin-account-concurrency',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
do $$
declare v_first jsonb; v_second jsonb;
begin
  v_first := public.admin_preview_administrator_change(
    'update', '89000000-0000-0000-0000-000000000002', null,
    'First change', array['support'], null);
  v_second := public.admin_preview_administrator_change(
    'update', '89000000-0000-0000-0000-000000000002', null,
    'Second change', array['verification'], null);
  perform public.admin_execute_administrator_change(
    (v_first ->> 'id')::uuid, 'First concurrent change is approved.',
    '89000000-0000-0000-0000-000000000102');
  begin
    perform public.admin_execute_administrator_change(
      (v_second ->> 'id')::uuid, 'Second concurrent change is approved.',
      '89000000-0000-0000-0000-000000000103');
    raise exception 'A stale administrator preview was executed';
  exception when serialization_failure then null;
  end;
end $$;
commit;

-- The only active super-administrator cannot be suspended, even by another
-- temporarily-authorized manager. The transaction rolls back the test grant.
begin;
insert into public.admin_role_permissions (role_code, permission_code)
values ('support', 'administrators.manage') on conflict do nothing;
delete from public.admin_account_roles
where user_id = '89000000-0000-0000-0000-000000000001';
insert into public.admin_account_roles(user_id, role_code)
values ('89000000-0000-0000-0000-000000000001', 'support');
delete from public.admin_account_roles
where user_id = '89000000-0000-0000-0000-000000000002';
insert into public.admin_account_roles(user_id, role_code)
values ('89000000-0000-0000-0000-000000000002', 'super_admin');
update public.admin_accounts set status = 'suspended'
where user_id <> '89000000-0000-0000-0000-000000000002'
  and user_id in (select user_id from public.admin_account_roles where role_code = 'super_admin');
set local role authenticated;
select set_config('request.jwt.claim.sub', '89000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '89000000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'admin-account-last-super',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
do $$ declare v_preview jsonb;
begin
  v_preview := public.admin_preview_administrator_change(
    'set_status', '89000000-0000-0000-0000-000000000002', null, null, null, 'suspended');
  begin
    perform public.admin_execute_administrator_change(
      (v_preview ->> 'id')::uuid, 'Attempt to suspend the final super administrator.',
      '89000000-0000-0000-0000-000000000104');
    raise exception 'The last active super administrator was suspended';
  exception when check_violation then null;
  end;
end $$;
rollback;

do $$ begin
  if not exists (select 1 from public.admin_audit_log
    where event_type = 'administrator_account_changed'
      and entity_id = '89000000-0000-0000-0000-000000000002'
      and reason is not null and before_state <> '{}'::jsonb
      and after_state ? 'roles' and evidence ? 'operation_id') then
    raise exception 'Administrator change audit is incomplete';
  end if;
  begin
    update public.admin_audit_log set reason = 'tampered'
      where entity_id = '89000000-0000-0000-0000-000000000002';
    raise exception 'Administrator change audit was mutable';
  exception when insufficient_privilege then null;
  end;
end $$;

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '89000000-%'
  or entity_id like '89000000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
delete from public.admin_account_change_previews where admin_id::text like '89000000-%'
  or target_user_id::text like '89000000-%';
delete from public.admin_account_roles where user_id::text like '89000000-%';
delete from public.admin_accounts where user_id::text like '89000000-%';
delete from public.users where id::text like '89000000-%';
delete from auth.users where id::text like '89000000-%';

select 'admin account management tests passed' as result;
