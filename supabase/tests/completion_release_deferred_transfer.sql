\set ON_ERROR_STOP on

select set_config('app.test_database_url', :'TEST_DATABASE_URL', false);

do $$
begin
  if (select enabled from public.financial_feature_flags
      where flag_code = 'completion_release_v2') then
    raise exception 'Completion/release v2 must be disabled by default';
  end if;
  if has_table_privilege('authenticated', 'public.provider_transfers_v2', 'select')
     or has_table_privilege('authenticated', 'public.fund_releases_v2', 'update')
     or has_function_privilege(
       'authenticated', 'public.client_confirm_service_v2(uuid,uuid,text)',
       'execute'
     ) then
    raise exception 'Browser roles can access server-only release or transfer state';
  end if;
end
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('74000000-0000-0000-0000-000000000010', 'release-client@example.test',
   '{"requested_role":"client"}'::jsonb),
  ('74000000-0000-0000-0000-000000000020', 'release-provider@example.test',
   '{"requested_role":"pro"}'::jsonb);

update public.users set role = 'pro', active_role = 'pro'
where id = '74000000-0000-0000-0000-000000000020';

insert into public.provider_eligibility_policy_versions (
  version, jurisdiction_code, service_country_code, requirement_definitions,
  effective_from, notes
) values (
  'release_v2_test_policy', 'BE', 'BE', '[]'::jsonb,
  now() - interval '1 day',
  'Test-only eligibility policy without national legal assumptions.'
);
insert into public.provider_eligibility_assessments (
  provider_id, policy_version, service_country_code, service_category_code,
  revision, status, reason, actor_type, deduplication_key
) values (
  '74000000-0000-0000-0000-000000000020', 'release_v2_test_policy',
  'BE', '*', 1, 'eligible', 'Test-only eligible assessment.', 'system',
  'release-v2-test:eligibility'
);
insert into public.provider_connect_account_identities (
  stripe_account_id, provider_id, creation_generation, account_api_version
) values (
  'acct_ReleaseV2Test', '74000000-0000-0000-0000-000000000020',
  1, 'accounts_v2'
);
insert into public.provider_connect_accounts (
  provider_id, stripe_account_id, creation_state, creation_idempotency_key,
  stripe_transfers_status, payouts_status, livemode, last_synced_at
) values (
  '74000000-0000-0000-0000-000000000020', 'acct_ReleaseV2Test', 'created',
  'connect-account-v2:74000000-0000-0000-0000-000000000020:1',
  'active', 'unknown', false, now()
);

insert into public.financial_limit_versions (
  version, metric_code, currency, comparison_operator,
  warning_threshold_cents, blocking_threshold_cents, notes
) values (
  'release_v2_test_limits', 'checkout_liquidity_exposure', 'eur', 'above',
  1000000, 2000000, 'Test-only limit.'
) on conflict (version, metric_code, currency) do nothing;
insert into public.checkout_v2_policy_versions (
  version, currency, payment_window_open_before_start_seconds,
  payment_deadline_seconds, checkout_ttl_seconds,
  checkout_expiry_margin_before_start_seconds, liquidity_limit_version,
  stripe_payment_method_configuration_reference, notes
) values (
  'release_v2_test_checkout_policy', 'eur', 604800, 864000, 3600, 1800,
  'release_v2_test_limits', 'pmc_release_v2_test', 'Test-only Checkout policy.'
) on conflict (version) do nothing;

select set_config('request.jwt.claim.role', 'service_role', false);
update public.financial_feature_flags
set enabled = true, reason = 'SQL test transaction only.'
where flag_code = 'completion_release_v2';

create or replace function pg_temp.create_release_v2_fixture(
  p_tag text,
  p_request_id uuid,
  p_proposal_id uuid,
  p_terms_id uuid,
  p_selection_id uuid,
  p_attempt_id uuid,
  p_payment_id uuid,
  p_scheduled_start_at timestamptz,
  p_scheduled_end_at timestamptz,
  p_amount_cents bigint,
  p_client_tax_cents bigint default 0
)
returns void
language plpgsql
as $$
declare
  v_request_workflow public.workflow_instances%rowtype;
  v_proposal_workflow public.workflow_instances%rowtype;
  v_selection_workflow public.workflow_instances%rowtype;
  v_attempt_workflow public.workflow_instances%rowtype;
  v_payment_workflow public.workflow_instances%rowtype;
