\set ON_ERROR_STOP on

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '9a000000-%'
  or entity_id like '9a000000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
alter table public.user_account_control_events disable trigger user_account_control_events_immutable;
delete from public.user_account_control_events where user_id::text like '9a000000-%';
alter table public.user_account_control_events enable trigger user_account_control_events_immutable;
delete from public.admin_user_account_change_operations where target_user_id::text like '9a000000-%';
delete from public.user_account_controls where user_id::text like '9a000000-%';
alter table public.provider_eligibility_assessments disable trigger provider_eligibility_assessments_immutable;
delete from public.provider_eligibility_assessments where provider_id::text like '9a000000-%';
alter table public.provider_eligibility_assessments enable trigger provider_eligibility_assessments_immutable;
alter table public.provider_eligibility_declarations disable trigger provider_eligibility_declarations_immutable;
delete from public.provider_eligibility_declarations where provider_id::text like '9a000000-%';
alter table public.provider_eligibility_declarations enable trigger provider_eligibility_declarations_immutable;
alter table public.provider_eligibility_policy_versions disable trigger provider_eligibility_policy_versions_immutable;
delete from public.provider_eligibility_policy_versions where version = 'be_admin_controls_test_v1';
alter table public.provider_eligibility_policy_versions enable trigger provider_eligibility_policy_versions_immutable;
delete from public.admin_account_roles where user_id::text like '9a000000-%';
delete from public.admin_accounts where user_id::text like '9a000000-%';
delete from public.users where id::text like '9a000000-%';
delete from auth.users where id::text like '9a000000-%';

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('9a000000-0000-4000-8000-000000000001', 'controls-admin@example.test', clock_timestamp(), '{"account_type":"admin"}', '{}'),
  ('9a000000-0000-4000-8000-000000000010', 'controls-client@example.test', clock_timestamp(), '{}', '{"requested_role":"client"}'),
  ('9a000000-0000-4000-8000-000000000020', 'controls-provider@example.test', clock_timestamp(), '{}', '{"requested_role":"pro","business_name":"Controls provider"}');

insert into public.admin_accounts (user_id, display_name)
values ('9a000000-0000-4000-8000-000000000001', 'Controls administrator');
insert into public.admin_account_roles (user_id, role_code)
values ('9a000000-0000-4000-8000-000000000001', 'super_admin');

do $$ begin
  if not exists (select 1 from public.user_account_controls
    where user_id = '9a000000-0000-4000-8000-000000000010' and status = 'active') then
    raise exception 'New users did not receive an active account control';
  end if;
  if has_table_privilege('authenticated', 'public.user_account_controls', 'select')
     or has_function_privilege('authenticated', 'public.complete_admin_user_account_change(uuid,jsonb)', 'execute') then
    raise exception 'Browser roles can inspect or complete account controls directly';
  end if;
end $$;

-- A stale MFA session cannot initiate the sensitive mutation.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '9a000000-0000-4000-8000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'controls-stale-mfa',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp() - interval '10 minutes')::bigint))
)::text, true);
do $$ begin
  begin
    perform public.admin_begin_user_account_change(
      '9a000000-0000-4000-8000-000000000010', 'suspended',
      'Repeated abusive behavior confirmed by support.',
      '9a000000-0000-4000-8000-000000000101');
    raise exception 'Stale MFA initiated an account suspension';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

-- Fresh MFA creates a pending, exact-payload idempotent operation. Only the
-- service-role completion commits the local state after Auth synchronization.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '9a000000-0000-4000-8000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'controls-fresh-mfa',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
select public.admin_begin_user_account_change(
  '9a000000-0000-4000-8000-000000000010', 'suspended',
  'Repeated abusive behavior confirmed by support.',
  '9a000000-0000-4000-8000-000000000101');
commit;
reset role;
do $$ begin
  if (select status from public.user_account_controls
      where user_id = '9a000000-0000-4000-8000-000000000010') <> 'active' then
    raise exception 'Pending Auth synchronization changed local account state';
  end if;
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set role service_role;
select public.complete_admin_user_account_change(
  '9a000000-0000-4000-8000-000000000101',
  '{"provider":"supabase_auth","target_status":"suspended"}'::jsonb
);
select public.complete_admin_user_account_change(
  '9a000000-0000-4000-8000-000000000101',
  '{"provider":"supabase_auth","target_status":"suspended"}'::jsonb
);
reset role;

do $$ begin
  if (select status from public.user_account_controls
      where user_id = '9a000000-0000-4000-8000-000000000010') <> 'suspended'
     or (select count(*) from public.user_account_control_events
      where operation_id = '9a000000-0000-4000-8000-000000000101') <> 1 then
    raise exception 'Suspension was not committed exactly once';
  end if;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"9a000000-0000-4000-8000-000000000010","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.enforce_active_user_account();
    raise exception 'Suspended user passed the Data API pre-request guard';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

