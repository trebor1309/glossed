\set ON_ERROR_STOP on

select set_config('app.test_database_url', :'TEST_DATABASE_URL', false);

do $$
begin
  if has_table_privilege('authenticated', 'public.review_replies_v1', 'select')
     or has_table_privilege('authenticated', 'public.review_reports_v1', 'select')
     or has_table_privilege('authenticated', 'public.review_reply_operations_v1', 'select')
     or has_table_privilege('authenticated', 'public.review_moderation_operations_v1', 'select') then
    raise exception 'Private reputation moderation storage is exposed to browser roles';
  end if;
  if not has_function_privilege(
       'authenticated', 'public.submit_review_reply_v1(uuid,uuid,text)', 'execute'
     ) or has_function_privilege(
       'anon', 'public.submit_review_reply_v1(uuid,uuid,text)', 'execute'
     ) or not has_function_privilege(
       'authenticated', 'public.report_review_v1(uuid,uuid,text,text)', 'execute'
     ) or has_function_privilege(
       'anon', 'public.report_review_v1(uuid,uuid,text,text)', 'execute'
     ) then
    raise exception 'Reply or report RPC privileges are incorrect';
  end if;
  if (select count(*) from public.admin_permission_definitions
      where permission_code in ('reputation.read', 'reputation.moderate')
        and not requires_recent_mfa) <> 2
     or (select count(*) from public.admin_role_permissions
         where role_code = 'support'
           and permission_code in ('reputation.read', 'reputation.moderate')) <> 2
     or (select count(*) from public.admin_role_permissions
         where role_code = 'super_admin'
           and permission_code in ('reputation.read', 'reputation.moderate')) <> 2 then
    raise exception 'Reputation moderation permissions are incomplete';
  end if;
end
$$;

insert into auth.users (
  id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data
) values
  ('43000000-0000-0000-0000-000000000010', 'moderation-client@example.test', now(),
   '{}'::jsonb, '{"requested_role":"client","username":"moderation-client"}'::jsonb),
  ('43000000-0000-0000-0000-000000000020', 'moderation-provider@example.test', now(),
   '{}'::jsonb, '{"requested_role":"pro","username":"moderation-provider","business_name":"Moderation Pro"}'::jsonb),
  ('43000000-0000-0000-0000-000000000030', 'moderation-reporter-one@example.test', now(),
   '{}'::jsonb, '{"requested_role":"client","username":"moderation-reporter-one"}'::jsonb),
  ('43000000-0000-0000-0000-000000000040', 'moderation-reporter-two@example.test', now(),
   '{}'::jsonb, '{"requested_role":"client","username":"moderation-reporter-two"}'::jsonb),
  ('43000000-0000-0000-0000-000000000050', 'moderation-support@example.test', now(),
   '{"account_type":"admin"}'::jsonb, '{}'::jsonb),
  ('43000000-0000-0000-0000-000000000060', 'moderation-verification@example.test', now(),
   '{"account_type":"admin"}'::jsonb, '{}'::jsonb);

update public.users
set role = 'pro', active_role = 'pro', onboarding_completed = true,
    verification_status = 'verified', accepting_clients = true,
    business_type = array['Hair Stylist']
where id = '43000000-0000-0000-0000-000000000020';
update public.users set onboarding_completed = true
where id in (
  '43000000-0000-0000-0000-000000000010',
  '43000000-0000-0000-0000-000000000030',
  '43000000-0000-0000-0000-000000000040'
);

insert into public.admin_accounts (user_id, display_name) values
  ('43000000-0000-0000-0000-000000000050', 'Moderation support'),
  ('43000000-0000-0000-0000-000000000060', 'Verification only');
insert into public.admin_account_roles (user_id, role_code) values
  ('43000000-0000-0000-0000-000000000050', 'support'),
  ('43000000-0000-0000-0000-000000000060', 'verification');