begin
  insert into public.bookings (
    id, client_id, service, date, time_slot, address, notes, status
  ) values (
    p_request_id, '74000000-0000-0000-0000-000000000010',
    'Release v2 ' || p_tag, current_date, '10:00', 'Test address',
    'Completion and release test.', 'pending'
  );
  insert into public.missions (
    id, client_id, pro_id, service, date, price, status, booking_id,
    paid_at, financial_flow_version
  ) values (
    p_proposal_id, '74000000-0000-0000-0000-000000000010',
    '74000000-0000-0000-0000-000000000020', 'Release proposal ' || p_tag,
    p_scheduled_start_at, p_amount_cents::numeric / 100, 'proposed',
    p_request_id, now(), 'marketplace_v2'
  );
  insert into public.financial_terms_snapshots (
    id, financial_flow_version, request_id, proposal_id, proposal_version,
    currency, service_amount_cents, travel_amount_cents,
    provider_initial_gross_amount_cents, platform_fee_rate_bps,
    platform_fee_initial_amount_cents, client_tax_initial_amount_cents,
    client_total_amount_cents, provider_initial_statutory_withholding_cents,
    provider_initial_transfer_amount_cents, scheduled_start_at,
    scheduled_end_at, jurisdiction_code, contract_version,
    eligibility_policy_version, eligibility_service_category_code,
    created_by_actor_type, deduplication_key
  ) values (
    p_terms_id, 'marketplace_v2', p_request_id, p_proposal_id, 1,
    'eur', p_amount_cents, 0, p_amount_cents, 1000,
    round(p_amount_cents::numeric * 1000 / 10000)::bigint, p_client_tax_cents,
    p_amount_cents + round(p_amount_cents::numeric * 1000 / 10000)::bigint
      + p_client_tax_cents,
    0, p_amount_cents, p_scheduled_start_at, p_scheduled_end_at,
    'BE', 'release-v2-test-contract', 'release_v2_test_policy',
    'beauty.general', 'system', 'release-v2-test:' || p_tag || ':terms'
  );

  v_request_workflow := public.create_workflow_instance(
    'request_lifecycle', 'v1', p_request_id, 'marketplace_v2',
    'client', '74000000-0000-0000-0000-000000000010', 'Test request.',
    '{}'::jsonb, 'release-v2-test:' || p_tag || ':request:create'
  );
  v_request_workflow := public.transition_workflow_instance(
    v_request_workflow.id, v_request_workflow.revision, 'request_publish',
    'client', '74000000-0000-0000-0000-000000000010', 'Published.',
    '{}'::jsonb, 'release-v2-test:' || p_tag || ':request:publish'
  );
  v_request_workflow := public.transition_workflow_instance(
    v_request_workflow.id, v_request_workflow.revision, 'request_select',
    'client', '74000000-0000-0000-0000-000000000010', 'Selected.',
    '{}'::jsonb, 'release-v2-test:' || p_tag || ':request:select'
  );
  v_request_workflow := public.transition_workflow_instance(
    v_request_workflow.id, v_request_workflow.revision,
    'request_payment_confirmed', 'system', null, 'Paid.', '{}'::jsonb,
    'release-v2-test:' || p_tag || ':request:paid'
  );

  v_proposal_workflow := public.create_workflow_instance(
    'proposal_lifecycle', 'v1', p_proposal_id, 'marketplace_v2',
    'provider', '74000000-0000-0000-0000-000000000020', 'Test proposal.',
    '{}'::jsonb, 'release-v2-test:' || p_tag || ':proposal:create'
  );
  v_proposal_workflow := public.transition_workflow_instance(
    v_proposal_workflow.id, v_proposal_workflow.revision, 'proposal_publish',
    'provider', '74000000-0000-0000-0000-000000000020', 'Published.',
    '{}'::jsonb, 'release-v2-test:' || p_tag || ':proposal:publish'
  );
  v_proposal_workflow := public.transition_workflow_instance(
    v_proposal_workflow.id, v_proposal_workflow.revision, 'proposal_freeze',
    'system', null, 'Frozen.', '{}'::jsonb,
    'release-v2-test:' || p_tag || ':proposal:freeze'
  );
  v_proposal_workflow := public.transition_workflow_instance(
    v_proposal_workflow.id, v_proposal_workflow.revision, 'proposal_accept',
    'system', null, 'Accepted.', '{}'::jsonb,
    'release-v2-test:' || p_tag || ':proposal:accept'
  );

  v_selection_workflow := public.create_workflow_instance(
    'conditional_selection', 'v1', p_selection_id, 'marketplace_v2',
    'client', '74000000-0000-0000-0000-000000000010', 'Selection.',
    '{}'::jsonb, 'release-v2-test:' || p_tag || ':selection:create'
  );
  v_selection_workflow := public.transition_workflow_instance(
    v_selection_workflow.id, v_selection_workflow.revision, 'selection_commit',
    'client', '74000000-0000-0000-0000-000000000010', 'Committed.',
    '{}'::jsonb, 'release-v2-test:' || p_tag || ':selection:commit'
  );
  v_selection_workflow := public.transition_workflow_instance(
    v_selection_workflow.id, v_selection_workflow.revision,
    'selection_open_payment_window', 'system', null, 'Payment due.',
    '{}'::jsonb, 'release-v2-test:' || p_tag || ':selection:due'
  );
  v_selection_workflow := public.transition_workflow_instance(
    v_selection_workflow.id, v_selection_workflow.revision,
    'selection_checkout_created', 'system', null, 'Checkout active.',
    '{}'::jsonb, 'release-v2-test:' || p_tag || ':selection:checkout'
  );
  v_selection_workflow := public.transition_workflow_instance(
    v_selection_workflow.id, v_selection_workflow.revision,
    'selection_fulfilled', 'system', null, 'Fulfilled.', '{}'::jsonb,
    'release-v2-test:' || p_tag || ':selection:fulfilled'
  );

  v_attempt_workflow := public.create_workflow_instance(
    'checkout_attempt', 'v1', p_attempt_id, 'marketplace_v2',
    'system', null, 'Attempt.', '{}'::jsonb,
    'release-v2-test:' || p_tag || ':attempt:create'
  );
  v_attempt_workflow := public.transition_workflow_instance(
    v_attempt_workflow.id, v_attempt_workflow.revision,
    'checkout_attach_session', 'system', null, 'Attached.', '{}'::jsonb,
    'release-v2-test:' || p_tag || ':attempt:attach'
  );
  v_attempt_workflow := public.transition_workflow_instance(
    v_attempt_workflow.id, v_attempt_workflow.revision,
    'checkout_complete', 'system', null, 'Completed.', '{}'::jsonb,
    'release-v2-test:' || p_tag || ':attempt:complete'
  );
  v_payment_workflow := public.create_workflow_instance(
    'payment_lifecycle', 'v1', p_payment_id, 'marketplace_v2',
    'system', null, 'Payment.', '{}'::jsonb,
    'release-v2-test:' || p_tag || ':payment:create'
  );
  v_payment_workflow := public.transition_workflow_instance(
    v_payment_workflow.id, v_payment_workflow.revision,
    'payment_confirm_paid', 'system', null, 'Paid.', '{}'::jsonb,
    'release-v2-test:' || p_tag || ':payment:paid'
  );

  insert into public.checkout_v2_selections (
    id, request_id, selected_proposal_id, terms_snapshot_id, client_id,
    provider_id, policy_version, request_workflow_instance_id,
    proposal_workflow_instance_id, selection_workflow_instance_id,
    payment_window_opens_at, payment_deadline_at, deduplication_key
  ) values (
    p_selection_id, p_request_id, p_proposal_id, p_terms_id,
    '74000000-0000-0000-0000-000000000010',
    '74000000-0000-0000-0000-000000000020',
    'release_v2_test_checkout_policy', v_request_workflow.id,
    v_proposal_workflow.id, v_selection_workflow.id,
    now() - interval '1 day', now() + interval '1 day',
    'release-v2-test:' || p_tag || ':selection'
  );
  insert into public.checkout_v2_attempts (
    id, selection_id, terms_snapshot_id, client_id, workflow_instance_id,
    attempt_number, idempotency_key, stripe_session_id, stripe_session_url,
    reserved_expires_at, stripe_expires_at,
    payment_method_configuration_reference, currency, amount_total_cents,
    stripe_payment_intent_id, stripe_charge_id
  ) values (
    p_attempt_id, p_selection_id, p_terms_id,
    '74000000-0000-0000-0000-000000000010', v_attempt_workflow.id, 1,
    'release-v2-test:' || p_tag || ':checkout', 'cs_' || p_tag,
    'https://checkout.stripe.test/' || p_tag, now() + interval '1 hour',
    now() + interval '59 minutes', 'pmc_release_v2_test', 'eur',
    p_amount_cents + round(p_amount_cents::numeric * 1000 / 10000)::bigint
      + p_client_tax_cents,
    'pi_' || p_tag, 'ch_' || p_tag
  );
  insert into public.checkout_v2_payments (
    id, selection_id, attempt_id, request_id, proposal_id, terms_snapshot_id,
    client_id, provider_id, workflow_instance_id, currency, amount_total_cents,
    provider_gross_held_cents, platform_fee_held_cents,
    client_tax_held_cents, stripe_payment_intent_id, stripe_charge_id,
    stripe_session_id, stripe_event_id, livemode, paid_at
  ) values (
    p_payment_id, p_selection_id, p_attempt_id, p_request_id, p_proposal_id,
    p_terms_id, '74000000-0000-0000-0000-000000000010',
    '74000000-0000-0000-0000-000000000020', v_payment_workflow.id, 'eur',
    p_amount_cents + round(p_amount_cents::numeric * 1000 / 10000)::bigint
      + p_client_tax_cents,
    p_amount_cents, round(p_amount_cents::numeric * 1000 / 10000)::bigint,
    p_client_tax_cents, 'pi_' || p_tag, 'ch_' || p_tag, 'cs_' || p_tag,
    'evt_' || p_tag, false, now()
  );
  insert into public.checkout_v2_awards (
    request_id, selection_id, proposal_id, payment_id, client_id, provider_id,
    awarded_at
  ) values (
    p_request_id, p_selection_id, p_proposal_id, p_payment_id,
    '74000000-0000-0000-0000-000000000010',
    '74000000-0000-0000-0000-000000000020', now()
  );
