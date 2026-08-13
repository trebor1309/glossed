\set ON_ERROR_STOP on

select set_config('app.test_database_url', :'TEST_DATABASE_URL', false);

do $$
begin
  if (select enabled from public.financial_feature_flags where flag_code = 'checkout_v2') then
    raise exception 'Checkout v2 must be disabled by default';
  end if;
  if (select count(*) from public.checkout_v2_policy_versions) <> 0 then
    raise exception 'Migration invented a production payment-window policy';
  end if;
  if has_table_privilege('authenticated', 'public.checkout_v2_payments', 'select')
     or has_table_privilege('authenticated', 'public.checkout_v2_attempts', 'insert')
     or has_function_privilege(
       'authenticated', 'public.reserve_checkout_v2_attempt(uuid,uuid)', 'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.process_checkout_v2_event(text,text,timestamptz,boolean,text,text,text,text,bigint,text,jsonb)',
       'execute'
     ) then
    raise exception 'Browser roles can access server-only Checkout v2 state';
  end if;
end
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('73000000-0000-0000-0000-000000000010', 'checkout-v2-client@example.test', '{"requested_role":"client"}'::jsonb),
  ('73000000-0000-0000-0000-000000000020', 'checkout-v2-provider@example.test', '{"requested_role":"pro"}'::jsonb),
  ('73000000-0000-0000-0000-000000000030', 'checkout-v2-other-provider@example.test', '{"requested_role":"pro"}'::jsonb);

update public.users set role = 'pro', active_role = 'pro'
where id in (
  '73000000-0000-0000-0000-000000000020',
  '73000000-0000-0000-0000-000000000030'
);

insert into public.bookings (
  id, client_id, pro_id, service, date, time_slot, address, notes, status
) values (
  '73000000-0000-0000-0000-000000000100',
  '73000000-0000-0000-0000-000000000010',
  null, 'Checkout v2 request', current_date + 3, '10:00',
  'Test address', 'Platform charge with delayed transfer.', 'pending'
);

insert into public.missions (
  id, client_id, pro_id, service, date, price, status, booking_id,
  paid_at, financial_flow_version
) values
  (
    '73000000-0000-0000-0000-000000000200',
    '73000000-0000-0000-0000-000000000010',
    '73000000-0000-0000-0000-000000000020',
    'Selected v2 proposal', now() + interval '3 days', 99, 'proposed',
    '73000000-0000-0000-0000-000000000100', null, 'marketplace_v2'
  ),
  (
    '73000000-0000-0000-0000-000000000201',
    '73000000-0000-0000-0000-000000000010',
    '73000000-0000-0000-0000-000000000030',
    'Competing v2 proposal', now() + interval '3 days', 110, 'proposed',
    '73000000-0000-0000-0000-000000000100', null, 'marketplace_v2'
  );

insert into public.financial_limit_versions (
  version, metric_code, currency, comparison_operator,
  warning_threshold_cents, blocking_threshold_cents, notes
) values (
  'checkout_v2_test_limits', 'checkout_liquidity_exposure', 'eur', 'above',
  100000, 200000, 'Test-only open-session exposure ceiling.'
);

insert into public.checkout_v2_policy_versions (
  version, currency, payment_window_open_before_start_seconds,
  payment_deadline_seconds, checkout_ttl_seconds,
  checkout_expiry_margin_before_start_seconds, liquidity_limit_version,
  stripe_payment_method_configuration_reference, notes
) values (
  'checkout_v2_test_policy', 'eur', 604800, 864000, 3600, 1800,
  'checkout_v2_test_limits', 'pmc_test_dynamic_card_wallet_bancontact',
  'Test-only configurable policy. No production timing rule is implied.'
);

select set_config('request.jwt.claim.role', 'service_role', false);
update public.financial_feature_flags
set enabled = true, reason = 'SQL test transaction only.'
where flag_code = 'checkout_v2';

select public.create_workflow_instance(
  'request_lifecycle', 'v1', '73000000-0000-0000-0000-000000000100',
  'marketplace_v2', 'client', '73000000-0000-0000-0000-000000000010',
  'Test request.', '{}'::jsonb, 'checkout-v2-test:request:create'
);
select public.transition_workflow_instance(
  (select id from public.workflow_instances where machine_code = 'request_lifecycle'
   and subject_id = '73000000-0000-0000-0000-000000000100'),
  1, 'request_publish', 'client', '73000000-0000-0000-0000-000000000010',
  'Test request published.', '{}'::jsonb, 'checkout-v2-test:request:publish'
);

