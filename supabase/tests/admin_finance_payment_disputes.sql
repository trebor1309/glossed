\set ON_ERROR_STOP on

select set_config('app.test_database_url', :'TEST_DATABASE_URL', false);

do $$ begin
  if has_table_privilege('authenticated', 'public.admin_financial_operation_previews_v2', 'select')
     or has_function_privilege('authenticated',
       'public.consume_admin_financial_operation_preview_v2(uuid,uuid,text,timestamptz,uuid)',
       'execute') then
    raise exception 'Browser roles can inspect or consume financial operation previews directly';
  end if;
  if (select enabled from public.financial_feature_flags
      where flag_code = 'financial_remediation_v2') is false then
    raise exception 'The local remediation fixture must remain enabled for tests only';
  end if;
end $$;

-- A normal authenticated user cannot search finance, inspect chargebacks, or
-- prepare an execution even with a fresh AAL2 token.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','74000000-0000-0000-0000-000000000010',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','74000000-0000-0000-0000-000000000010','role','authenticated','aal','aal2',
  'amr',jsonb_build_array(jsonb_build_object('method','totp',
    'timestamp',extract(epoch from clock_timestamp())::bigint)))::text,true);
do $$ begin
  begin perform public.admin_financial_search('ch_release_client', 50);
    raise exception 'A client searched financial data';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_list_payment_disputes('all', 50, 0);
    raise exception 'A client opened the payment dispute queue';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- Finance and risk reads cover every identifier family and expose a balanced
-- every-cent ledger plus a banking-dispute queue distinct from service cases.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','75000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','75000000-0000-0000-0000-000000000001','role','authenticated','aal','aal2',
  'session_id','admin-finance-test','amr',jsonb_build_array(jsonb_build_object(
    'method','totp','timestamp',extract(epoch from clock_timestamp())::bigint)))::text,true);
do $$
declare
  v_payment uuid := '74000000-0000-0000-0000-000000000603';
  v_detail jsonb;
  v_queue jsonb;
  v_risk jsonb;
  v_preview jsonb;
  v_refund_id uuid;
  v_search text;
