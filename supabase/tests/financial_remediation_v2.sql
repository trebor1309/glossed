\set ON_ERROR_STOP on

select set_config('app.test_database_url', :'TEST_DATABASE_URL', false);

do $$
begin
  if (select enabled from public.financial_feature_flags
      where flag_code = 'financial_remediation_v2') then
    raise exception 'Financial remediation v2 must be disabled by default';
  end if;
  if has_table_privilege('authenticated', 'public.refunds_v2', 'select')
     or has_table_privilege('authenticated', 'public.payment_disputes_v2', 'insert')
     or has_function_privilege(
       'authenticated', 'public.reserve_transfer_reversal_dispatch_v2(uuid)', 'execute'
     ) then
    raise exception 'Browser roles can access server-only remediation state';
  end if;
end
$$;

-- These fixtures are intentionally reused from the immediately preceding
-- completion/release test in the local suite so post-transfer recovery is
-- tested against the exact tranche-4 records it extends.
insert into auth.users (id, email, raw_user_meta_data) values (
  '75000000-0000-0000-0000-000000000001',
  'financial-admin@example.test', '{}'
);
insert into public.app_admins (user_id)
values ('75000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claim.role', 'service_role', false);
update public.financial_feature_flags
set enabled = true, reason = 'SQL test transaction only.'
where flag_code = 'financial_remediation_v2';

-- Restore a current eligible assessment after the tranche-4 stale-assessment
-- test deliberately made the provider ineligible.
insert into public.provider_eligibility_assessments (
  provider_id, policy_version, service_country_code, service_category_code,
  revision, status, reason, actor_type, deduplication_key
) values (
  '74000000-0000-0000-0000-000000000020', 'release_v2_test_policy',
  'BE', '*', 3, 'eligible', 'Tranche-5 test eligibility.', 'system',
  'remediation-v2-test:eligibility'
);

-- Commercial cancellation: client proposes a full refund, provider offers an
-- explicit partial allocation and the client explicitly accepts it.
select public.request_client_cancellation_v2(
  '74000000-0000-0000-0000-000000000604',
  '74000000-0000-0000-0000-000000000010',
  'Client requests launch-default full refund.',
  'remediation-v2-test:cancellation'
);
select public.provider_respond_cancellation_v2(
  (select id from public.cancellation_cases_v2
   where payment_id = '74000000-0000-0000-0000-000000000604'),
  '74000000-0000-0000-0000-000000000020', 'counter_partial',
  3000, 200, 0, 'Provider proposes an explicit 30 EUR gross award.',
  'remediation-v2-test:cancellation:counter'
);
select public.client_respond_cancellation_v2(
  (select id from public.cancellation_cases_v2
   where payment_id = '74000000-0000-0000-0000-000000000604'),
  '74000000-0000-0000-0000-000000000010', true,
  'Client explicitly accepts the partial allocation.',
  'remediation-v2-test:cancellation:accept'
);
select * from public.execute_agreed_cancellation_v2(
  (select id from public.cancellation_cases_v2
   where payment_id = '74000000-0000-0000-0000-000000000604'),
  (select revision from public.provider_connect_accounts
   where provider_id = '74000000-0000-0000-0000-000000000020'),
  'remediation-v2-test:cancellation:execute'
);

do $$
declare
  v_allocation public.financial_allocation_snapshots%rowtype;
  v_batch uuid;
begin
  select allocation.* into v_allocation
  from public.financial_allocation_snapshots allocation
  join public.checkout_v2_payments payment
    on payment.terms_snapshot_id = allocation.terms_snapshot_id
  where payment.id = '74000000-0000-0000-0000-000000000604';
  select ledger_batch_id into v_batch from public.financial_resolutions_v2
  where payment_id = '74000000-0000-0000-0000-000000000604';
  if v_allocation.provider_awarded_gross_amount_cents <> 3000
     or v_allocation.provider_statutory_withholding_amount_cents <> 200
     or v_allocation.provider_transfer_amount_cents <> 2800
     or v_allocation.platform_fee_final_amount_cents <> 300
     or v_allocation.client_refund_amount_cents <> 3300 then
    raise exception 'Partial cancellation allocation or proportional fee is wrong';
  end if;
  if (select sum(case direction when 'debit' then amount_cents else -amount_cents end)
      from public.financial_ledger_entries where batch_id = v_batch) <> 0 then
    raise exception 'Partial cancellation allocation ledger is not balanced';
  end if;