end
$$;

select pg_temp.create_release_v2_fixture(
  'release_client',
  '74000000-0000-0000-0000-000000000101',
  '74000000-0000-0000-0000-000000000201',
  '74000000-0000-0000-0000-000000000301',
  '74000000-0000-0000-0000-000000000401',
  '74000000-0000-0000-0000-000000000501',
  '74000000-0000-0000-0000-000000000601',
  now() - interval '1 day', null, 9000
);
select pg_temp.create_release_v2_fixture(
  'release_timeout',
  '74000000-0000-0000-0000-000000000102',
  '74000000-0000-0000-0000-000000000202',
  '74000000-0000-0000-0000-000000000302',
  '74000000-0000-0000-0000-000000000402',
  '74000000-0000-0000-0000-000000000502',
  '74000000-0000-0000-0000-000000000602',
  now() - interval '2 days', now() - interval '1 day', 8000
);
select pg_temp.create_release_v2_fixture(
  'release_problem',
  '74000000-0000-0000-0000-000000000103',
  '74000000-0000-0000-0000-000000000203',
  '74000000-0000-0000-0000-000000000303',
  '74000000-0000-0000-0000-000000000403',
  '74000000-0000-0000-0000-000000000503',
  '74000000-0000-0000-0000-000000000603',
  now() - interval '1 day', null, 7000
);
select pg_temp.create_release_v2_fixture(
  'release_future',
  '74000000-0000-0000-0000-000000000104',
  '74000000-0000-0000-0000-000000000204',
  '74000000-0000-0000-0000-000000000304',
  '74000000-0000-0000-0000-000000000404',
  '74000000-0000-0000-0000-000000000504',
  '74000000-0000-0000-0000-000000000604',
  now() + interval '1 day', null, 6000
);
select pg_temp.create_release_v2_fixture(
  'release_blocked_confirm',
  '74000000-0000-0000-0000-000000000105',
  '74000000-0000-0000-0000-000000000205',
  '74000000-0000-0000-0000-000000000305',
  '74000000-0000-0000-0000-000000000405',
  '74000000-0000-0000-0000-000000000505',
  '74000000-0000-0000-0000-000000000605',
  now() - interval '1 day', null, 5000
);
select pg_temp.create_release_v2_fixture(
  'release_latest_eligibility',
  '74000000-0000-0000-0000-000000000106',
  '74000000-0000-0000-0000-000000000206',
  '74000000-0000-0000-0000-000000000306',
  '74000000-0000-0000-0000-000000000406',
  '74000000-0000-0000-0000-000000000506',
  '74000000-0000-0000-0000-000000000606',
  now() - interval '1 day', null, 4000
);
select pg_temp.create_release_v2_fixture(
  'release_client_tax',
  '74000000-0000-0000-0000-000000000107',
  '74000000-0000-0000-0000-000000000207',
  '74000000-0000-0000-0000-000000000307',
  '74000000-0000-0000-0000-000000000407',
  '74000000-0000-0000-0000-000000000507',
  '74000000-0000-0000-0000-000000000607',
  now() - interval '1 day', null, 3000, 123
);

