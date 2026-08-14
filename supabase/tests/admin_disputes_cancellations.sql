\set ON_ERROR_STOP on

select set_config('app.test_database_url', :'TEST_DATABASE_URL', false);
select set_config('app.admin_test_dispute_id',(select id::text from public.service_disputes_v2
  where payment_id='74000000-0000-0000-0000-000000000605'),false);

do $$ begin
  if has_table_privilege('authenticated', 'public.admin_dispute_allocation_previews_v2', 'select')
     or has_function_privilege('authenticated',
       'public.execute_admin_service_dispute_decision_v2(uuid,uuid,text,jsonb,timestamptz,bigint,uuid)',
       'execute') then
    raise exception 'Browser roles can inspect or execute financial previews directly';
  end if;
  if (select enabled from public.financial_feature_flags where flag_code='financial_remediation_v2') is false then
    raise exception 'The preceding local remediation fixture must keep v2 enabled';
  end if;
end $$;

-- A normal user cannot open either administration queue or prepare money.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','74000000-0000-0000-0000-000000000010',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','74000000-0000-0000-0000-000000000010',
  'role','authenticated','aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp',
  'timestamp',extract(epoch from clock_timestamp())::bigint)))::text,true);
do $$ begin
  begin perform public.admin_list_dispute_cases('disputes',50,0);
    raise exception 'A client opened the dispute queue';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_preview_service_dispute_allocation_v2(
    current_setting('app.admin_test_dispute_id')::uuid,
    'client_full_refund',null,null,null);
    raise exception 'A client created a financial preview';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- The migrated historical administrator is a super-admin. A genuine AMR MFA
-- timestamp permits read and preview; the server computes every cent.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','75000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','75000000-0000-0000-0000-000000000001',
  'role','authenticated','aal','aal2','session_id','admin-disputes-test',
  'amr',jsonb_build_array(jsonb_build_object('method','totp',
  'timestamp',extract(epoch from clock_timestamp())::bigint)))::text,true);
do $$
declare v_queue jsonb; v_cancellations jsonb; v_detail jsonb; v_preview jsonb;
begin
  v_queue := public.admin_list_dispute_cases('disputes',50,0);
  v_cancellations := public.admin_list_dispute_cases('cancellations',50,0);
  if (v_queue->>'total')::integer < 1 or (v_cancellations->>'total')::integer < 1 then
    raise exception 'Operational dispute or cancellation queue is incomplete';
  end if;
  v_detail := public.admin_get_dispute_case(current_setting('app.admin_test_dispute_id')::uuid);
  if v_detail#>>'{mission_detail,mission,id}' <> '74000000-0000-0000-0000-000000000205'
     or not (v_detail->>'can_allocate')::boolean then
    raise exception 'Dispute detail omitted mission context or allocation permission';
  end if;
  v_preview := public.admin_preview_service_dispute_allocation_v2(
    (v_detail#>>'{dispute,id}')::uuid,'client_full_refund',null,null,null);
  if (v_preview->>'provider_awarded_gross_amount_cents')::bigint <> 0
     or (v_preview->>'platform_fee_final_amount_cents')::bigint <> 0
     or (v_preview->>'client_refund_amount_cents')::bigint
       <> (v_preview->>'client_total_amount_cents')::bigint
     or (v_preview->>'provider_statutory_withholding_amount_cents')::bigint <> 0 then
    raise exception 'Full-refund preview does not allocate every cent correctly';
  end if;
end $$;
commit;

-- A stale AMR timestamp cannot create a new preview even with both roles.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','75000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','75000000-0000-0000-0000-000000000001',
  'role','authenticated','aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp',
  'timestamp',extract(epoch from clock_timestamp()-interval '10 minutes')::bigint)))::text,true);
do $$ begin
  begin perform public.admin_preview_service_dispute_allocation_v2(
    current_setting('app.admin_test_dispute_id')::uuid,
    'client_full_refund',null,null,null);
    raise exception 'Stale MFA created a financial preview';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- Concurrent confirmations of the exact same preview and operation serialize:
-- one immutable decision, resolution, refund reservation and audit remain.
select extensions.dblink_connect_u('admin_decision_1',current_setting('app.test_database_url'));
select extensions.dblink_connect_u('admin_decision_2',current_setting('app.test_database_url'));
select extensions.dblink_send_query('admin_decision_1',$q$
  with configured as materialized (select set_config('request.jwt.claim.role','service_role',false))
  select decision_id from configured cross join lateral public.execute_admin_service_dispute_decision_v2(
    (select id from public.admin_dispute_allocation_previews_v2 where dispute_id=(select id from public.service_disputes_v2 where payment_id='74000000-0000-0000-0000-000000000605') order by created_at desc limit 1),
    '75000000-0000-0000-0000-000000000001','Concurrent confirmed full refund for cancellation disagreement.',
    '{"fixture":"admin-disputes"}'::jsonb,clock_timestamp(),null,
    '83000000-0000-0000-0000-000000000001')
$q$);
select pg_sleep(0.1);
select extensions.dblink_send_query('admin_decision_2',$q$
  with configured as materialized (select set_config('request.jwt.claim.role','service_role',false))
  select decision_id from configured cross join lateral public.execute_admin_service_dispute_decision_v2(
    (select id from public.admin_dispute_allocation_previews_v2 where dispute_id=(select id from public.service_disputes_v2 where payment_id='74000000-0000-0000-0000-000000000605') order by created_at desc limit 1),
    '75000000-0000-0000-0000-000000000001','Concurrent confirmed full refund for cancellation disagreement.',
    '{"fixture":"admin-disputes"}'::jsonb,clock_timestamp(),null,
    '83000000-0000-0000-0000-000000000001')
$q$);
select * from extensions.dblink_get_result('admin_decision_1') as result(decision_id uuid);
select * from extensions.dblink_get_result('admin_decision_2') as result(decision_id uuid);
select extensions.dblink_disconnect('admin_decision_1');
select extensions.dblink_disconnect('admin_decision_2');

do $$
declare v_dispute uuid := (select id from public.service_disputes_v2
  where payment_id='74000000-0000-0000-0000-000000000605');
begin
  if (select count(*) from public.service_dispute_decisions_v2 where dispute_id=v_dispute) <> 1
     or (select count(*) from public.financial_resolutions_v2 where service_dispute_id=v_dispute) <> 1
     or (select count(*) from public.refunds_v2 where payment_id='74000000-0000-0000-0000-000000000605') <> 1
     or (select count(*) from public.admin_dispute_allocation_previews_v2
         where dispute_id=v_dispute and consumed_at is not null) <> 1
     or (select count(*) from public.admin_audit_log where entity_id=v_dispute::text
         and action='dispute.allocation.commit') <> 1 then
    raise exception 'Concurrent admin confirmation created duplicate financial state';
  end if;
  if (select client_refund_amount_cents from public.financial_resolutions_v2
      where service_dispute_id=v_dispute) <> (select amount_total_cents from public.checkout_v2_payments
      where id='74000000-0000-0000-0000-000000000605') then
    raise exception 'Committed allocation differs from its every-cent preview';
  end if;
end $$;

select 'admin disputes and cancellations tests passed' as result;