insert into public.missions (
  id, client_id, pro_id, service, description, date, duration,
  price, status, paid_at
) values
  ('43000000-0000-0000-0000-000000000101',
   '43000000-0000-0000-0000-000000000010',
   '43000000-0000-0000-0000-000000000020',
   'Test service', 'Moderation review one', now() - interval '7 days', null,
   50, 'completed', now() - interval '8 days'),
  ('43000000-0000-0000-0000-000000000102',
   '43000000-0000-0000-0000-000000000010',
   '43000000-0000-0000-0000-000000000020',
   'Test service', 'Moderation review two', now() - interval '6 days', null,
   50, 'completed', now() - interval '7 days'),
  ('43000000-0000-0000-0000-000000000103',
   '43000000-0000-0000-0000-000000000010',
   '43000000-0000-0000-0000-000000000020',
   'Test service', 'Moderation review three', now() - interval '5 days', null,
   50, 'completed', now() - interval '6 days');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select * from public.submit_review_v1(
  '43000000-0000-0000-0000-000000000201',
  '43000000-0000-0000-0000-000000000101', 5::smallint, 'Review one'
);
select * from public.submit_review_v1(
  '43000000-0000-0000-0000-000000000202',
  '43000000-0000-0000-0000-000000000102', 4::smallint, 'Review two'
);
select * from public.submit_review_v1(
  '43000000-0000-0000-0000-000000000203',
  '43000000-0000-0000-0000-000000000103', 3::smallint, 'Review three'
);
commit;

create temporary table moderation_review_ids as
select mission_id, id as review_id from public.reviews
where mission_id::text like '43000000-%';
grant select on moderation_review_ids to authenticated, anon;

-- Only the evaluated provider can publish the single immutable reply.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    perform * from public.submit_review_reply_v1(
      '43000000-0000-0000-0000-000000000301',
      (select review_id from moderation_review_ids
       where mission_id = '43000000-0000-0000-0000-000000000101'),
      'Not the provider'
    );
    raise exception 'The review author replied as the provider';
  exception when insufficient_privilege then null;
  end;
end
$$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
create temporary table first_reply_result as
select * from public.submit_review_reply_v1(
  '43000000-0000-0000-0000-000000000302',
  (select review_id from moderation_review_ids
   where mission_id = '43000000-0000-0000-0000-000000000101'),
  '  Thank you for your review.  '
);
do $$
declare v_replay record;
begin
  if (select content from first_reply_result) <> 'Thank you for your review.'
     or (select idempotent from first_reply_result) then
    raise exception 'Provider reply was not normalized and created correctly';
  end if;
  select * into v_replay from public.submit_review_reply_v1(
    '43000000-0000-0000-0000-000000000302',
    (select review_id from moderation_review_ids
     where mission_id = '43000000-0000-0000-0000-000000000101'),
    'Thank you for your review.'
  );
  if not v_replay.idempotent
     or v_replay.reply_id <> (select reply_id from first_reply_result) then
    raise exception 'Reply replay did not return the retained reply';
  end if;
  begin
    perform * from public.submit_review_reply_v1(
      '43000000-0000-0000-0000-000000000302',
      (select review_id from moderation_review_ids
       where mission_id = '43000000-0000-0000-0000-000000000101'),
      'Changed reply'
    );
    raise exception 'Changed reply reused an operation_id';
  exception when unique_violation then null;
  end;
  begin
    perform * from public.submit_review_reply_v1(
      '43000000-0000-0000-0000-000000000303',
      (select review_id from moderation_review_ids
       where mission_id = '43000000-0000-0000-0000-000000000101'),
      'A second reply'
    );
    raise exception 'A second provider reply was accepted';
  exception when unique_violation then null;
  end;
  begin
    perform * from public.submit_review_reply_v1(
      '43000000-0000-0000-0000-000000000304',
      (select review_id from moderation_review_ids
       where mission_id = '43000000-0000-0000-0000-000000000102'),
      repeat('x', 2001)
    );
    raise exception 'An oversized provider reply was accepted';
  exception when invalid_parameter_value then null;
  end;
end
$$;
commit;