do $$
begin
  if (select completion_not_before_at from public.service_executions_v2
      where payment_id = '74000000-0000-0000-0000-000000000601')
       <> (select scheduled_start_at from public.financial_terms_snapshots
           where id = '74000000-0000-0000-0000-000000000301')
     or (select completion_not_before_at from public.service_executions_v2
         where payment_id = '74000000-0000-0000-0000-000000000602')
       <> (select scheduled_end_at from public.financial_terms_snapshots
           where id = '74000000-0000-0000-0000-000000000302') then
    raise exception 'completion_not_before_at did not preserve start/end semantics';
  end if;
  begin
    perform public.provider_complete_service_v2(
      '74000000-0000-0000-0000-000000000604',
      '74000000-0000-0000-0000-000000000020', 'release-future:blocked'
    );
    raise exception 'Provider completed before completion_not_before_at';
  exception when check_violation then null;
  end;
end
$$;

-- Client confirmation releases immediately without a provider declaration.
select * from public.client_confirm_service_v2(
  '74000000-0000-0000-0000-000000000601',
  '74000000-0000-0000-0000-000000000010',
  'release-client:confirm'
);
select * from public.reserve_client_confirmed_fund_release_v2(
  '74000000-0000-0000-0000-000000000601',
  (select revision from public.provider_connect_accounts
   where provider_id = '74000000-0000-0000-0000-000000000020')
);
do $$
begin
  if (select provider_completed_at from public.service_executions_v2
      where payment_id = '74000000-0000-0000-0000-000000000601') is not null
     or (select release_trigger from public.fund_releases_v2
         where payment_id = '74000000-0000-0000-0000-000000000601')
       <> 'client_confirmation'
     or (select original_release_due_at from public.fund_releases_v2
         where payment_id = '74000000-0000-0000-0000-000000000601') is not null then
    raise exception 'Direct client confirmation did not release correctly';
  end if;
