\set ON_ERROR_STOP on

select set_config('app.test_database_url', :'TEST_DATABASE_URL', false);

do $$
begin
  if (select enabled from public.financial_feature_flags
      where flag_code = 'provider_payouts_v2') then
    raise exception 'Provider payouts v2 must be disabled by default';
  end if;
  if (select minimum_payout_amount_cents from public.provider_payout_policy_versions
      where version = 'provider_payouts_eur_v1') <> 0 then
    raise exception 'Initial Glossed payout threshold must be zero';
  end if;
  if (select standard_payout_isodays from public.provider_payout_policy_versions
      where version = 'provider_payouts_eur_v1') <> array[1,4]::smallint[] then
    raise exception 'Initial standard payout schedule must be Monday and Thursday';
  end if;
  if exists (
    select 1 from public.provider_payout_policy_versions
    where version = 'provider_payouts_eur_v1'
      and (standard_fee_bearer <> 'platform'
        or instant_fee_bearer <> 'provider'
        or instant_payout_margin_bps <> 0)
  ) then
    raise exception 'Payout fee bearer or zero-margin policy is incorrect';
  end if;
  if has_table_privilege('authenticated', 'public.provider_payouts_v2', 'select')
     or has_function_privilege(
       'authenticated',
       'public.reserve_provider_payout_dispatch_v2(uuid,uuid)', 'execute'
     ) then
    raise exception 'Browser roles can access server-owned payout state';
  end if;
end
$$;

insert into auth.users (id, email, raw_user_meta_data) values (
  '76000000-0000-0000-0000-000000000020',
  'payout-provider@example.test', '{"requested_role":"pro"}'::jsonb
);
update public.users set role = 'pro', active_role = 'pro'
where id = '76000000-0000-0000-0000-000000000020';
insert into public.provider_connect_account_identities (
  stripe_account_id, provider_id, creation_generation, account_api_version
) values (
  'acct_PayoutV2Test', '76000000-0000-0000-0000-000000000020', 1, 'accounts_v2'
);
insert into public.provider_connect_accounts (
  provider_id, stripe_account_id, creation_state, creation_idempotency_key,
  stripe_transfers_status, payouts_status, livemode, last_synced_at
) values (
  '76000000-0000-0000-0000-000000000020', 'acct_PayoutV2Test', 'created',
  'connect-account-v2:76000000-0000-0000-0000-000000000020:1',
  'active', 'active', false, now()
);

select set_config('request.jwt.claim.role', 'service_role', false);
update public.financial_feature_flags set enabled = true,
  reason = 'SQL test transaction only.' where flag_code = 'provider_payouts_v2';
select public.record_provider_payout_schedule_control_v2(
  '76000000-0000-0000-0000-000000000020', 'acct_PayoutV2Test',
  'manual', 'test-balance-settings'
);
select public.record_provider_balance_snapshot_v2(
  'acct_PayoutV2Test', 'eur', 10000, 2000, 10000, 9900,
  'ba_PayoutV2Test', 'bank_account', '{"card":10000}'::jsonb,
  false, 'payout-v2-test:snapshot:1'
);

do $$
declare v_workflow public.workflow_instances%rowtype;
begin
  v_workflow := public.create_workflow_instance(
    'payout', 'v1', '76000000-0000-0000-0000-000000000101',
    'marketplace_v2', 'system', null, 'Concurrent payout A.', '{}',
    'payout-v2-test:workflow:a'
  );
  v_workflow := public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'payout_funds_available',
    'system', null, 'Funds available.', '{}', 'payout-v2-test:a:available'
  );
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'payout_schedule_standard',
    'system', null, 'Schedule due.', '{}', 'payout-v2-test:a:scheduled'
  );
  v_workflow := public.create_workflow_instance(
    'payout', 'v1', '76000000-0000-0000-0000-000000000102',
    'marketplace_v2', 'system', null, 'Concurrent payout B.', '{}',
    'payout-v2-test:workflow:b'
  );
  v_workflow := public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'payout_funds_available',
    'system', null, 'Funds available.', '{}', 'payout-v2-test:b:available'
  );
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'payout_schedule_standard',
    'system', null, 'Schedule due.', '{}', 'payout-v2-test:b:scheduled'
  );
end
$$;

create or replace function public.payout_v2_test_concurrent_insert(p_id uuid)
returns text language plpgsql set search_path = public, pg_temp as $$
begin
  insert into public.provider_payouts_v2 (
    id, provider_id, stripe_account_id, workflow_instance_id, policy_version,
    payout_method, currency, provider_balance_debit_amount_cents,
    bank_payout_amount_cents, balance_snapshot_id, schedule_slot_at,
    idempotency_key
  ) values (
    p_id, '76000000-0000-0000-0000-000000000020', 'acct_PayoutV2Test',
    (select id from public.workflow_instances where subject_id = p_id
      and machine_code = 'payout'),
    'provider_payouts_eur_v1', 'standard', 'eur', 100, 100,
    (select id from public.provider_balance_snapshots_v2
      where retrieval_key = 'payout-v2-test:snapshot:1'),
    '2026-08-13 07:00:00+00', 'payout-v2-test:' || p_id::text
  );
  return 'inserted';
exception when unique_violation then
  return 'conflict';
end
$$;