select public.create_workflow_instance(
  'proposal_lifecycle', 'v1', '73000000-0000-0000-0000-000000000200',
  'marketplace_v2', 'provider', '73000000-0000-0000-0000-000000000020',
  'Selected test proposal.', '{}'::jsonb, 'checkout-v2-test:proposal:selected:create'
);
select public.transition_workflow_instance(
  (select id from public.workflow_instances where machine_code = 'proposal_lifecycle'
   and subject_id = '73000000-0000-0000-0000-000000000200'),
  1, 'proposal_publish', 'provider', '73000000-0000-0000-0000-000000000020',
  'Selected test proposal published.', '{}'::jsonb,
  'checkout-v2-test:proposal:selected:publish'
);
select public.create_workflow_instance(
  'proposal_lifecycle', 'v1', '73000000-0000-0000-0000-000000000201',
  'marketplace_v2', 'provider', '73000000-0000-0000-0000-000000000030',
  'Competing test proposal.', '{}'::jsonb, 'checkout-v2-test:proposal:other:create'
);
select public.transition_workflow_instance(
  (select id from public.workflow_instances where machine_code = 'proposal_lifecycle'
   and subject_id = '73000000-0000-0000-0000-000000000201'),
  1, 'proposal_publish', 'provider', '73000000-0000-0000-0000-000000000030',
  'Competing test proposal published.', '{}'::jsonb,
  'checkout-v2-test:proposal:other:publish'
);

insert into public.financial_terms_snapshots (
  id, financial_flow_version, request_id, proposal_id, proposal_version,
  currency, service_amount_cents, travel_amount_cents,
  provider_initial_gross_amount_cents, platform_fee_rate_bps,
  platform_fee_initial_amount_cents, client_tax_initial_amount_cents,
  client_total_amount_cents, provider_initial_statutory_withholding_cents,
  provider_initial_transfer_amount_cents, scheduled_start_at, scheduled_end_at,
  jurisdiction_code, contract_version, created_by_actor_type, deduplication_key
) values
  (
    '73000000-0000-0000-0000-000000000300', 'marketplace_v2',
    '73000000-0000-0000-0000-000000000100',
    '73000000-0000-0000-0000-000000000200', 1, 'eur',
    8000, 1000, 9000, 1000, 900, 0, 9900, 0, 9000,
    now() + interval '3 days', null, 'BE', 'checkout-v2-test-contract',
    'system', 'checkout-v2-test:terms:selected'
  ),
  (
    '73000000-0000-0000-0000-000000000301', 'marketplace_v2',
    '73000000-0000-0000-0000-000000000100',
    '73000000-0000-0000-0000-000000000201', 1, 'eur',
    9000, 1000, 10000, 1000, 1000, 0, 11000, 0, 10000,
    now() + interval '3 days', null, 'BE', 'checkout-v2-test-contract',
    'system', 'checkout-v2-test:terms:other'
  ),
  (
    '73000000-0000-0000-0000-000000000303', 'marketplace_v2',
    '73000000-0000-0000-0000-000000000100',
    '73000000-0000-0000-0000-000000000201', 2, 'eur',
    9000, 1000, 10000, 1000, 1000, 0, 11000, 0, 10000,
    now() + interval '3 days', null, 'BE', 'checkout-v2-test-contract-v2',
    'system', 'checkout-v2-test:terms:other:v2'
  );

select public.create_checkout_v2_selection(
  '73000000-0000-0000-0000-000000000300', 'checkout_v2_test_policy',
  '73000000-0000-0000-0000-000000000010', 'checkout-v2-test:selection'
);