end
$$;

-- A retryable Stripe failure keeps the same transfer identity and can succeed.
select * from public.reserve_provider_transfer_dispatch_v2(
  (select id from public.provider_transfers_v2
   where payment_id = '74000000-0000-0000-0000-000000000601'),
  (select revision from public.provider_connect_accounts
   where provider_id = '74000000-0000-0000-0000-000000000020')
);
select public.mark_provider_transfer_submitted_v2(
  (select id from public.provider_transfers_v2
   where payment_id = '74000000-0000-0000-0000-000000000601')
);
select public.fail_provider_transfer_v2(
  (select id from public.provider_transfers_v2
   where payment_id = '74000000-0000-0000-0000-000000000601'),
  'network_error', 'Test retryable network failure.', true
);
create temporary table release_v2_retry_identity as
select id, idempotency_key from public.provider_transfers_v2
where payment_id = '74000000-0000-0000-0000-000000000601';
select * from public.reserve_provider_transfer_dispatch_v2(
  (select id from release_v2_retry_identity),
  (select revision from public.provider_connect_accounts
   where provider_id = '74000000-0000-0000-0000-000000000020')
);
select public.mark_provider_transfer_submitted_v2((select id from release_v2_retry_identity));
select public.complete_provider_transfer_v2(
  (select id from release_v2_retry_identity), 'tr_release_client_unique'
);
select public.complete_provider_transfer_v2(
  (select id from release_v2_retry_identity), 'tr_release_client_unique'
);