-- Reactivation is a second explicit and audited operation.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '9a000000-0000-4000-8000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'controls-reactivate',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
select public.admin_begin_user_account_change(
  '9a000000-0000-4000-8000-000000000010', 'active',
  'Support review completed and access may safely resume.',
  '9a000000-0000-4000-8000-000000000102');
commit;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set role service_role;
select public.complete_admin_user_account_change(
  '9a000000-0000-4000-8000-000000000102',
  '{"provider":"supabase_auth","target_status":"active"}'::jsonb
);
reset role;

-- The same back office can create a legally reviewed policy version and then
-- record an eligibility decision against the provider's latest declaration.
insert into public.provider_eligibility_declarations (
  id, provider_id, revision, residence_country_code,
  tax_residence_country_codes, service_country_code, provider_status_code,
  trader_classification, actor_type, actor_user_id, deduplication_key
) values (
  '9a000000-0000-4000-8000-000000000201',
  '9a000000-0000-4000-8000-000000000020', 1, 'BE', array['BE'], 'BE',
  'sole_trader', 'trader', 'provider', '9a000000-0000-4000-8000-000000000020',
  'admin-controls-provider-declaration'
);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '9a000000-0000-4000-8000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'controls-eligibility',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
select public.admin_create_provider_eligibility_policy_version(
  'be_admin_controls_test_v1',
  jsonb_build_object(
    'jurisdiction_code', 'BE', 'residence_country_code', 'BE',
    'service_country_code', 'BE', 'provider_status_code', 'sole_trader',
    'requirement_definitions', jsonb_build_array(jsonb_build_object('description', 'Test evidence')),
    'effective_from', (clock_timestamp() - interval '1 minute')::text,
    'notes', 'SQL test policy only'
  ),
  'Create the isolated administrator controls SQL test policy.'
);
select public.admin_record_provider_eligibility_assessment(
  '9a000000-0000-4000-8000-000000000020', 'be_admin_controls_test_v1', '*',
  'eligible', clock_timestamp() + interval '30 days',
  'The submitted test evidence satisfies the selected test policy.',
  '9a000000-0000-4000-8000-000000000202'
);
commit;

do $$ declare v_context jsonb;
begin
  if (select status from public.user_account_controls
      where user_id = '9a000000-0000-4000-8000-000000000010') <> 'active'
     or (select count(*) from public.user_account_control_events
      where user_id = '9a000000-0000-4000-8000-000000000010') <> 2 then
    raise exception 'Reactivation state or history is incomplete';
  end if;
  if not exists (select 1 from public.provider_eligibility_assessments
    where provider_id = '9a000000-0000-4000-8000-000000000020'
      and policy_version = 'be_admin_controls_test_v1' and status = 'eligible') then
    raise exception 'Provider eligibility decision was not recorded';
  end if;
  if not exists (select 1 from public.admin_audit_log
    where entity_id = '9a000000-0000-4000-8000-000000000010'
      and event_type = 'user_account_status_changed') then
    raise exception 'Account control did not enter the immutable admin audit';
  end if;
end $$;

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '9a000000-%'
  or entity_id like '9a000000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
alter table public.user_account_control_events disable trigger user_account_control_events_immutable;
delete from public.user_account_control_events where user_id::text like '9a000000-%';
alter table public.user_account_control_events enable trigger user_account_control_events_immutable;
delete from public.admin_user_account_change_operations where target_user_id::text like '9a000000-%';
delete from public.user_account_controls where user_id::text like '9a000000-%';
alter table public.provider_eligibility_assessments disable trigger provider_eligibility_assessments_immutable;
delete from public.provider_eligibility_assessments where provider_id::text like '9a000000-%';
alter table public.provider_eligibility_assessments enable trigger provider_eligibility_assessments_immutable;
alter table public.provider_eligibility_declarations disable trigger provider_eligibility_declarations_immutable;
delete from public.provider_eligibility_declarations where provider_id::text like '9a000000-%';
alter table public.provider_eligibility_declarations enable trigger provider_eligibility_declarations_immutable;
alter table public.provider_eligibility_policy_versions disable trigger provider_eligibility_policy_versions_immutable;
delete from public.provider_eligibility_policy_versions where version = 'be_admin_controls_test_v1';
alter table public.provider_eligibility_policy_versions enable trigger provider_eligibility_policy_versions_immutable;
delete from public.admin_account_roles where user_id::text like '9a000000-%';
delete from public.admin_accounts where user_id::text like '9a000000-%';
delete from public.users where id::text like '9a000000-%';
delete from auth.users where id::text like '9a000000-%';

select 'admin user account controls tests passed' as result;
