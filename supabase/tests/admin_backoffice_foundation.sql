\set ON_ERROR_STOP on

select set_config('storage.allow_delete_query', 'true', false);

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '81000000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
alter table public.admin_auth_events disable trigger admin_auth_events_immutable;
delete from public.admin_auth_events where user_id::text like '81000000-%';
alter table public.admin_auth_events enable trigger admin_auth_events_immutable;
delete from public.professional_verification_reviews
where professional_id::text like '81000000-%' or reviewer_id::text like '81000000-%';
delete from public.app_admins where user_id::text like '81000000-%';
delete from public.admin_account_roles where user_id::text like '81000000-%';
delete from public.admin_accounts where user_id::text like '81000000-%';
delete from storage.objects where owner_id like '81000000-%';
delete from public.users where id::text like '81000000-%';
delete from auth.users where id::text like '81000000-%';

insert into auth.users (id, email, raw_user_meta_data) values
  ('81000000-0000-0000-0000-000000000001', 'admin-verification@example.test', '{}'),
  ('81000000-0000-0000-0000-000000000002', 'admin-support@example.test', '{}'),
  ('81000000-0000-0000-0000-000000000003', 'admin-finance@example.test', '{}'),
  ('81000000-0000-0000-0000-000000000004', 'admin-outsider@example.test', '{}'),
  ('81000000-0000-0000-0000-000000000005', 'admin-provider@example.test',
    '{"requested_role":"pro","business_name":"Admin foundation provider"}');

insert into public.admin_accounts (user_id, display_name) values
  ('81000000-0000-0000-0000-000000000001', 'Verification admin'),
  ('81000000-0000-0000-0000-000000000002', 'Support admin'),
  ('81000000-0000-0000-0000-000000000003', 'Finance admin');
insert into public.admin_account_roles (user_id, role_code) values
  ('81000000-0000-0000-0000-000000000001', 'verification'),
  ('81000000-0000-0000-0000-000000000002', 'support'),
  ('81000000-0000-0000-0000-000000000003', 'finance');

insert into storage.objects (bucket_id, name, owner_id) values (
  'verification-documents',
  'verification/id/81000000-0000-0000-0000-000000000005_identity.pdf',
  '81000000-0000-0000-0000-000000000005'
);
update public.users set id_document =
  'verification/id/81000000-0000-0000-0000-000000000005_identity.pdf'
where id = '81000000-0000-0000-0000-000000000005';

-- A normal authenticated role and a direct URL cannot grant administration.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '81000000-0000-0000-0000-000000000004', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'admin-outsider-session',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
do $$
declare v_access jsonb;
begin
  v_access := public.get_my_admin_access('{"hostname":"admin.glossed.app"}'::jsonb);
  if (v_access ->> 'authorized')::boolean
     or (v_access ->> 'account_exists')::boolean then
    raise exception 'A normal user obtained administration access';
  end if;
  begin
    perform public.list_pending_professional_verifications();
    raise exception 'A normal user listed verification documents';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.admin_accounts;
    raise exception 'A browser role directly read admin accounts';
  exception when insufficient_privilege then null;
  end;
end
$$;
commit;

-- An assigned role without AAL2 is discoverable for MFA enrollment but cannot
-- read any back-office workflow.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '81000000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'aal', 'aal1', 'session_id', 'admin-verification-aal1',
  'amr', jsonb_build_array(jsonb_build_object('method', 'password',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
do $$
declare v_access jsonb;
begin
  v_access := public.get_my_admin_access('{}'::jsonb);
  if not (v_access ->> 'account_exists')::boolean
     or (v_access ->> 'authorized')::boolean then
    raise exception 'AAL1 admin bootstrap did not require MFA';
  end if;
  if public.is_app_admin() then
    raise exception 'Legacy admin guard accepted an AAL1 session';
  end if;
  begin
    perform public.list_pending_professional_verifications();
    raise exception 'AAL1 administrator read verification documents';
  exception when insufficient_privilege then null;
  end;
end
$$;
commit;

-- Verification permission plus AAL2 enables the existing workflow and creates
-- both its domain review and immutable administration audit records.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '81000000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'admin-verification-aal2',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
do $$
declare v_access jsonb;
begin
  v_access := public.get_my_admin_access('{"hostname":"admin.glossed.app"}'::jsonb);
  if not (v_access ->> 'authorized')::boolean
     or not ((v_access -> 'permissions') ? 'verification.review') then
    raise exception 'Verification administrator permissions are incomplete';
  end if;
  if (select count(*) from public.list_pending_professional_verifications()
      where professional_id = '81000000-0000-0000-0000-000000000005') <> 1 then
    raise exception 'Verification administrator cannot read the pending request';
  end if;
end
$$;
select * from public.review_professional_verification(
  '81000000-0000-0000-0000-000000000005', 'verified', null
);
commit;
do $$
begin
  if not exists (select 1 from public.admin_audit_log
    where admin_account_id = '81000000-0000-0000-0000-000000000001'
      and entity_id = '81000000-0000-0000-0000-000000000005'
      and action = 'verified' and outcome = 'success') then
    raise exception 'Verification action was not written to admin audit';
  end if;
end
$$;

-- Support cannot inherit verification powers from being an administrator.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '81000000-0000-0000-0000-000000000002', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'admin-support-aal2',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
do $$
begin
  if not public.has_admin_permission('users.read')
     or public.has_admin_permission('verification.read') then
    raise exception 'Support role permissions are not isolated';
  end if;
  begin
    perform public.list_pending_professional_verifications();
    raise exception 'Support role read provider verification documents';
  exception when insufficient_privilege then null;
  end;
end
$$;
commit;

-- Finance permissions require a fresh MFA timestamp, not merely an AAL2 JWT.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '81000000-0000-0000-0000-000000000003', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'admin-finance-old-mfa',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp() - interval '10 minutes')::bigint))
)::text, true);
do $$ begin
  if public.has_admin_permission('finance.execute') then
    raise exception 'Stale MFA enabled a financial permission';
  end if;
  if not public.has_admin_permission('finance.read') then
    raise exception 'Stale MFA unexpectedly blocked read-only finance access';
  end if;
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '81000000-0000-0000-0000-000000000003', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'admin-finance-fresh-mfa',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
do $$ begin
  if not public.has_admin_permission('finance.execute') then
    raise exception 'Fresh MFA did not enable the assigned financial permission';
  end if;
end $$;
commit;

do $$
begin
  begin
    update public.admin_audit_log set reason = 'tampered'
    where admin_account_id = '81000000-0000-0000-0000-000000000001';
    raise exception 'Administration audit was mutable';
  exception when insufficient_privilege then null;
  end;
end
$$;

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '81000000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
alter table public.admin_auth_events disable trigger admin_auth_events_immutable;
delete from public.admin_auth_events where user_id::text like '81000000-%';
alter table public.admin_auth_events enable trigger admin_auth_events_immutable;
delete from public.professional_verification_reviews
where professional_id::text like '81000000-%' or reviewer_id::text like '81000000-%';
delete from public.app_admins where user_id::text like '81000000-%';
delete from public.admin_account_roles where user_id::text like '81000000-%';
delete from public.admin_accounts where user_id::text like '81000000-%';
delete from storage.objects where owner_id like '81000000-%';
delete from public.users where id::text like '81000000-%';
delete from auth.users where id::text like '81000000-%';

select 'admin backoffice foundation tests passed' as result;