-- Provider completion starts exactly one stable 48-hour deadline under race.
select extensions.dblink_connect_u('release_provider_1', current_setting('app.test_database_url'));
select extensions.dblink_connect_u('release_provider_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('release_provider_1', $$
  with configured as materialized (
    select set_config('request.jwt.claim.role', 'service_role', false)
  ) select (public.provider_complete_service_v2(
    '74000000-0000-0000-0000-000000000602',
    '74000000-0000-0000-0000-000000000020', 'release-timeout:provider'
  )).payment_id from configured
$$);
select pg_sleep(0.1);
select extensions.dblink_send_query('release_provider_2', $$
  with configured as materialized (
    select set_config('request.jwt.claim.role', 'service_role', false)
  ) select (public.provider_complete_service_v2(
    '74000000-0000-0000-0000-000000000602',
    '74000000-0000-0000-0000-000000000020', 'release-timeout:provider'
  )).payment_id from configured
$$);
select * from extensions.dblink_get_result('release_provider_1') as result(payment_id uuid);
select * from extensions.dblink_get_result('release_provider_2') as result(payment_id uuid);
select extensions.dblink_disconnect('release_provider_1');
select extensions.dblink_disconnect('release_provider_2');

do $$
begin
  if (select release_due_at - provider_completed_at
      from public.service_executions_v2
      where payment_id = '74000000-0000-0000-0000-000000000602')
       <> interval '48 hours'
     or (select release_due_at from public.service_executions_v2
         where payment_id = '74000000-0000-0000-0000-000000000602')
       <> (select original_release_due_at from public.service_executions_v2
           where payment_id = '74000000-0000-0000-0000-000000000602') then
    raise exception 'Provider completion did not create one immutable 48-hour deadline';
  end if;
  if exists (
    select 1 from public.list_due_fund_releases_v2(100)
    where payment_id = '74000000-0000-0000-0000-000000000602'
  ) then
    raise exception '48-hour release became due too early';
  end if;
end
$$;

-- Move only the test clock fields to an elapsed deadline.
do $$
declare
  v_due_at timestamptz := clock_timestamp() - interval '1 second';
begin
  perform set_config('app.completion_release_v2_mutation', 'on', true);
  update public.service_executions_v2 set
    provider_completed_at = v_due_at - interval '48 hours',
    release_due_at = v_due_at,
    original_release_due_at = v_due_at,
    updated_at = clock_timestamp()
  where payment_id = '74000000-0000-0000-0000-000000000602';
end
$$;

select extensions.dblink_connect_u('release_due_1', current_setting('app.test_database_url'));
select extensions.dblink_connect_u('release_due_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('release_due_1', $$
  with configured as materialized (
    select set_config('request.jwt.claim.role', 'service_role', false)
  ) select transfer_id from configured cross join lateral
    public.reserve_due_fund_release_v2(
      '74000000-0000-0000-0000-000000000602',
      (select revision from public.provider_connect_accounts
       where provider_id = '74000000-0000-0000-0000-000000000020')
    )
$$);
select pg_sleep(0.1);
select extensions.dblink_send_query('release_due_2', $$
  with configured as materialized (
    select set_config('request.jwt.claim.role', 'service_role', false)
  ) select transfer_id from configured cross join lateral
    public.reserve_due_fund_release_v2(
      '74000000-0000-0000-0000-000000000602',
      (select revision from public.provider_connect_accounts
       where provider_id = '74000000-0000-0000-0000-000000000020')
    )
$$);
create temporary table release_due_results(transfer_id uuid);
insert into release_due_results
select * from extensions.dblink_get_result('release_due_1') as result(transfer_id uuid);
insert into release_due_results
select * from extensions.dblink_get_result('release_due_2') as result(transfer_id uuid);
select extensions.dblink_disconnect('release_due_1');
select extensions.dblink_disconnect('release_due_2');