do $$
begin
  if (select count(*) from public.notifications
      where event_type = 'review_reply_received'
        and recipient_id = '43000000-0000-0000-0000-000000000010'
        and entity_id = (select review_id from moderation_review_ids
          where mission_id = '43000000-0000-0000-0000-000000000101')) <> 1 then
    raise exception 'Reply notification was absent or duplicated';
  end if;
  begin
    update public.review_replies_v1 set content = 'Tampered'
    where id = (select reply_id from first_reply_result);
    raise exception 'A published reply was edited';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.review_replies_v1
    where id = (select reply_id from first_reply_result);
    raise exception 'A provider reply was physically deleted';
  exception when insufficient_privilege then null;
  end;
end
$$;

set role anon;
do $$
declare v_public jsonb;
begin
  select to_jsonb(result) into v_public
  from public.get_public_reviews(
    '43000000-0000-0000-0000-000000000020', 50, null, null
  ) result
  where result.id = (select review_id from moderation_review_ids
    where mission_id = '43000000-0000-0000-0000-000000000101');
  if v_public ->> 'provider_reply' <> 'Thank you for your review.'
     or (v_public ->> 'provider_replied_at') is null
     or v_public ?| array[
       'provider_id', 'mission_id', 'reporter_id', 'reason_code', 'explanation'
     ] then
    raise exception 'Public reply projection is missing or exposes private data';
  end if;
end
$$;
reset role;

-- Concurrent reply retries converge on one retained reply.
create or replace function public.reputation_test_reply_concurrently()
returns table (
  reply_id uuid, review_id uuid, content text,
  created_at timestamptz, idempotent boolean
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000020', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  return query select * from public.submit_review_reply_v1(
    '43000000-0000-0000-0000-000000000305',
    (select id from public.reviews
     where mission_id = '43000000-0000-0000-0000-000000000102'),
    'Concurrent provider reply'
  );
end
$$;
revoke all on function public.reputation_test_reply_concurrently()
from public, anon, authenticated;
grant execute on function public.reputation_test_reply_concurrently() to service_role;

select extensions.dblink_connect_u('review_reply_1', current_setting('app.test_database_url'));
select extensions.dblink_connect_u('review_reply_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('review_reply_1',
  'select * from public.reputation_test_reply_concurrently()');
select extensions.dblink_send_query('review_reply_2',
  'select * from public.reputation_test_reply_concurrently()');
create temporary table concurrent_reply_results (
  reply_id uuid, review_id uuid, content text,
  created_at timestamptz, idempotent boolean
);
insert into concurrent_reply_results
select * from extensions.dblink_get_result('review_reply_1') as result(
  reply_id uuid, review_id uuid, content text,
  created_at timestamptz, idempotent boolean
);
insert into concurrent_reply_results
select * from extensions.dblink_get_result('review_reply_2') as result(
  reply_id uuid, review_id uuid, content text,
  created_at timestamptz, idempotent boolean
);
select extensions.dblink_disconnect('review_reply_1');
select extensions.dblink_disconnect('review_reply_2');
drop function public.reputation_test_reply_concurrently();

do $$
begin
  if (select count(*) from concurrent_reply_results) <> 2
     or (select count(distinct reply_id) from concurrent_reply_results) <> 1
     or (select count(*) from concurrent_reply_results where idempotent) <> 1
     or (select count(*) from public.review_replies_v1
         where review_id = (select review_id from moderation_review_ids
           where mission_id = '43000000-0000-0000-0000-000000000102')) <> 1 then
    raise exception 'Concurrent reply retries did not converge';
  end if;
end
$$;

