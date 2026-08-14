\set ON_ERROR_STOP on

select set_config('storage.allow_delete_query', 'true', false);

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '40000000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
alter table public.admin_auth_events disable trigger admin_auth_events_immutable;
delete from public.admin_auth_events where user_id::text like '40000000-%';
alter table public.admin_auth_events enable trigger admin_auth_events_immutable;
delete from public.professional_verification_reviews
where professional_id::text like '40000000-%' or reviewer_id::text like '40000000-%';
delete from storage.objects where owner_id like '40000000-%';
delete from public.app_admins where user_id::text like '40000000-%';
delete from public.admin_account_roles where user_id::text like '40000000-%';
delete from public.admin_accounts where user_id::text like '40000000-%';
delete from public.users where id::text like '40000000-%';
delete from auth.users where id::text like '40000000-%';

insert into auth.users (id, email, raw_user_meta_data) values
  ('40000000-0000-0000-0000-000000000010', 'verification-admin@example.test',
   '{"requested_role":"client"}'::jsonb),
  ('40000000-0000-0000-0000-000000000020', 'verification-pro@example.test',
   '{"requested_role":"pro","business_name":"Verification Pro"}'::jsonb),
  ('40000000-0000-0000-0000-000000000030', 'verification-outsider@example.test',
   '{"requested_role":"client"}'::jsonb),
  ('40000000-0000-0000-0000-000000000040', 'verification-self-admin@example.test',
   '{"requested_role":"pro","business_name":"Self Review Pro"}'::jsonb);

update public.users
set onboarding_completed = true
where id::text like '40000000-%';

insert into public.app_admins (user_id, granted_by) values
  ('40000000-0000-0000-0000-000000000010', null),
  ('40000000-0000-0000-0000-000000000040',
   '40000000-0000-0000-0000-000000000010');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into storage.objects (bucket_id, name, owner_id) values (
  'verification-documents',
  'verification/id/40000000-0000-0000-0000-000000000020_identity-v1.pdf',
  '40000000-0000-0000-0000-000000000020'
);

update public.users
set id_document = 'verification/id/40000000-0000-0000-0000-000000000020_identity-v1.pdf'
where id = '40000000-0000-0000-0000-000000000020';

do $$
begin
  if (select verification_status from public.users
      where id = '40000000-0000-0000-0000-000000000020') <> 'pending' then
    raise exception 'Adding an ID document did not create a pending verification';
  end if;
  if (select verification_submitted_at from public.users
      where id = '40000000-0000-0000-0000-000000000020') is null then
    raise exception 'Pending verification has no submission timestamp';
  end if;

  begin
    update public.users
    set verification_status = 'verified'
    where id = '40000000-0000-0000-0000-000000000020';
    raise exception 'A professional directly verified their own profile';
  exception when insufficient_privilege then null;
  end;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000030', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if public.is_app_admin() then
    raise exception 'An unrelated user was recognized as an administrator';
  end if;

  begin
    perform public.list_pending_professional_verifications();
    raise exception 'An unrelated user listed private verification requests';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.review_professional_verification(
      '40000000-0000-0000-0000-000000000020', 'verified', null
    );
    raise exception 'An unrelated user reviewed a verification request';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.app_admins;
    raise exception 'An unrelated user read the administrator allowlist';
  exception when insufficient_privilege then null;
  end;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '40000000-0000-0000-0000-000000000010', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'verification-admin-session-1',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);

do $$
begin
  if not public.is_app_admin() then
    raise exception 'The appointed administrator was not recognized';
  end if;
  if (select count(*) from public.list_pending_professional_verifications()
      where professional_id = '40000000-0000-0000-0000-000000000020') <> 1 then
    raise exception 'The pending request is unavailable to the administrator';
  end if;
  if (select count(*) from storage.objects
      where bucket_id = 'verification-documents'
        and name = 'verification/id/40000000-0000-0000-0000-000000000020_identity-v1.pdf') <> 1 then
    raise exception 'The administrator cannot read the submitted ID document';
  end if;
end
$$;

select * from public.review_professional_verification(
  '40000000-0000-0000-0000-000000000020', 'verified', null
);

do $$
begin
  if (select verification_status from public.users
      where id = '40000000-0000-0000-0000-000000000020') <> 'verified' then
    raise exception 'The administrator approval was not persisted';
  end if;
  if (select verified_by from public.users
      where id = '40000000-0000-0000-0000-000000000020')
     <> '40000000-0000-0000-0000-000000000010' then
    raise exception 'The reviewer identity was not recorded';
  end if;
  if (select count(*) from public.professional_verification_reviews
      where professional_id = '40000000-0000-0000-0000-000000000020'
        and decision = 'verified') <> 1 then
    raise exception 'The approval audit event was not recorded exactly once';
  end if;
  if (select verification_status from public.get_public_profile(
      '40000000-0000-0000-0000-000000000020')) <> 'verified' then
    raise exception 'The approved status is unavailable through the public profile API';
  end if;

  begin
    perform public.review_professional_verification(
      '40000000-0000-0000-0000-000000000020', 'verified', null
    );
    raise exception 'A completed request was reviewed twice';
  exception when object_not_in_prerequisite_state then null;
  end;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