do $$
begin
  if (select count(distinct transfer_id) from release_due_results) <> 1
     or (select count(*) from public.financial_allocation_snapshots
         where terms_snapshot_id = '74000000-0000-0000-0000-000000000302') <> 1
     or (select count(*) from public.provider_transfers_v2
         where payment_id = '74000000-0000-0000-0000-000000000602') <> 1
     or (select release_trigger from public.fund_releases_v2
         where payment_id = '74000000-0000-0000-0000-000000000602')
       <> 'provider_timeout_48h' then
    raise exception 'Concurrent timeout release was not idempotent';
  end if;
end
$$;

-- The client can report a problem without provider completion; it blocks release.
do $$
begin
  if exists (
    select 1 from public.list_due_fund_releases_v2(100)
    where payment_id = '74000000-0000-0000-0000-000000000603'
  ) then
    raise exception 'Scheduled time alone incorrectly triggered automatic release';
  end if;
end
$$;
select public.client_report_service_problem_v2(
  '74000000-0000-0000-0000-000000000603',
  '74000000-0000-0000-0000-000000000010', 'provider_no_show',
  'Provider did not attend the test service.', 'release-problem:report'
);
do $$
begin
  if (select current_state from public.workflow_instances
      where id = (select workflow_instance_id from public.fund_releases_v2
                  where payment_id = '74000000-0000-0000-0000-000000000603'))
       <> 'blocked'
     or (select count(*) from public.checkout_v2_financial_holds
         where payment_id = '74000000-0000-0000-0000-000000000603'
           and released_at is null) <> 1
     or exists (select 1 from public.provider_transfers_v2
                where payment_id = '74000000-0000-0000-0000-000000000603') then
    raise exception 'Problem/no-show did not block release atomically';
  end if;
  begin
    perform public.client_confirm_service_v2(
      '74000000-0000-0000-0000-000000000603',
      '74000000-0000-0000-0000-000000000010',
      'release-problem:confirm-must-fail'
    );
    raise exception 'Problem case was released';
  exception when sqlstate '55000' then null;
  end;
end
$$;

-- A financial block prevents release without losing the client confirmation.
select public.open_checkout_v2_financial_hold(
  '74000000-0000-0000-0000-000000000605', 'payment_issue',
  'payment-issue:release-blocked-confirm', 'Test payment issue.',
  'system', null, 'release-blocked-confirm:hold'
);
select public.client_confirm_service_v2(
  '74000000-0000-0000-0000-000000000605',
  '74000000-0000-0000-0000-000000000010',
  'release-blocked-confirm:client'
);
do $$
begin
  begin
    perform public.reserve_client_confirmed_fund_release_v2(
      '74000000-0000-0000-0000-000000000605',
      (select revision from public.provider_connect_accounts
       where provider_id = '74000000-0000-0000-0000-000000000020')
    );
    raise exception 'Blocked client confirmation released funds';
  exception when sqlstate '55000' then null;
  end;
  if (select client_confirmed_at from public.service_executions_v2
      where payment_id = '74000000-0000-0000-0000-000000000605') is null
     or (select released_at from public.fund_releases_v2
         where payment_id = '74000000-0000-0000-0000-000000000605') is not null then
    raise exception 'Client confirmation was lost or a hold was bypassed';
  end if;
end
$$;

-- Final transfer accounting is balanced and unique after retries.
do $$
declare
  v_release_batch uuid;
  v_transfer_batch uuid;
