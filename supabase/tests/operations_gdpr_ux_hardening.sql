\set ON_ERROR_STOP on

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log
where admin_account_id::text like '9b000000-%'
   or entity_id like '9b000000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
alter table public.data_subject_request_events disable trigger data_subject_request_events_immutable;
delete from public.data_subject_request_events
where request_id in (
  select id from public.data_subject_requests where subject_id::text like '9b000000-%'
);
alter table public.data_subject_request_events enable trigger data_subject_request_events_immutable;
delete from public.data_subject_requests where subject_id::text like '9b000000-%';
delete from public.contact_requests where id::text like '9b000000-%';
delete from public.admin_account_roles where user_id::text like '9b000000-%';
delete from public.admin_accounts where user_id::text like '9b000000-%';
delete from public.users where id::text like '9b000000-%';
delete from auth.users where id::text like '9b000000-%';

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('9b000000-0000-4000-8000-000000000001', 'privacy-admin@example.test', clock_timestamp(), '{"account_type":"admin"}', '{}'),
  ('9b000000-0000-4000-8000-000000000010', 'privacy-client@example.test', clock_timestamp(), '{}', '{"requested_role":"client","username":"privacy-client"}'),
  ('9b000000-0000-4000-8000-000000000020', 'privacy-pro@example.test', clock_timestamp(), '{}', '{"requested_role":"pro","username":"privacy-pro","business_name":"Privacy Pro"}');

insert into public.admin_accounts (user_id, display_name)
values ('9b000000-0000-4000-8000-000000000001', 'Privacy administrator');
insert into public.admin_account_roles (user_id, role_code)
values ('9b000000-0000-4000-8000-000000000001', 'super_admin');

insert into public.contact_requests (
  id, category, name, email, subject, message, locale, source_path,
  sender_fingerprint, delivery_status, provider_message_id, emailed_at
) values (
  '9b000000-0000-4000-8000-000000000030', 'account', 'Privacy Contact',
  'privacy-contact@example.test', 'Account support test',
  'This is an isolated administrator support queue test message.', 'en', '/contact',
  repeat('b', 64), 'email_sent', 'operations-gdpr-support-test', clock_timestamp()
);

do $$ begin
  if has_table_privilege('authenticated', 'public.data_subject_requests', 'select')
     or has_table_privilege('authenticated', 'public.data_subject_request_events', 'select') then
    raise exception 'Privacy request tables are directly exposed to browser roles';
  end if;
  if not has_function_privilege(
    'authenticated', 'public.submit_my_data_subject_request(text,text)', 'execute'
  ) then
    raise exception 'Authenticated users cannot submit a privacy request';
  end if;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '9b000000-0000-4000-8000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"9b000000-0000-4000-8000-000000000010","role":"authenticated"}', true);
select public.submit_my_data_subject_request(
  'erasure', 'Please close my test account and review the personal data attached to it.'
);
commit;

do $$
declare
  v_request public.data_subject_requests%rowtype;
begin
  select * into v_request from public.data_subject_requests
  where subject_id = '9b000000-0000-4000-8000-000000000010';
  if v_request.status <> 'received'
     or v_request.identity_verification_status <> 'authenticated_session'
     or v_request.subject_email <> 'privacy-client@example.test'
     or v_request.due_at <> v_request.received_at + interval '1 month' then
    raise exception 'The submitted privacy request has an invalid initial state or deadline';
  end if;
  if (select count(*) from public.data_subject_request_events
      where request_id = v_request.id and actor_type = 'subject' and new_status = 'received') <> 1 then
    raise exception 'The subject submission event was not recorded exactly once';
  end if;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '9b000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '9b000000-0000-4000-8000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'privacy-admin-session',
  'amr', jsonb_build_array(jsonb_build_object(
    'method', 'totp', 'timestamp', extract(epoch from clock_timestamp())::bigint
  ))
)::text, true);

do $$
declare
  v_request_id uuid;
  v_client_results jsonb;
  v_pro_results jsonb;
  v_privacy_results jsonb;
  v_support_results jsonb;