end
$$;

-- A signed refund event is the idempotent local completion signal.
select public.mark_refund_submitted_v2(
  (select id from public.refunds_v2
   where payment_id = '74000000-0000-0000-0000-000000000604')
);
select public.record_refund_submission_v2(
  (select id from public.refunds_v2
   where payment_id = '74000000-0000-0000-0000-000000000604'),
  're_remediation_partial'
);
select * from public.process_refund_v2_event(
  'evt_remediation_refund_partial', 'refund.updated', now(),
  (select id from public.refunds_v2
   where payment_id = '74000000-0000-0000-0000-000000000604'),
  're_remediation_partial', 'succeeded', 3300, null, '{}'::jsonb
);
select * from public.process_refund_v2_event(
  'evt_remediation_refund_partial', 'refund.updated', now(),
  (select id from public.refunds_v2
   where payment_id = '74000000-0000-0000-0000-000000000604'),
  're_remediation_partial', 'succeeded', 3300, null, '{}'::jsonb
);

do $$
begin
  if (select count(*) from public.refunds_v2
      where payment_id = '74000000-0000-0000-0000-000000000604') <> 1
     or (select count(*) from public.financial_ledger_batches
         where external_reference_type = 'stripe_refund'
           and external_reference_id = 're_remediation_partial') <> 1
     or (select count(*) from public.stripe_financial_v2_webhook_events
         where event_id = 'evt_remediation_refund_partial') <> 1 then
    raise exception 'Refund webhook idempotency failed';
  end if;
end
$$;

-- A rejected commercial cancellation is routed atomically into a real service
-- dispute record; it cannot stop at a status label without an adjudication case.
select public.request_client_cancellation_v2(
  '74000000-0000-0000-0000-000000000605',
  '74000000-0000-0000-0000-000000000010',
  'Client requests a commercial cancellation.',
  'remediation-v2-test:cancellation-rejected'
);
select public.provider_respond_cancellation_v2(
  (select id from public.cancellation_cases_v2
   where payment_id = '74000000-0000-0000-0000-000000000605'),
  '74000000-0000-0000-0000-000000000020', 'reject',
  0, 0, 0, 'Provider contests the proposed full refund.',
  'remediation-v2-test:cancellation-rejected:response'
);
do $$
begin
  if not exists (
    select 1 from public.service_disputes_v2 dispute
    join public.cancellation_cases_v2 cancellation
      on cancellation.id = dispute.cancellation_id
    join public.workflow_instances workflow
      on workflow.id = cancellation.workflow_instance_id
    where cancellation.payment_id = '74000000-0000-0000-0000-000000000605'
      and workflow.current_state = 'routed_to_dispute'
      and dispute.issue_code = 'cancellation_disagreement'
  ) then
    raise exception 'Rejected cancellation was not atomically routed to a service dispute';
  end if;
end
$$;

-- Service dispute: an MFA-authenticated administrator records an immutable
-- full-refund decision. The withholding invariant cannot reduce the refund a
-- second time because provider award is zero.
select public.open_service_dispute_v2(
  '74000000-0000-0000-0000-000000000603', 'client',
  '74000000-0000-0000-0000-000000000010', 'provider_no_show',
  'Provider did not attend.', 'remediation-v2-test:service-dispute'
);
select public.add_service_dispute_evidence_v2(
  (select id from public.service_disputes_v2
   where payment_id = '74000000-0000-0000-0000-000000000603'),
  'client', '74000000-0000-0000-0000-000000000010',
  'Timestamped test statement.', '[]'::jsonb,
  'remediation-v2-test:service-dispute:evidence'
);
select * from public.decide_service_dispute_v2(
  (select id from public.service_disputes_v2
   where payment_id = '74000000-0000-0000-0000-000000000603'),
  '75000000-0000-0000-0000-000000000001', 0, 0, 0,
  'Evidence supports a full customer refund.',
  jsonb_build_object('evidence_ids', jsonb_build_array(
    (select id from public.service_dispute_evidence_v2 limit 1))),
  clock_timestamp(), 'financial_admin_mfa_v1', null,
  'remediation-v2-test:service-dispute:decision'
);