-- Private reports are idempotent and never alter review publication directly.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000030', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
create temporary table first_report_result as
select * from public.report_review_v1(
  '43000000-0000-0000-0000-000000000310',
  (select review_id from moderation_review_ids
   where mission_id = '43000000-0000-0000-0000-000000000101'),
  'other', '  Context for the moderation team only.  '
);
do $$
declare v_replay record;
begin
  select * into v_replay from public.report_review_v1(
    '43000000-0000-0000-0000-000000000310',
    (select review_id from moderation_review_ids
     where mission_id = '43000000-0000-0000-0000-000000000101'),
    'other', 'Context for the moderation team only.'
  );
  if not v_replay.idempotent
     or v_replay.report_id <> (select report_id from first_report_result) then
    raise exception 'Report replay did not return the retained report';
  end if;
  begin
    perform * from public.report_review_v1(
      '43000000-0000-0000-0000-000000000310',
      (select review_id from moderation_review_ids
       where mission_id = '43000000-0000-0000-0000-000000000101'),
      'spam_or_commercial', null
    );
    raise exception 'Changed report reused an operation_id';
  exception when unique_violation then null;
  end;
  begin
    perform * from public.report_review_v1(
      '43000000-0000-0000-0000-000000000311',
      (select review_id from moderation_review_ids
       where mission_id = '43000000-0000-0000-0000-000000000101'),
      'spam_or_commercial', null
    );
    raise exception 'The same user reported one review twice';
  exception when unique_violation then null;
  end;
  begin
    perform * from public.report_review_v1(
      '43000000-0000-0000-0000-000000000312',
      (select review_id from moderation_review_ids
       where mission_id = '43000000-0000-0000-0000-000000000102'),
      'other', null
    );
    raise exception 'An other report without explanation was accepted';
  exception when invalid_parameter_value then null;
  end;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000040', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select * from public.report_review_v1(
  '43000000-0000-0000-0000-000000000313',
  (select review_id from moderation_review_ids
   where mission_id = '43000000-0000-0000-0000-000000000101'),
  'spam_or_commercial', null
);
commit;

do $$
begin
  if (select status from public.reviews
      where id = (select review_id from moderation_review_ids
       where mission_id = '43000000-0000-0000-0000-000000000101')) <> 'published'
     or (select count(*) from public.get_public_reviews(
          '43000000-0000-0000-0000-000000000020', 50, null, null
        ) where id = (select review_id from moderation_review_ids
          where mission_id = '43000000-0000-0000-0000-000000000101')) <> 1 then
    raise exception 'Reporting changed public review visibility';
  end if;
end
$$;

-- Concurrent report retries also converge on one private report.
create or replace function public.reputation_test_report_concurrently()
returns table (
  report_id uuid, review_id uuid, reason_code text,
  status text, created_at timestamptz, idempotent boolean
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000030', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  return query select * from public.report_review_v1(
    '43000000-0000-0000-0000-000000000314',
    (select id from public.reviews
     where mission_id = '43000000-0000-0000-0000-000000000102'),
    'off_topic_or_misleading', 'Concurrent report'
  );
end
$$;
revoke all on function public.reputation_test_report_concurrently()
from public, anon, authenticated;
grant execute on function public.reputation_test_report_concurrently() to service_role;

select extensions.dblink_connect_u('review_report_1', current_setting('app.test_database_url'));
select extensions.dblink_connect_u('review_report_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('review_report_1',
  'select * from public.reputation_test_report_concurrently()');
select extensions.dblink_send_query('review_report_2',
  'select * from public.reputation_test_report_concurrently()');
create temporary table concurrent_report_results (
  report_id uuid, review_id uuid, reason_code text,
  status text, created_at timestamptz, idempotent boolean
);
insert into concurrent_report_results
select * from extensions.dblink_get_result('review_report_1') as result(
  report_id uuid, review_id uuid, reason_code text,
  status text, created_at timestamptz, idempotent boolean
);
insert into concurrent_report_results
select * from extensions.dblink_get_result('review_report_2') as result(
  report_id uuid, review_id uuid, reason_code text,
  status text, created_at timestamptz, idempotent boolean
);
select extensions.dblink_disconnect('review_report_1');
select extensions.dblink_disconnect('review_report_2');
drop function public.reputation_test_report_concurrently();

do $$
begin
  if (select count(*) from concurrent_report_results) <> 2
     or (select count(distinct report_id) from concurrent_report_results) <> 1
     or (select count(*) from concurrent_report_results where idempotent) <> 1 then
    raise exception 'Concurrent report retries did not converge';
  end if;
end
$$;