delete from storage.objects
where bucket_id = 'verification-documents'
  and name = 'verification/id/40000000-0000-0000-0000-000000000020_identity-v1.pdf';

do $$
begin
  if (select count(*) from storage.objects
      where bucket_id = 'verification-documents'
        and name = 'verification/id/40000000-0000-0000-0000-000000000020_identity-v1.pdf') <> 1 then
    raise exception 'A still-referenced verified document was deleted directly';
  end if;
end
$$;

insert into storage.objects (bucket_id, name, owner_id) values (
  'verification-documents',
  'verification/id/40000000-0000-0000-0000-000000000020_identity-v2.pdf',
  '40000000-0000-0000-0000-000000000020'
);

update public.users
set id_document = 'verification/id/40000000-0000-0000-0000-000000000020_identity-v2.pdf'
where id = '40000000-0000-0000-0000-000000000020';

delete from storage.objects
where bucket_id = 'verification-documents'
  and name = 'verification/id/40000000-0000-0000-0000-000000000020_identity-v1.pdf';

do $$
begin
  if (select verification_status from public.users
      where id = '40000000-0000-0000-0000-000000000020') <> 'pending' then
    raise exception 'Replacing an approved document did not invalidate verification';
  end if;
  if (select verified_at from public.users
      where id = '40000000-0000-0000-0000-000000000020') is not null then
    raise exception 'Replacing an approved document retained its verification timestamp';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = 'verification-documents'
      and name = 'verification/id/40000000-0000-0000-0000-000000000020_identity-v1.pdf'
  ) then
    raise exception 'A detached document could not be deleted by its owner';
  end if;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '40000000-0000-0000-0000-000000000010', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'verification-admin-session-2',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
select * from public.review_professional_verification(
  '40000000-0000-0000-0000-000000000020',
  'rejected',
  'The submitted ID is unreadable.'
);
commit;

do $$
begin
  if (select verification_status from public.users
      where id = '40000000-0000-0000-0000-000000000020') <> 'rejected' then
    raise exception 'The rejection was not persisted';
  end if;
  if (select verification_rejection_reason from public.users
      where id = '40000000-0000-0000-0000-000000000020')
     <> 'The submitted ID is unreadable.' then
    raise exception 'The professional cannot see the rejection reason';
  end if;
  if (select count(*) from public.professional_verification_reviews
      where professional_id = '40000000-0000-0000-0000-000000000020') <> 2 then
    raise exception 'The verification audit history is incomplete';
  end if;
  if (select verification_status from public.get_public_profile(
      '40000000-0000-0000-0000-000000000020')) <> 'unverified' then
    raise exception 'A rejected status leaked through the public profile API';
  end if;
end
$$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000040', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '40000000-0000-0000-0000-000000000040', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'verification-self-admin-session',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);

insert into storage.objects (bucket_id, name, owner_id) values (
  'verification-documents',
  'verification/id/40000000-0000-0000-0000-000000000040_identity.pdf',
  '40000000-0000-0000-0000-000000000040'
);
update public.users
set id_document = 'verification/id/40000000-0000-0000-0000-000000000040_identity.pdf'
where id = '40000000-0000-0000-0000-000000000040';

do $$
begin
  begin
    perform public.review_professional_verification(
      '40000000-0000-0000-0000-000000000040', 'verified', null
    );
    raise exception 'An administrator reviewed their own professional profile';
  exception when insufficient_privilege then null;
  end;
end
$$;
commit;

delete from public.professional_verification_reviews
where professional_id::text like '40000000-%' or reviewer_id::text like '40000000-%';
delete from storage.objects where owner_id like '40000000-%';
alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '40000000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
alter table public.admin_auth_events disable trigger admin_auth_events_immutable;
delete from public.admin_auth_events where user_id::text like '40000000-%';
alter table public.admin_auth_events enable trigger admin_auth_events_immutable;
delete from public.app_admins where user_id::text like '40000000-%';
delete from public.admin_account_roles where user_id::text like '40000000-%';
delete from public.admin_accounts where user_id::text like '40000000-%';
delete from public.users where id::text like '40000000-%';
delete from auth.users where id::text like '40000000-%';

select 'professional verification tests passed' as result;