do $$
begin
  if (select client_refund_amount_cents from public.financial_resolutions_v2
      where payment_id = '74000000-0000-0000-0000-000000000603') <> 7700
     or not exists (select 1 from public.service_dispute_decisions_v2
       where administrator_id = '75000000-0000-0000-0000-000000000001') then
    raise exception 'Service-dispute decision or full-refund allocation failed';
  end if;
  begin
    perform public.decide_service_dispute_v2(
      (select id from public.service_disputes_v2
       where payment_id = '74000000-0000-0000-0000-000000000603'),
      '75000000-0000-0000-0000-000000000001', 0, 0, 0,
      'Old MFA must fail.', '{}'::jsonb, clock_timestamp() - interval '10 minutes',
      'financial_admin_mfa_v1', null, 'remediation-v2-test:old-mfa'
    );
    raise exception 'Stale administrator MFA was accepted';
  exception when insufficient_privilege then null;
  end;
end
$$;

-- Two concurrent deliveries for the same chargeback serialize on the payment
-- and can create only one banking dispute and one reversal reservation.
select extensions.dblink_connect_u('remediation_dispute_1', current_setting('app.test_database_url'));
select extensions.dblink_connect_u('remediation_dispute_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('remediation_dispute_1', $$
  with configured as materialized (
    select set_config('request.jwt.claim.role', 'service_role', false)
  ) select payment_dispute_id from configured cross join lateral
    public.process_payment_dispute_v2_event(
      'evt_remediation_dispute_created', 'charge.dispute.created', now(),
      'dp_remediation_test', 'ch_release_client', 'needs_response', 'fraudulent',
      9900, 1500, 'eur', '{"risk_level":"elevated"}'::jsonb, '{}'::jsonb
    )
$$);
select pg_sleep(0.1);
select extensions.dblink_send_query('remediation_dispute_2', $$
  with configured as materialized (
    select set_config('request.jwt.claim.role', 'service_role', false)
  ) select payment_dispute_id from configured cross join lateral
    public.process_payment_dispute_v2_event(
      'evt_remediation_dispute_concurrent', 'charge.dispute.updated', now(),
      'dp_remediation_test', 'ch_release_client', 'needs_response', 'fraudulent',
      9900, 1500, 'eur', '{"risk_level":"elevated"}'::jsonb, '{}'::jsonb
    )
$$);
select * from extensions.dblink_get_result('remediation_dispute_1') as result(payment_dispute_id uuid);
select * from extensions.dblink_get_result('remediation_dispute_2') as result(payment_dispute_id uuid);
select extensions.dblink_disconnect('remediation_dispute_1');
select extensions.dblink_disconnect('remediation_dispute_2');

do $$
begin
  if (select count(*) from public.payment_disputes_v2
      where stripe_dispute_id = 'dp_remediation_test') <> 1
     or (select count(*) from public.transfer_reversals_v2
         where payment_dispute_id = (select id from public.payment_disputes_v2
           where stripe_dispute_id = 'dp_remediation_test')) <> 1 then
    raise exception 'Concurrent chargeback deliveries created duplicate recovery state';
  end if;
end
$$;

-- Chargeback after a completed transfer: provisional recovery is capped at
-- the related transferred provider share and a partial recovery creates an
-- audited deficit with no future-earnings offset.
select public.mark_transfer_reversal_submitted_v2(
  (select id from public.transfer_reversals_v2
   where payment_dispute_id = (select id from public.payment_disputes_v2
     where stripe_dispute_id = 'dp_remediation_test'))
);
select public.complete_transfer_reversal_v2(
  (select id from public.transfer_reversals_v2
   where payment_dispute_id = (select id from public.payment_disputes_v2
     where stripe_dispute_id = 'dp_remediation_test')),
  'trr_remediation_partial', 4000
);