-- AAL2 and the dedicated permissions protect every private admin projection.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000050', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '43000000-0000-0000-0000-000000000050', 'role', 'authenticated',
  'aal', 'aal1', 'session_id', 'moderation-support-aal1'
)::text, true);
do $$
begin
  begin
    perform public.admin_get_reputation_moderation_counts();
    raise exception 'AAL1 support read private reports';
  exception when insufficient_privilege then null;
  end;
end
$$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000060', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '43000000-0000-0000-0000-000000000060', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'moderation-verification-aal2'
)::text, true);
do $$
begin
  begin
    perform public.admin_get_reputation_moderation_counts();
    raise exception 'Verification-only admin read reputation reports';
  exception when insufficient_privilege then null;
  end;
end
$$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000050', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '43000000-0000-0000-0000-000000000050', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'moderation-support-aal2'
)::text, true);
do $$
declare v_counts jsonb; v_list jsonb; v_detail jsonb;
begin
  v_counts := public.admin_get_reputation_moderation_counts();
  v_list := public.admin_list_reported_reviews('open', 10, 0);
  v_detail := public.admin_get_reported_review_detail(
    (select review_id from moderation_review_ids
     where mission_id = '43000000-0000-0000-0000-000000000101')
  );
  if (v_counts ->> 'open')::integer <> 2
     or (v_list ->> 'total')::integer <> 2
     or jsonb_array_length(v_detail -> 'reports') <> 2
     or not ((v_detail -> 'reports')::text like '%Context for the moderation team only.%')
     or v_detail ?| array['payment', 'transfer', 'refund', 'ledger'] then
    raise exception 'Admin moderation read models are incomplete or include finance data';
  end if;
end
$$;
commit;

-- Keeping a published review resolves reports without changing reputation.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000050', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '43000000-0000-0000-0000-000000000050', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'moderation-support-aal2'
)::text, true);
create temporary table keep_result as
select * from public.admin_moderate_review_v1(
  '43000000-0000-0000-0000-000000000401',
  (select review_id from moderation_review_ids
   where mission_id = '43000000-0000-0000-0000-000000000101'),
  'published', 'Reports reviewed; the review follows the publication rules.'
);
do $$
declare v_replay record;
begin
  if (select resolved_report_count from keep_result) <> 2
     or (select idempotent from keep_result) then
    raise exception 'Keep-published moderation did not resolve both reports';
  end if;
  select * into v_replay from public.admin_moderate_review_v1(
    '43000000-0000-0000-0000-000000000401',
    (select review_id from moderation_review_ids
     where mission_id = '43000000-0000-0000-0000-000000000101'),
    'published', 'Reports reviewed; the review follows the publication rules.'
  );
  if not v_replay.idempotent
     or v_replay.status_event_id <> (select status_event_id from keep_result) then
    raise exception 'Moderation replay did not return the retained decision';
  end if;
  begin
    perform * from public.admin_moderate_review_v1(
      '43000000-0000-0000-0000-000000000401',
      (select review_id from moderation_review_ids
       where mission_id = '43000000-0000-0000-0000-000000000101'),
      'hidden', 'Changed payload'
    );
    raise exception 'Changed moderation reused an operation_id';
  exception when unique_violation then null;
  end;
end
$$;
commit;

do $$
declare v_review uuid := (select review_id from moderation_review_ids
  where mission_id = '43000000-0000-0000-0000-000000000101');
begin
  if exists (select 1 from public.review_reports_v1
      where review_id = v_review and status = 'open')
     or (select count(*) from public.review_reports_v1
         where review_id = v_review and status = 'resolved_kept') <> 2
     or (select status from public.reviews where id = v_review) <> 'published'
     or (select count(*) from public.admin_audit_log
         where admin_account_id = '43000000-0000-0000-0000-000000000050'
           and action = 'reputation.moderate.published'
           and entity_id = v_review::text) <> 1
     or (select count(*) from public.notifications
         where event_type = 'review_moderation_decided'
           and entity_id = v_review) <> 4
     or exists (
       select 1 from public.notifications
       where event_type = 'review_moderation_decided'
         and entity_id = v_review
         and (body ilike '%reporter%'
           or body ilike '%Context for the moderation team only.%')
     ) then
    raise exception 'Keep-published decision was not atomically audited and notified';
  end if;
