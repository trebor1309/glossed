\set ON_ERROR_STOP on

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log
where admin_account_id::text like 'b6000000-%'
   or entity_id like 'b6000000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
delete from public.client_operational_events where id::text like 'b6000000-%';
delete from public.admin_account_roles where user_id::text like 'b6000000-%';
delete from public.admin_accounts where user_id::text like 'b6000000-%';
delete from public.users where id::text like 'b6000000-%';
delete from auth.users where id::text like 'b6000000-%';

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values (
  'b6000000-0000-4000-8000-000000000001',
  'health-admin@example.test',
  clock_timestamp(),
  '{"account_type":"admin"}',
  '{}'
);
insert into public.admin_accounts (user_id, display_name)
values ('b6000000-0000-4000-8000-000000000001', 'Health administrator');
insert into public.admin_account_roles (user_id, role_code)
values ('b6000000-0000-4000-8000-000000000001', 'super_admin');

do $$
begin
  if has_table_privilege('anon', 'public.client_operational_events', 'select')
     or has_table_privilege('anon', 'public.client_operational_events', 'insert')
     or has_table_privilege('authenticated', 'public.client_operational_events', 'select')
     or has_function_privilege(
       'anon',
       'public.accept_client_operational_event(uuid,uuid,text,text,text,text,text,text,jsonb)',
       'execute'
     ) then
    raise exception 'Browser roles can access or forge operational events directly';
  end if;
end
$$;

begin;
set local role service_role;

select public.accept_client_operational_event(
  'b6000000-0000-4000-8000-000000000010', null,
  'maps_auth_failure', 'error', 'google_maps_browser_key_rejected',
  '/onboarding', 'test-release', repeat('c', 64),
  '{"locale":"fr-BE","online":true,"viewport":"1280x720"}'::jsonb
);

do $$
declare
  v_result jsonb;
begin
  v_result := public.accept_client_operational_event(
    'b6000000-0000-4000-8000-000000000010', null,
    'maps_auth_failure', 'error', 'google_maps_browser_key_rejected',
    '/onboarding', 'test-release', repeat('c', 64),
    '{"locale":"fr-BE","online":true,"viewport":"1280x720"}'::jsonb
  );
  if (v_result ->> 'created')::boolean then
    raise exception 'Idempotent operational retry was treated as newly created';
  end if;
  if (select count(*) from public.client_operational_events
      where id = 'b6000000-0000-4000-8000-000000000010') <> 1 then
    raise exception 'Operational event was not persisted exactly once';
  end if;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b6000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'b6000000-0000-4000-8000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'health-admin-session',
  'amr', jsonb_build_array(jsonb_build_object(
    'method', 'totp', 'timestamp', extract(epoch from clock_timestamp())::bigint
  ))
)::text, true);

do $$
declare
  v_health jsonb;
begin
  v_health := public.admin_list_operational_health('open', 'maps_auth_failure', 50, 0);
  if (v_health ->> 'total')::integer <> 1
     or not (v_health -> 'items' @> '[{"id":"b6000000-0000-4000-8000-000000000010"}]'::jsonb)
     or (v_health -> 'last_24_hours' ->> 'client_event_count')::integer < 1 then
    raise exception 'Operational health read model did not return the test event';
  end if;

  perform public.admin_update_operational_event(
    'b6000000-0000-4000-8000-000000000010', 'resolved',
    'Validated by the isolated beta readiness database test.',
    'b6000000-0000-4000-8000-000000000020'
  );
  perform public.admin_update_operational_event(
    'b6000000-0000-4000-8000-000000000010', 'resolved',
    'Validated by the isolated beta readiness database test.',
    'b6000000-0000-4000-8000-000000000020'
  );
end
$$;
commit;

do $$
begin
  if not exists (
    select 1 from public.client_operational_events
    where id = 'b6000000-0000-4000-8000-000000000010'
      and status = 'resolved' and resolved_at is not null and resolved_by is not null
  ) then
    raise exception 'Operational event was not resolved';
  end if;
  if not exists (
    select 1 from public.admin_audit_log
    where entity_id = 'b6000000-0000-4000-8000-000000000010'
      and action = 'operations.health.resolved'
  ) then
    raise exception 'Operational event resolution was not audited';
  end if;
end
$$;

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log
where admin_account_id::text like 'b6000000-%'
   or entity_id like 'b6000000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
delete from public.client_operational_events where id::text like 'b6000000-%';
delete from public.admin_account_roles where user_id::text like 'b6000000-%';
delete from public.admin_accounts where user_id::text like 'b6000000-%';
delete from public.users where id::text like 'b6000000-%';
delete from auth.users where id::text like 'b6000000-%';

select 'beta readiness hardening tests passed' as result;