select extensions.dblink_connect_u('checkout_v2_reserve_1', current_setting('app.test_database_url'));
select extensions.dblink_connect_u('checkout_v2_reserve_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('checkout_v2_reserve_1', $$
  with configured as materialized (
    select set_config('request.jwt.claim.role', 'service_role', false)
  )
  select reservation.attempt_id, reservation.idempotency_key
  from configured
  cross join lateral public.reserve_checkout_v2_attempt(
    (select id from public.checkout_v2_selections
     where deduplication_key = 'checkout-v2-test:selection'),
    '73000000-0000-0000-0000-000000000010'
  ) reservation
$$);
select pg_sleep(0.1);
select extensions.dblink_send_query('checkout_v2_reserve_2', $$
  with configured as materialized (
    select set_config('request.jwt.claim.role', 'service_role', false)
  )
  select reservation.attempt_id, reservation.idempotency_key
  from configured
  cross join lateral public.reserve_checkout_v2_attempt(
    (select id from public.checkout_v2_selections
     where deduplication_key = 'checkout-v2-test:selection'),
    '73000000-0000-0000-0000-000000000010'
  ) reservation
$$);

create temporary table checkout_v2_reservations (
  attempt_id uuid, idempotency_key text
);
insert into checkout_v2_reservations
select * from extensions.dblink_get_result('checkout_v2_reserve_1')
  as result(attempt_id uuid, idempotency_key text);
insert into checkout_v2_reservations
select * from extensions.dblink_get_result('checkout_v2_reserve_2')
  as result(attempt_id uuid, idempotency_key text);
select extensions.dblink_disconnect('checkout_v2_reserve_1');
select extensions.dblink_disconnect('checkout_v2_reserve_2');

do $$
begin
  if (select count(distinct attempt_id) from checkout_v2_reservations) <> 1
     or (select count(distinct idempotency_key) from checkout_v2_reservations) <> 1
     or (select count(*) from public.checkout_v2_attempts) <> 1
     or (select count(*) from public.checkout_v2_liquidity_reservations
         where status = 'active') <> 1 then
    raise exception 'Concurrent Checkout v2 calls did not reuse one reservation';
  end if;
end
$$;

select public.attach_checkout_v2_session(
  (select attempt_id from checkout_v2_reservations limit 1),
  'cs_test_checkout_v2_unique', 'https://checkout.stripe.test/session',
  (select reserved_expires_at - interval '1 second'
   from public.checkout_v2_attempts limit 1)
);

select extensions.dblink_connect_u('checkout_v2_event_1', current_setting('app.test_database_url'));
select extensions.dblink_connect_u('checkout_v2_event_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('checkout_v2_event_1', $$
  with configured as materialized (
    select set_config('request.jwt.claim.role', 'service_role', false)
  )
  select processed.payment_id, processed.duplicate, processed.outcome
  from configured
  cross join lateral public.process_checkout_v2_event(
    'evt_checkout_v2_paid_once', 'checkout.session.completed', now(), false,
    'cs_test_checkout_v2_unique', 'paid', 'pi_checkout_v2_unique',
    'ch_checkout_v2_unique', 9900, 'eur', '{"source":"sql_test"}'::jsonb
  ) processed
$$);
select pg_sleep(0.1);
select extensions.dblink_send_query('checkout_v2_event_2', $$
  with configured as materialized (
    select set_config('request.jwt.claim.role', 'service_role', false)
  )
  select processed.payment_id, processed.duplicate, processed.outcome
  from configured
  cross join lateral public.process_checkout_v2_event(
    'evt_checkout_v2_paid_once', 'checkout.session.completed', now(), false,
    'cs_test_checkout_v2_unique', 'paid', 'pi_checkout_v2_unique',
    'ch_checkout_v2_unique', 9900, 'eur', '{"source":"sql_test_retry"}'::jsonb
  ) processed
$$);

create temporary table checkout_v2_event_results (
  payment_id uuid, duplicate boolean, outcome text
);
insert into checkout_v2_event_results
select * from extensions.dblink_get_result('checkout_v2_event_1')
  as result(payment_id uuid, duplicate boolean, outcome text);
insert into checkout_v2_event_results
select * from extensions.dblink_get_result('checkout_v2_event_2')
  as result(payment_id uuid, duplicate boolean, outcome text);
select extensions.dblink_disconnect('checkout_v2_event_1');
select extensions.dblink_disconnect('checkout_v2_event_2');

do $$
declare
  v_batch uuid;
  v_debits bigint;
  v_credits bigint;