begin
  select ledger_batch_id into v_release_batch from public.fund_releases_v2
  where payment_id = '74000000-0000-0000-0000-000000000601';
  select ledger_batch_id into v_transfer_batch from public.provider_transfers_v2
  where payment_id = '74000000-0000-0000-0000-000000000601';
  if (select sum(case direction when 'debit' then amount_cents else -amount_cents end)
      from public.financial_ledger_entries where batch_id = v_release_batch) <> 0
     or (select sum(case direction when 'debit' then amount_cents else -amount_cents end)
         from public.financial_ledger_entries where batch_id = v_transfer_batch) <> 0
     or (select count(*) from public.provider_transfer_v2_attempts
         where transfer_id = (select id from release_v2_retry_identity)) <> 2
     or (select count(*) from public.financial_ledger_batches
         where operation_key = 'transfer-v2:' || (select id::text from release_v2_retry_identity)) <> 1
     or (select source_transaction_charge_id from public.provider_transfers_v2
         where id = (select id from release_v2_retry_identity)) <> 'ch_release_client'
     or (select idempotency_key from public.provider_transfers_v2
         where id = (select id from release_v2_retry_identity))
       <> (select idempotency_key from release_v2_retry_identity) then
    raise exception 'Deferred transfer retry or ledger invariants failed';
  end if;
end
$$;

-- Final client tax allocation leaves the pending account for a payable.
select public.client_confirm_service_v2(
  '74000000-0000-0000-0000-000000000607',
  '74000000-0000-0000-0000-000000000010',
  'release-client-tax:confirm'
);
select * from public.reserve_client_confirmed_fund_release_v2(
  '74000000-0000-0000-0000-000000000607',
  (select revision from public.provider_connect_accounts
   where provider_id = '74000000-0000-0000-0000-000000000020')
);
do $$
declare v_batch_id uuid;
begin
  select ledger_batch_id into v_batch_id from public.fund_releases_v2
  where payment_id = '74000000-0000-0000-0000-000000000607';
  if (select coalesce(sum(case entry.direction when 'debit' then entry.amount_cents
                    else -entry.amount_cents end), 0)
      from public.financial_ledger_entries entry
      where entry.batch_id = v_batch_id) <> 0
     or (select coalesce(sum(entry.amount_cents), 0)
         from public.financial_ledger_entries entry
         join public.financial_ledger_accounts account on account.id = entry.account_id
         where entry.batch_id = v_batch_id and account.account_code = 'client_tax_held'
           and entry.direction = 'debit') <> 123
     or (select coalesce(sum(entry.amount_cents), 0)
         from public.financial_ledger_entries entry
         join public.financial_ledger_accounts account on account.id = entry.account_id
         where entry.batch_id = v_batch_id and account.account_code = 'client_tax_payable'
           and entry.direction = 'credit') <> 123 then
    raise exception 'Client tax release ledger allocation failed';
  end if;
end
$$;

-- Only the latest applicable eligibility assessment can authorize release.
insert into public.provider_eligibility_assessments (
  provider_id, policy_version, service_country_code, service_category_code,
  revision, status, reason, actor_type, deduplication_key
) values (
  '74000000-0000-0000-0000-000000000020', 'release_v2_test_policy',
  'BE', '*', 2, 'ineligible', 'Test-only later ineligible assessment.',
  'system', 'release-v2-test:eligibility:ineligible'
);
select public.client_confirm_service_v2(
  '74000000-0000-0000-0000-000000000606',
  '74000000-0000-0000-0000-000000000010',
  'release-latest-eligibility:client'
);
do $$
begin
  begin
    perform public.reserve_client_confirmed_fund_release_v2(
      '74000000-0000-0000-0000-000000000606',
      (select revision from public.provider_connect_accounts
       where provider_id = '74000000-0000-0000-0000-000000000020')
    );
    raise exception 'An obsolete eligible assessment authorized release';
  exception when sqlstate '55000' then null;
  end;
  if (select released_at from public.fund_releases_v2
      where payment_id = '74000000-0000-0000-0000-000000000606') is not null then
    raise exception 'Latest ineligible assessment did not block release';
  end if;
end
$$;

select 'completion, release and deferred transfer v2 tests passed' as result;
