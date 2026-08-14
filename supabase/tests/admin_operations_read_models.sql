\set ON_ERROR_STOP on

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '82000000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
delete from public.payments where id::text like '82000000-%';
delete from public.missions where id::text like '82000000-%';
delete from public.bookings where id::text like '82000000-%';
delete from public.admin_account_roles where user_id::text like '82000000-%';
delete from public.admin_accounts where user_id::text like '82000000-%';
delete from public.users where id::text like '82000000-%';
delete from auth.users where id::text like '82000000-%';

insert into auth.users (id, email, raw_user_meta_data) values
  ('82000000-0000-0000-0000-000000000001', 'operations-support@example.test', '{}'),
  ('82000000-0000-0000-0000-000000000002', 'operations-finance@example.test', '{}'),
  ('82000000-0000-0000-0000-000000000003', 'operations-outsider@example.test', '{}'),
  ('82000000-0000-0000-0000-000000000010', 'operations-client@example.test', '{"requested_role":"client"}'),
  ('82000000-0000-0000-0000-000000000020', 'operations-provider@example.test', '{"requested_role":"pro","business_name":"Operations provider"}');

update public.users set role = 'pro', active_role = 'pro',
  verification_status = 'pending', verification_submitted_at = clock_timestamp()
where id = '82000000-0000-0000-0000-000000000020';

insert into public.admin_accounts (user_id, display_name) values
  ('82000000-0000-0000-0000-000000000001', 'Operations support'),
  ('82000000-0000-0000-0000-000000000002', 'Operations finance');
insert into public.admin_account_roles (user_id, role_code) values
  ('82000000-0000-0000-0000-000000000001', 'support'),
  ('82000000-0000-0000-0000-000000000001', 'verification'),
  ('82000000-0000-0000-0000-000000000002', 'support'),
  ('82000000-0000-0000-0000-000000000002', 'finance');

insert into public.bookings (
  id, client_id, service, date, time_slot, address, notes, status
) values (
  '82000000-0000-0000-0000-000000000100',
  '82000000-0000-0000-0000-000000000010',
  'Admin operations request', current_date + 5, '14:00',
  'Test address', 'Read-only administration fixture.', 'pending'
);

insert into public.missions (
  id, client_id, pro_id, service, date, price, status, booking_id,
  financial_flow_version
) values (
  '82000000-0000-0000-0000-000000000200',
  '82000000-0000-0000-0000-000000000010',
  '82000000-0000-0000-0000-000000000020',
  'Admin operations mission', now() + interval '5 days', 99, 'proposed',
  '82000000-0000-0000-0000-000000000100', 'legacy_v1'
);

insert into public.payments (
  id, mission_id, client_id, pro_id, amount_total_cents, amount_net_cents,
  application_fee_cents, stripe_payment_id, stripe_session_id, status
) values (
  '82000000-0000-0000-0000-000000000300',
  '82000000-0000-0000-0000-000000000200',
  '82000000-0000-0000-0000-000000000010',
  '82000000-0000-0000-0000-000000000020',
  9900, 9000, 900, 'pi_admin_operations_test',
  'cs_admin_operations_test', 'paid'
);

-- A normal authenticated user cannot call any administration read model.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '82000000-0000-0000-0000-000000000003', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'operations-outsider',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
do $$ begin
  begin perform public.admin_get_operations_overview();
    raise exception 'A non-admin opened the operations overview';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_get_user_detail('82000000-0000-0000-0000-000000000010');
    raise exception 'A non-admin opened a user detail';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('authenticated', 'public.record_admin_read_audit(text,text,text,jsonb)', 'execute') then
    raise exception 'Browser role can forge administration read audit entries';
  end if;
end $$;
commit;

-- Support and verification permissions expose operational queues and records,
-- but redact all financial payloads and Stripe identifier search.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '82000000-0000-0000-0000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'operations-support',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
do $$
declare v_overview jsonb; v_search jsonb; v_mission jsonb; v_user jsonb;
begin
  v_overview := public.admin_get_operations_overview();
  if not (v_overview #>> '{queues,verifications,available}')::boolean
     or (v_overview #>> '{queues,verifications,count}')::integer <> 1 then
    raise exception 'Pending verification queue is incomplete';
  end if;
  if (v_overview #>> '{queues,financial_incidents,available}')::boolean
     or (v_overview #>> '{queues,chargebacks,available}')::boolean then
    raise exception 'Support overview exposed restricted financial queues';
  end if;

  v_search := public.admin_global_search('operations-client@example.test', 20);
  if (v_search ->> 'result_count')::integer <> 1 then
    raise exception 'Global user search did not find the expected account';
  end if;
  v_search := public.admin_global_search('pi_admin_operations_test', 20);
  if (v_search ->> 'result_count')::integer <> 0 then
    raise exception 'Stripe identifiers were searchable without finance.read';
  end if;

  v_user := public.admin_get_user_detail('82000000-0000-0000-0000-000000000020');
  if v_user #>> '{profile,verification_status}' <> 'pending'
     or (v_user #>> '{activity,proposals_created}')::integer <> 1 then
    raise exception 'User administration detail is incomplete';
  end if;

  v_mission := public.admin_get_mission_detail('82000000-0000-0000-0000-000000000200');
  if (v_mission ->> 'financial_access')::boolean
     or v_mission -> 'financial' <> 'null'::jsonb
     or v_mission #>> '{client,email}' <> 'operations-client@example.test'
     or jsonb_array_length(v_mission -> 'proposals') <> 1 then
    raise exception 'Mission operational view was incomplete or financial data leaked';
  end if;
end $$;
commit;

-- Finance plus mission-read permission reveals the same record with a strictly
-- read-only financial projection.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '82000000-0000-0000-0000-000000000002', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', 'operations-finance',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
    'timestamp', extract(epoch from clock_timestamp())::bigint))
)::text, true);
do $$
declare v_mission jsonb; v_search jsonb;
begin
  v_mission := public.admin_get_mission_detail('82000000-0000-0000-0000-000000000200');
  if not (v_mission ->> 'financial_access')::boolean
     or v_mission #>> '{financial,legacy_payments,0,stripe_payment_id}' <> 'pi_admin_operations_test'
     or (v_mission #>> '{financial,legacy_payments,0,amount_total_cents}')::integer <> 9900 then
    raise exception 'Finance read projection is incomplete';
  end if;
  v_search := public.admin_global_search('pi_admin_operations_test', 20);
  if (v_search ->> 'result_count')::integer <> 1
     or v_search #>> '{results,0,result_type}' <> 'mission' then
    raise exception 'Authorized Stripe identifier search failed';
  end if;
end $$;
commit;

do $$ begin
  if not exists (select 1 from public.admin_audit_log
    where admin_account_id = '82000000-0000-0000-0000-000000000001'
      and action = 'mission.detail' and entity_id = '82000000-0000-0000-0000-000000000200') then
    raise exception 'Mission read was not audited';
  end if;
  begin
    update public.admin_audit_log set reason = 'tampered'
    where admin_account_id::text like '82000000-%';
    raise exception 'Administration read audit was mutable';
  exception when insufficient_privilege then null; end;
end $$;

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '82000000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
delete from public.payments where id::text like '82000000-%';
delete from public.missions where id::text like '82000000-%';
delete from public.bookings where id::text like '82000000-%';
delete from public.admin_account_roles where user_id::text like '82000000-%';
delete from public.admin_accounts where user_id::text like '82000000-%';
delete from public.users where id::text like '82000000-%';
delete from auth.users where id::text like '82000000-%';

select 'admin operations read model tests passed' as result;