do $$
begin
  if (select provisional_recovery_target_amount_cents from public.payment_disputes_v2
      where stripe_dispute_id = 'dp_remediation_test') <> 9000
     or (select provisional_recovered_amount_cents from public.payment_disputes_v2
         where stripe_dispute_id = 'dp_remediation_test') <> 4000
     or (select recovery_deficit_amount_cents from public.payment_disputes_v2
         where stripe_dispute_id = 'dp_remediation_test') <> 5000
     or not exists (select 1 from public.financial_recovery_deficits_v2
       where amount_cents = 5000 and future_earnings_offset_enabled = false)
     or (select stripe_dispute_fee_amount_cents from public.payment_disputes_v2
         where stripe_dispute_id = 'dp_remediation_test') <> 1500 then
    raise exception 'Chargeback provisional recovery or deficit accounting failed';
  end if;
end
$$;

-- Duplicate delivery cannot create a second banking dispute or reversal.
select * from public.process_payment_dispute_v2_event(
  'evt_remediation_dispute_created', 'charge.dispute.created', now(),
  'dp_remediation_test', 'ch_release_client', 'needs_response', 'fraudulent',
  9900, 1500, 'eur', '{}'::jsonb, '{}'::jsonb
);
do $$
begin
  if (select count(*) from public.payment_disputes_v2
      where stripe_dispute_id = 'dp_remediation_test') <> 1
     or (select count(*) from public.transfer_reversals_v2
         where payment_dispute_id = (select id from public.payment_disputes_v2
           where stripe_dispute_id = 'dp_remediation_test')) <> 1 then
    raise exception 'Chargeback webhook idempotency failed';
  end if;
end
$$;

-- A Stripe victory returns only the amount provisionally recovered. The
-- provider retransfer is capability-checked and separately auditable.
select * from public.process_payment_dispute_v2_event(
  'evt_remediation_dispute_won', 'charge.dispute.closed', now(),
  'dp_remediation_test', 'ch_release_client', 'won', 'fraudulent',
  9900, 1500, 'eur', '{}'::jsonb, '{}'::jsonb
);
select * from public.reserve_provider_retransfer_v2(
  (select id from public.transfer_reversals_v2
   where payment_dispute_id = (select id from public.payment_disputes_v2
     where stripe_dispute_id = 'dp_remediation_test')),
  (select revision from public.provider_connect_accounts
   where provider_id = '74000000-0000-0000-0000-000000000020')
);
select public.complete_provider_retransfer_v2(
  (select id from public.transfer_reversals_v2
   where payment_dispute_id = (select id from public.payment_disputes_v2
     where stripe_dispute_id = 'dp_remediation_test')),
  'tr_remediation_provider_return'
);
do $$
begin
  if (select provider_retransferred_amount_cents from public.payment_disputes_v2
      where stripe_dispute_id = 'dp_remediation_test') <> 4000
     or (select current_state from public.workflow_instances
         where id = (select workflow_instance_id from public.payment_disputes_v2
           where stripe_dispute_id = 'dp_remediation_test')) <> 'resolved' then
    raise exception 'Won chargeback did not return provisional recovery exactly once';
  end if;
end
$$;

-- A lost chargeback without a completed provider transfer assigns no implicit
-- provider liability and stays in administrative review.
select * from public.process_payment_dispute_v2_event(
  'evt_remediation_dispute_no_transfer', 'charge.dispute.created', now(),
  'dp_remediation_no_transfer', 'ch_release_client_tax', 'needs_response',
  'fraudulent', 3123, 1500, 'eur', '{}'::jsonb, '{}'::jsonb
);
select * from public.process_payment_dispute_v2_event(
  'evt_remediation_dispute_lost', 'charge.dispute.closed', now(),
  'dp_remediation_no_transfer', 'ch_release_client_tax', 'lost',
  'fraudulent', 3123, 1500, 'eur', '{}'::jsonb, '{}'::jsonb
);
do $$
begin
  if (select definitive_provider_liability_amount_cents
      from public.payment_disputes_v2
      where stripe_dispute_id = 'dp_remediation_no_transfer') <> 0
     or (select current_state from public.workflow_instances
         where id = (select workflow_instance_id from public.payment_disputes_v2
           where stripe_dispute_id = 'dp_remediation_no_transfer'))
       <> 'liability_admin_review' then
    raise exception 'Lost chargeback inferred provider liability without policy';
  end if;
end
$$;

select 'financial remediation v2 tests passed' as result;