end
$$;

-- Hide, restore and remove exercise every allowed transition. Public aggregate
-- continues to react only to the canonical review status.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000050', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '43000000-0000-0000-0000-000000000050', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'moderation-support-aal2'
)::text, true);
select * from public.admin_moderate_review_v1(
  '43000000-0000-0000-0000-000000000402',
  (select review_id from moderation_review_ids
   where mission_id = '43000000-0000-0000-0000-000000000102'),
  'hidden', 'Temporarily hidden while moderation is concluded.'
);
select * from public.admin_moderate_review_v1(
  '43000000-0000-0000-0000-000000000403',
  (select review_id from moderation_review_ids
   where mission_id = '43000000-0000-0000-0000-000000000102'),
  'published', 'Restored after review of the available context.'
);
commit;

do $$
begin
  if not exists (select 1 from public.get_public_review_summary(
       '43000000-0000-0000-0000-000000000020'
     ) where average_rating = 4.0 and review_count = 3) then
    raise exception 'Restored review did not return to the public aggregate';
  end if;
end
$$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000040', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select * from public.report_review_v1(
  '43000000-0000-0000-0000-000000000315',
  (select review_id from moderation_review_ids
   where mission_id = '43000000-0000-0000-0000-000000000102'),
  'personal_or_sensitive_info', 'Contains information that should not be public.'
);
select * from public.report_review_v1(
  '43000000-0000-0000-0000-000000000316',
  (select review_id from moderation_review_ids
   where mission_id = '43000000-0000-0000-0000-000000000103'),
  'abusive_or_hateful', null
);
commit;

-- Concurrent administrator retries converge on one status event, one report
-- resolution, one audit record and one notification pair.
create or replace function public.reputation_test_moderate_concurrently()
returns table (
  review_id uuid, status text, resolved_report_count integer,
  status_event_id bigint, idempotent boolean
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000050', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '43000000-0000-0000-0000-000000000050', 'role', 'authenticated',
    'aal', 'aal2', 'session_id', 'moderation-support-concurrent'
  )::text, true);
  return query select * from public.admin_moderate_review_v1(
    '43000000-0000-0000-0000-000000000405',
    (select id from public.reviews
     where mission_id = '43000000-0000-0000-0000-000000000103'),
    'hidden', 'Hidden while a final removal decision is prepared.'
  );
end
$$;
revoke all on function public.reputation_test_moderate_concurrently()
from public, anon, authenticated;
grant execute on function public.reputation_test_moderate_concurrently() to service_role;

select extensions.dblink_connect_u('review_moderation_1', current_setting('app.test_database_url'));
select extensions.dblink_connect_u('review_moderation_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('review_moderation_1',
  'select * from public.reputation_test_moderate_concurrently()');
select extensions.dblink_send_query('review_moderation_2',
  'select * from public.reputation_test_moderate_concurrently()');
create temporary table concurrent_moderation_results (
  review_id uuid, status text, resolved_report_count integer,
  status_event_id bigint, idempotent boolean
);
insert into concurrent_moderation_results
select * from extensions.dblink_get_result('review_moderation_1') as result(
  review_id uuid, status text, resolved_report_count integer,
  status_event_id bigint, idempotent boolean
);
insert into concurrent_moderation_results
select * from extensions.dblink_get_result('review_moderation_2') as result(
  review_id uuid, status text, resolved_report_count integer,
  status_event_id bigint, idempotent boolean
);
select extensions.dblink_disconnect('review_moderation_1');
select extensions.dblink_disconnect('review_moderation_2');
drop function public.reputation_test_moderate_concurrently();