select extensions.dblink_connect_u('payout_v2_1', current_setting('app.test_database_url'));
select extensions.dblink_connect_u('payout_v2_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('payout_v2_1', $$
  select public.payout_v2_test_concurrent_insert(
    '76000000-0000-0000-0000-000000000101')
$$);
select extensions.dblink_send_query('payout_v2_2', $$
  select public.payout_v2_test_concurrent_insert(
    '76000000-0000-0000-0000-000000000102')
$$);
create temporary table payout_concurrency_results(result text);
insert into payout_concurrency_results
select * from extensions.dblink_get_result('payout_v2_1') as result(result text);
insert into payout_concurrency_results
select * from extensions.dblink_get_result('payout_v2_2') as result(result text);
select * from extensions.dblink_get_result('payout_v2_1') as result(result text);
select * from extensions.dblink_get_result('payout_v2_2') as result(result text);

do $$
begin
  if (select count(*) from payout_concurrency_results where result = 'inserted') <> 1
     or (select count(*) from payout_concurrency_results where result = 'conflict') <> 1
     or (select count(*) from public.provider_payouts_v2
         where provider_id = '76000000-0000-0000-0000-000000000020'
           and paid_at is null and failed_at is null and cancelled_at is null) <> 1 then
    raise exception 'Concurrent payout reservations did not produce one exclusive operation';
  end if;
end
$$;

insert into public.provider_payout_blocks_v2 (
  provider_id, block_code, reason, source_type, source_id
) values (
  '76000000-0000-0000-0000-000000000020', 'test_financial_block',
  'Test-only financial block.', 'system', 'payout-v2-test:block'
);
do $$
begin
  if not ('manual_payout_block:test_financial_block'
          = any(public.provider_payout_block_reasons_v2(
            '76000000-0000-0000-0000-000000000020'))) then
    raise exception 'Explicit financial block did not stop provider payout eligibility';
  end if;
end
$$;

do $$
declare v_payout public.provider_payouts_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
begin
  select * into v_payout from public.provider_payouts_v2
  where provider_id = '76000000-0000-0000-0000-000000000020';
  select * into v_workflow from public.workflow_instances
  where id = v_payout.workflow_instance_id for update;
  perform public.transition_workflow_instance(
    v_workflow.id, v_workflow.revision, 'payout_submit_standard',
    'system', null, 'Test submission.', '{}',
    'payout-v2-test:' || v_payout.id::text || ':submitted'
  );
  perform set_config('app.provider_payouts_v2_mutation', 'on', true);
  update public.provider_payouts_v2 set attempt_count = 1,
    submitted_at = now(), stripe_payout_id = 'po_PayoutV2Test',
    stripe_status = 'pending' where id = v_payout.id;
  perform set_config('app.provider_payouts_v2_mutation', 'off', true);
end
$$;

select extensions.dblink_send_query('payout_v2_1', $$
  with configured as materialized (
    select set_config('request.jwt.claim.role', 'service_role', false)
  ) select event.* from configured cross join lateral
  public.process_provider_payout_v2_event(
    'evt_payout_v2_same', 'payout.paid', 'acct_PayoutV2Test', now(), false,
    'po_PayoutV2Test', null, 100, 'eur', 'standard', 'paid', current_date,
    null, null, null, null, 'txn_PayoutV2Test', 0,
    '{"delivery":1}'::jsonb) event
$$);
select extensions.dblink_send_query('payout_v2_2', $$
  with configured as materialized (
    select set_config('request.jwt.claim.role', 'service_role', false)
  ) select event.* from configured cross join lateral
  public.process_provider_payout_v2_event(
    'evt_payout_v2_same', 'payout.paid', 'acct_PayoutV2Test', now(), false,
    'po_PayoutV2Test', null, 100, 'eur', 'standard', 'paid', current_date,
    null, null, null, null, 'txn_PayoutV2Test', 0,
    '{"delivery":2}'::jsonb) event
$$);
select * from extensions.dblink_get_result('payout_v2_1')
  as result(payout_id uuid, duplicate boolean, outcome text);
select * from extensions.dblink_get_result('payout_v2_2')
  as result(payout_id uuid, duplicate boolean, outcome text);
select * from extensions.dblink_get_result('payout_v2_1')
  as result(payout_id uuid, duplicate boolean, outcome text);
select * from extensions.dblink_get_result('payout_v2_2')
  as result(payout_id uuid, duplicate boolean, outcome text);

do $$
begin
  if (select count(*) from public.stripe_payout_v2_webhook_events
      where event_id = 'evt_payout_v2_same') <> 1
     or (select count(*) from public.provider_payout_attempts_v2
         where outcome = 'paid') <> 1
     or (select count(*) from public.provider_payouts_v2
         where stripe_payout_id = 'po_PayoutV2Test' and paid_at is not null) <> 1 then
    raise exception 'Duplicate payout webhook was not idempotent';
  end if;
  if (select count(*) from public.financial_audit_log
      where deduplication_key = 'provider-payout-v2-event:evt_payout_v2_same:audit') <> 1 then
    raise exception 'Payout webhook audit was duplicated';
  end if;
end
$$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
  '76000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
declare v_gains jsonb;
begin
  v_gains := public.get_my_provider_gains_v2();
  if v_gains->>'currency' <> 'eur'
     or (v_gains->>'minimum_payout_amount_cents')::bigint <> 0
     or jsonb_array_length(v_gains->'history') <> 1 then
    raise exception 'Provider Gains summary is incomplete';
  end if;
end
$$;
rollback;

drop function public.payout_v2_test_concurrent_insert(uuid);
select extensions.dblink_disconnect('payout_v2_1');
select extensions.dblink_disconnect('payout_v2_2');

select set_config('request.jwt.claim.role', 'service_role', false);
update public.financial_feature_flags set enabled = false,
  reason = 'Restore disabled default after SQL test.'
where flag_code = 'provider_payouts_v2';