begin
  foreach v_search in array array[
    '74000000-0000-0000-0000-000000000603',
    'ch_release_client',
    're_remediation_partial',
    'tr_release_client_unique',
    'po_PayoutV2Test'
  ] loop
    if (public.admin_financial_search(v_search, 50)->>'total')::integer < 1 then
      raise exception 'Financial search omitted identifier %', v_search;
    end if;
  end loop;

  v_detail := public.admin_get_financial_payment_detail(v_payment);
  if v_detail#>>'{payment,id}' <> v_payment::text
     or jsonb_array_length(v_detail->'allocation_snapshots') < 1
     or jsonb_array_length(v_detail->'ledger_batches') < 1
     or exists (
       select 1 from jsonb_array_elements(v_detail->'ledger_batches') batch
       where (batch->>'debit_total_cents')::bigint <> (batch->>'credit_total_cents')::bigint
     ) then
    raise exception 'Payment detail omitted allocation data or exposed an unbalanced ledger';
  end if;

  v_queue := public.admin_list_payment_disputes('lost_review', 50, 0);
  if (v_queue->>'total')::integer < 1 then
    raise exception 'Lost Stripe dispute is not in its separate liability review queue';
  end if;
  v_risk := public.admin_get_payment_dispute_detail((select (item->>'id')::uuid
    from jsonb_array_elements(public.admin_list_payment_disputes('all', 50, 0)->'items') item
    where item->>'stripe_dispute_id' = 'dp_remediation_test'));
  if v_risk#>>'{dispute,stripe_dispute_id}' <> 'dp_remediation_test'
     or (v_risk#>>'{dispute,provisional_recovered_amount_cents}')::bigint <> 4000
     or (v_risk#>>'{dispute,recovery_deficit_amount_cents}')::bigint <> 5000
     or v_risk->'risk_signals' is null then
    raise exception 'Chargeback detail omitted risk, recovery, or deficit data';
  end if;

  v_refund_id := (public.admin_get_financial_payment_detail(
    '74000000-0000-0000-0000-000000000605')->'refunds'->0->>'id')::uuid;
  v_preview := public.admin_preview_financial_operation_v2('refund', v_refund_id);
  if (v_preview->>'amount_cents')::bigint <> (public.admin_get_financial_payment_detail(
      '74000000-0000-0000-0000-000000000605')#>>'{payment,amount_total_cents}')::bigint
     or v_preview->>'stable_idempotency_key' is null then
    raise exception 'Refund preview changed amount or operation identity';
  end if;
  perform set_config('app.admin_finance_preview_id', v_preview->>'id', false);
end $$;
commit;

-- Stale MFA cannot create an execution preview.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','75000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','75000000-0000-0000-0000-000000000001','role','authenticated','aal','aal2',
  'amr',jsonb_build_array(jsonb_build_object('method','totp',
    'timestamp',extract(epoch from clock_timestamp()-interval '10 minutes')::bigint)))::text,true);
do $$ begin
  begin perform public.admin_preview_financial_operation_v2('refund',
    (public.admin_get_financial_payment_detail(
      '74000000-0000-0000-0000-000000000605')->'refunds'->0->>'id')::uuid);
    raise exception 'Stale MFA created a financial operation preview';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- A preview created with fresh MFA cannot later be consumed with a stale MFA
-- assertion, even through the service-role execution boundary.
begin;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ begin
  begin perform public.consume_admin_financial_operation_preview_v2(
    current_setting('app.admin_finance_preview_id')::uuid,
    '75000000-0000-0000-0000-000000000001',
    'Attempt with an expired administrator reauthentication window.',
    clock_timestamp() - interval '10 minutes',
    '84000000-0000-0000-0000-000000000099');
    raise exception 'Stale MFA consumed a financial operation preview';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- Concurrent confirmation consumes one immutable preview once. Both retries
-- reuse the same execution operation id and cannot create a second money path.
select extensions.dblink_connect_u('admin_finance_1', current_setting('app.test_database_url'));
select extensions.dblink_connect_u('admin_finance_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('admin_finance_1', $q$
  with configured as materialized (select set_config('request.jwt.claim.role','service_role',false))
  select operation_id from configured cross join lateral
    public.consume_admin_financial_operation_preview_v2(
      (select id from public.admin_financial_operation_previews_v2
        where operation_type = 'refund' and operation_id = (select id from public.refunds_v2
          where payment_id = '74000000-0000-0000-0000-000000000605')
        order by created_at desc limit 1),
      '75000000-0000-0000-0000-000000000001',
      'Explicitly confirmed retry of the already authorized client refund.',
      clock_timestamp(),'84000000-0000-0000-0000-000000000001')
$q$);
select pg_sleep(0.1);
select extensions.dblink_send_query('admin_finance_2', $q$
  with configured as materialized (select set_config('request.jwt.claim.role','service_role',false))
  select operation_id from configured cross join lateral
    public.consume_admin_financial_operation_preview_v2(
      (select id from public.admin_financial_operation_previews_v2
        where operation_type = 'refund' and operation_id = (select id from public.refunds_v2
          where payment_id = '74000000-0000-0000-0000-000000000605')
        order by created_at desc limit 1),
      '75000000-0000-0000-0000-000000000001',
      'Explicitly confirmed retry of the already authorized client refund.',
      clock_timestamp(),'84000000-0000-0000-0000-000000000001')
$q$);
select * from extensions.dblink_get_result('admin_finance_1') as result(operation_id uuid);
select * from extensions.dblink_get_result('admin_finance_2') as result(operation_id uuid);
select extensions.dblink_disconnect('admin_finance_1');
select extensions.dblink_disconnect('admin_finance_2');

do $$ begin
  if (select count(*) from public.admin_financial_operation_previews_v2
      where id = current_setting('app.admin_finance_preview_id')::uuid
        and consumed_at is not null
        and execution_operation_id = '84000000-0000-0000-0000-000000000001') <> 1
     or (select count(*) from public.admin_audit_log
       where deduplication_key = 'admin-finance-execute:84000000-0000-0000-0000-000000000001') <> 1
     or (select count(*) from public.refunds_v2
       where payment_id = '74000000-0000-0000-0000-000000000605') <> 1 then
    raise exception 'Concurrent finance confirmation duplicated preview, audit, or refund state';
  end if;
end $$;

select 'admin finance and payment disputes tests passed' as result;