begin
  if (select count(distinct payment_id) from checkout_v2_event_results) <> 1
     or (select count(*) from public.checkout_v2_payments) <> 1
     or (select count(*) from public.checkout_v2_awards) <> 1
     or (select count(*) from public.checkout_v2_webhook_events) <> 1 then
    raise exception 'Concurrent webhook delivery created duplicate financial records';
  end if;
  if (select current_state from public.workflow_instances
      where machine_code = 'request_lifecycle'
        and subject_id = '73000000-0000-0000-0000-000000000100') <> 'awarded'
     or (select current_state from public.workflow_instances
         where machine_code = 'proposal_lifecycle'
           and subject_id = '73000000-0000-0000-0000-000000000200') <> 'accepted'
     or (select current_state from public.workflow_instances
         where machine_code = 'proposal_lifecycle'
           and subject_id = '73000000-0000-0000-0000-000000000201') <> 'not_selected' then
    raise exception 'Webhook did not atomically award and close competing proposals';
  end if;
  if (select status from public.checkout_v2_liquidity_reservations) <> 'consumed' then
    raise exception 'Paid Checkout did not consume its liquidity reservation';
  end if;
  if (select count(*) from public.notifications
      where deduplication_key =
        'checkout-v2-event:evt_checkout_v2_paid_once:notification:73000000-0000-0000-0000-000000000201') <> 1 then
    raise exception 'Non-selected provider was not notified exactly once';
  end if;
  if exists (select 1 from public.payments where financial_flow_version = 'marketplace_v2')
     or exists (select 1 from public.checkout_attempts where financial_flow_version = 'marketplace_v2') then
    raise exception 'Checkout v2 leaked into legacy payment tables';
  end if;
  select id into v_batch from public.financial_ledger_batches
  where operation_key = 'checkout-v2-payment:pi_checkout_v2_unique';
  select coalesce(sum(amount_cents) filter (where direction = 'debit'), 0),
         coalesce(sum(amount_cents) filter (where direction = 'credit'), 0)
  into v_debits, v_credits from public.financial_ledger_entries where batch_id = v_batch;
  if v_debits <> 9900 or v_credits <> 9900
     or (select status from public.financial_ledger_batches where id = v_batch) <> 'posted'
     or (select count(*) from public.financial_audit_log
         where deduplication_key = 'checkout-v2-event:evt_checkout_v2_paid_once:audit') <> 1 then
    raise exception 'Checkout v2 ledger or financial audit is incomplete';
  end if;
end
$$;

do $$
begin
  begin
    insert into public.missions (
      client_id, pro_id, service, date, price, status, booking_id,
      paid_at, financial_flow_version
    ) values (
      '73000000-0000-0000-0000-000000000010',
      '73000000-0000-0000-0000-000000000030',
      'Late proposal must be rejected', now() + interval '3 days', 50,
      'proposed', '73000000-0000-0000-0000-000000000100', null, 'legacy_v1'
    );
    raise exception 'An awarded request accepted a new proposal';
  exception when check_violation then null;
  end;
end
$$;