do $$
begin
  if (select count(*) from concurrent_moderation_results) <> 2
     or (select count(distinct status_event_id) from concurrent_moderation_results) <> 1
     or (select count(*) from concurrent_moderation_results where idempotent) <> 1
     or (select count(*) from public.admin_audit_log
         where admin_account_id = '43000000-0000-0000-0000-000000000050'
           and action = 'reputation.moderate.hidden'
           and entity_id = (select review_id::text from moderation_review_ids
             where mission_id = '43000000-0000-0000-0000-000000000103')) <> 1 then
    raise exception 'Concurrent moderation retries did not converge atomically';
  end if;
end
$$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000050', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '43000000-0000-0000-0000-000000000050', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'moderation-support-aal2'
)::text, true);
select * from public.admin_moderate_review_v1(
  '43000000-0000-0000-0000-000000000404',
  (select review_id from moderation_review_ids
   where mission_id = '43000000-0000-0000-0000-000000000102'),
  'removed', 'Removed after a confirmed moderation violation.'
);
select * from public.admin_moderate_review_v1(
  '43000000-0000-0000-0000-000000000406',
  (select review_id from moderation_review_ids
   where mission_id = '43000000-0000-0000-0000-000000000103'),
  'removed', 'Removed after confirmation of the policy violation.'
);
do $$
begin
  begin
    perform * from public.admin_moderate_review_v1(
      '43000000-0000-0000-0000-000000000407',
      (select review_id from moderation_review_ids
       where mission_id = '43000000-0000-0000-0000-000000000102'),
      'published', 'Attempted restoration of terminal state.'
    );
    raise exception 'A removed review left its terminal state';
  exception when check_violation then null;
  end;
end
$$;
commit;

do $$
begin
  if not exists (select 1 from public.get_public_review_summary(
       '43000000-0000-0000-0000-000000000020'
     ) where average_rating = 5.0 and review_count = 1)
     or (select count(*) from public.get_public_reviews(
          '43000000-0000-0000-0000-000000000020', 50, null, null
        )) <> 1
     or exists (select 1 from public.review_reports_v1 where status = 'open') then
    raise exception 'Removal did not update public reputation or resolve reports';
  end if;
  begin
    update public.reviews set status = 'published'
    where id = (select review_id from moderation_review_ids
      where mission_id = '43000000-0000-0000-0000-000000000102');
    raise exception 'Review status bypassed trusted moderation';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.admin_audit_log set reason = 'Tampered'
    where admin_account_id = '43000000-0000-0000-0000-000000000050'
      and event_type = 'review_moderated';
    raise exception 'Moderation audit was mutable';
  exception when insufficient_privilege then null;
  end;
end
$$;

-- Clean the local-only fixture while preserving production immutability.
alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '43000000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
alter table public.admin_auth_events disable trigger admin_auth_events_immutable;
delete from public.admin_auth_events where user_id::text like '43000000-%';
alter table public.admin_auth_events enable trigger admin_auth_events_immutable;

delete from public.review_moderation_operations_v1
where admin_id::text like '43000000-%';
select set_config('app.review_report_maintenance_v1', 'on', false);
delete from public.review_reports_v1 where reporter_id::text like '43000000-%';
select set_config('app.review_report_maintenance_v1', 'off', false);
delete from public.review_reply_operations_v1 where provider_id::text like '43000000-%';
select set_config('app.review_reply_maintenance_v1', 'on', false);
delete from public.review_replies_v1 where provider_id::text like '43000000-%';
select set_config('app.review_reply_maintenance_v1', 'off', false);
select set_config('app.review_maintenance_v1', 'on', false);
delete from public.review_status_events_v1 where review_id in (
  select id from public.reviews where reviewer_id::text like '43000000-%'
);
delete from public.review_submission_operations_v1
where client_id::text like '43000000-%';
delete from public.reviews where reviewer_id::text like '43000000-%';
select set_config('app.review_maintenance_v1', 'off', false);
delete from public.missions where id::text like '43000000-%';
delete from public.admin_account_roles where user_id::text like '43000000-%';
delete from public.admin_accounts where user_id::text like '43000000-%';
delete from public.users where id::text like '43000000-%';
delete from auth.users where id::text like '43000000-%';

select 'reputation moderation backend tests passed' as result;