begin
  v_client_results := public.admin_list_users(null, 'client', 50, 0);
  v_pro_results := public.admin_list_users(null, 'pro', 50, 0);
  if not (v_client_results -> 'items' @> '[{"id":"9b000000-0000-4000-8000-000000000010"}]'::jsonb)
     or (v_client_results -> 'items' @> '[{"id":"9b000000-0000-4000-8000-000000000020"}]'::jsonb)
     or not (v_pro_results -> 'items' @> '[{"id":"9b000000-0000-4000-8000-000000000020"}]'::jsonb) then
    raise exception 'The administrator user role filter returned incorrect accounts';
  end if;

  v_privacy_results := public.admin_list_data_subject_requests('open', 'erasure', 'privacy-client', 50, 0);
  if (v_privacy_results ->> 'total')::integer <> 1 then
    raise exception 'The privacy administrator queue did not return the submitted request';
  end if;
  v_request_id := (v_privacy_results -> 'items' -> 0 ->> 'id')::uuid;
  if v_request_id is null then
    raise exception 'The privacy administrator queue did not expose the request identifier';
  end if;

  v_support_results := public.admin_list_contact_requests('open', 'account', 'privacy-contact', 50, 0);
  if (v_support_results ->> 'total')::integer <> 1 then
    raise exception 'The administrator support queue did not return the contact request';
  end if;
  perform public.admin_update_contact_request(
    '9b000000-0000-4000-8000-000000000030', 'closed',
    'Resolved by the isolated SQL test procedure.',
    '9b000000-0000-4000-8000-000000000104'
  );

  perform public.admin_update_data_subject_request(
    v_request_id, 'identity_check', 'Additional identity verification requested.',
    '9b000000-0000-4000-8000-000000000101'
  );
  perform public.admin_update_data_subject_request(
    v_request_id, 'in_progress', 'Identity verified using the approved support procedure.',
    '9b000000-0000-4000-8000-000000000102'
  );
  perform public.admin_update_data_subject_request(
    v_request_id, 'completed', 'Test request completed without deleting production data.',
    '9b000000-0000-4000-8000-000000000103'
  );
  perform public.admin_update_data_subject_request(
    v_request_id, 'completed', 'Test request completed without deleting production data.',
    '9b000000-0000-4000-8000-000000000103'
  );
end $$;
commit;

do $$
declare
  v_request_id uuid;
begin
  select id into v_request_id from public.data_subject_requests
  where subject_id = '9b000000-0000-4000-8000-000000000010';
  if not exists (
    select 1 from public.data_subject_requests
    where id = v_request_id and status = 'completed' and responded_at is not null
      and identity_verification_status = 'verified'
  ) then
    raise exception 'The privacy request did not reach the expected terminal state';
  end if;
  if (select count(*) from public.data_subject_request_events where request_id = v_request_id) <> 4 then
    raise exception 'The immutable privacy request history is incomplete or duplicated';
  end if;
  if not exists (
    select 1 from public.admin_audit_log
    where entity_id = v_request_id::text
      and event_type = 'data_subject_request_status_changed'
      and action = 'privacy.request.completed'
  ) then
    raise exception 'The privacy request resolution was not added to the admin audit';
  end if;
  if not exists (
    select 1 from public.contact_requests
    where id = '9b000000-0000-4000-8000-000000000030'
      and case_status = 'closed' and closed_at is not null
  ) then
    raise exception 'The administrator support request was not closed';
  end if;
end $$;

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log
where admin_account_id::text like '9b000000-%'
   or entity_id like '9b000000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
alter table public.data_subject_request_events disable trigger data_subject_request_events_immutable;
delete from public.data_subject_request_events
where request_id in (
  select id from public.data_subject_requests where subject_id::text like '9b000000-%'
);
alter table public.data_subject_request_events enable trigger data_subject_request_events_immutable;
delete from public.data_subject_requests where subject_id::text like '9b000000-%';
delete from public.contact_requests where id::text like '9b000000-%';
delete from public.admin_account_roles where user_id::text like '9b000000-%';
delete from public.admin_accounts where user_id::text like '9b000000-%';
delete from public.users where id::text like '9b000000-%';
delete from auth.users where id::text like '9b000000-%';

select 'operations GDPR and UX hardening tests passed' as result;