-- A normally expired session releases exposure and the exclusive request lock,
-- and requires providers to reconfirm instead of silently reactivating offers.
insert into public.bookings (
  id, client_id, pro_id, service, date, time_slot, address, notes, status
) values (
  '73000000-0000-0000-0000-000000000101',
  '73000000-0000-0000-0000-000000000010', null,
  'Checkout v2 expiry request', current_date + 3, '14:00',
  'Test address', 'Expiry release fixture.', 'pending'
);
insert into public.missions (
  id, client_id, pro_id, service, date, price, status, booking_id,
  paid_at, financial_flow_version
) values (
  '73000000-0000-0000-0000-000000000202',
  '73000000-0000-0000-0000-000000000010',
  '73000000-0000-0000-0000-000000000020',
  'Expiring v2 proposal', now() + interval '3 days', 55, 'proposed',
  '73000000-0000-0000-0000-000000000101', null, 'marketplace_v2'
);
select public.create_workflow_instance(
  'request_lifecycle', 'v1', '73000000-0000-0000-0000-000000000101',
  'marketplace_v2', 'client', '73000000-0000-0000-0000-000000000010',
  'Expiry test request.', '{}'::jsonb, 'checkout-v2-expiry:request:create'
);
select public.transition_workflow_instance(
  (select id from public.workflow_instances where machine_code = 'request_lifecycle'
   and subject_id = '73000000-0000-0000-0000-000000000101'),
  1, 'request_publish', 'client', '73000000-0000-0000-0000-000000000010',
  'Expiry request published.', '{}'::jsonb, 'checkout-v2-expiry:request:publish'
);
select public.create_workflow_instance(
  'proposal_lifecycle', 'v1', '73000000-0000-0000-0000-000000000202',
  'marketplace_v2', 'provider', '73000000-0000-0000-0000-000000000020',
  'Expiry test proposal.', '{}'::jsonb, 'checkout-v2-expiry:proposal:create'
);
select public.transition_workflow_instance(
  (select id from public.workflow_instances where machine_code = 'proposal_lifecycle'
   and subject_id = '73000000-0000-0000-0000-000000000202'),
  1, 'proposal_publish', 'provider', '73000000-0000-0000-0000-000000000020',
  'Expiry proposal published.', '{}'::jsonb, 'checkout-v2-expiry:proposal:publish'
);
insert into public.financial_terms_snapshots (
  id, financial_flow_version, request_id, proposal_id, proposal_version,
  currency, service_amount_cents, travel_amount_cents,
  provider_initial_gross_amount_cents, platform_fee_rate_bps,
  platform_fee_initial_amount_cents, client_tax_initial_amount_cents,
  client_total_amount_cents, provider_initial_statutory_withholding_cents,
  provider_initial_transfer_amount_cents, scheduled_start_at,
  jurisdiction_code, contract_version, created_by_actor_type, deduplication_key
) values (
  '73000000-0000-0000-0000-000000000302', 'marketplace_v2',
  '73000000-0000-0000-0000-000000000101',
  '73000000-0000-0000-0000-000000000202', 1, 'eur',
  5000, 0, 5000, 1000, 500, 0, 5500, 0, 5000,
  now() + interval '3 days', 'BE', 'checkout-v2-test-contract', 'system',
  'checkout-v2-expiry:terms'
);
select public.create_checkout_v2_selection(
  '73000000-0000-0000-0000-000000000302', 'checkout_v2_test_policy',
  '73000000-0000-0000-0000-000000000010', 'checkout-v2-expiry:selection'
);
create temporary table checkout_v2_expiry_attempt as
select * from public.reserve_checkout_v2_attempt(
  (select id from public.checkout_v2_selections
   where deduplication_key = 'checkout-v2-expiry:selection'),
  '73000000-0000-0000-0000-000000000010'
);
select public.attach_checkout_v2_session(
  (select attempt_id from checkout_v2_expiry_attempt),
  'cs_test_checkout_v2_expired', 'https://checkout.stripe.test/expired',
  (select expires_at - interval '1 second' from checkout_v2_expiry_attempt)
);
select * from public.process_checkout_v2_event(
  'evt_checkout_v2_expired_once', 'checkout.session.expired', now(), false,
  'cs_test_checkout_v2_expired', 'unpaid', null, null, 5500, 'eur',
  '{"source":"sql_expiry_test"}'::jsonb
);
select * from public.process_checkout_v2_event(
  'evt_checkout_v2_expired_once', 'checkout.session.expired', now(), false,
  'cs_test_checkout_v2_expired', 'unpaid', null, null, 5500, 'eur',
  '{"source":"sql_expiry_retry"}'::jsonb
);
do $$
begin
  if (select status from public.checkout_v2_liquidity_reservations liquidity
      join public.checkout_v2_attempts attempt on attempt.id = liquidity.attempt_id
      where attempt.stripe_session_id = 'cs_test_checkout_v2_expired') <> 'released'
     or (select lock_released_at from public.checkout_v2_selections
         where deduplication_key = 'checkout-v2-expiry:selection') is null
     or (select current_state from public.workflow_instances
         where machine_code = 'request_lifecycle'
           and subject_id = '73000000-0000-0000-0000-000000000101') <> 'open'
     or (select current_state from public.workflow_instances
         where machine_code = 'proposal_lifecycle'
           and subject_id = '73000000-0000-0000-0000-000000000202') <> 'reconfirmation_required'
     or (select count(*) from public.checkout_v2_webhook_events
         where event_id = 'evt_checkout_v2_expired_once') <> 1 then
    raise exception 'Expired Checkout did not release locks idempotently';
  end if;
end
$$;

select 'checkout v2 payment accounting tests passed' as result;
