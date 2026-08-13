\set ON_ERROR_STOP on

begin;

do $$
begin
  if (select count(*) from public.workflow_machine_versions where version = 'v1') <> 15 then
    raise exception 'The frozen v1 workflow catalog must contain 15 independent machines';
  end if;

  if exists (
    with recursive reachable(machine_code, machine_version, state_code) as (
      select machine_code, version, initial_state
      from public.workflow_machine_versions
      where version = 'v1'
      union
      select transition.machine_code,
             transition.machine_version,
             transition.to_state
      from reachable
      join public.workflow_transitions transition
        on transition.machine_code = reachable.machine_code
       and transition.machine_version = reachable.machine_version
       and transition.from_state = reachable.state_code
    )
    select 1
    from public.workflow_states state
    left join reachable
      on reachable.machine_code = state.machine_code
     and reachable.machine_version = state.machine_version
     and reachable.state_code = state.state_code
    where state.machine_version = 'v1'
      and reachable.state_code is null
  ) then
    raise exception 'At least one frozen v1 state is unreachable from its initial state';
  end if;

  if (select subject_type from public.workflow_machine_versions
      where machine_code = 'conditional_selection' and version = 'v1')
       <> 'conditional_selection'
     or (select subject_type from public.workflow_machine_versions
         where machine_code = 'refund' and version = 'v1') <> 'refund'
     or (select subject_type from public.workflow_machine_versions
         where machine_code = 'cancellation' and version = 'v1')
          <> 'cancellation_case' then
    raise exception 'Repeatable operation machines are not scoped to operation identities';
  end if;

  if exists (
    select 1 from public.financial_flow_versions
    where version not in ('legacy_v1', 'marketplace_v2')
  ) or coalesce((select enabled from public.financial_feature_flags
                 where flag_code = 'checkout_v2'), false) then
    raise exception 'An unexpected financial flow is defined or Checkout v2 was activated';
  end if;

  if has_table_privilege('authenticated', 'public.workflow_instances', 'select')
     or has_table_privilege('authenticated', 'public.workflow_transition_events', 'select')
     or has_table_privilege('authenticated', 'public.financial_terms_snapshots', 'select')
     or has_table_privilege('authenticated', 'public.financial_allocation_snapshots', 'select')
     or has_table_privilege('anon', 'public.workflow_instances', 'select') then
    raise exception 'Browser roles can read server-only workflow or financial snapshots';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.create_workflow_instance(text,text,uuid,text,text,uuid,text,jsonb,text)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.transition_workflow_instance(uuid,bigint,text,text,uuid,text,jsonb,text)',
       'execute'
     )
     or has_sequence_privilege(
       'authenticated', 'public.workflow_transition_events_id_seq', 'usage'
     ) then
    raise exception 'Browser roles can mutate server-only workflow state';
  end if;

  if not exists (
    select 1
    from public.workflow_transitions
    where transition_code = 'execution_client_reports_problem_without_provider'
      and machine_code = 'service_execution'
      and from_state = 'completion_eligible'
      and to_state = 'problem_reported'
      and allowed_actor_types = array['client']::text[]
  ) then
    raise exception 'Client problem reporting without provider completion is missing';
  end if;

  if not exists (
    select 1
    from public.workflow_transitions
    where transition_code = 'cancellation_client_requests_full'
      and from_state = 'none'
      and to_state = 'client_full_refund_requested'
      and allowed_actor_types = array['client']::text[]
  )
  or not exists (
    select 1
    from public.workflow_transitions
    where transition_code = 'cancellation_provider_counteroffers_partial'
      and from_state = 'client_full_refund_requested'
      and to_state = 'provider_partial_allocation_proposed'
      and allowed_actor_types = array['provider']::text[]
  )
  or not exists (
    select 1
    from public.workflow_transitions
    where transition_code = 'cancellation_client_accepts_partial'
      and from_state = 'provider_partial_allocation_proposed'
      and to_state = 'mutually_agreed'
      and allowed_actor_types = array['client']::text[]
  )
  or not exists (
    select 1
    from public.workflow_transitions
    where transition_code = 'cancellation_partial_offer_timeout'
      and from_state = 'provider_partial_allocation_proposed'
      and to_state = 'routed_to_dispute'
      and allowed_actor_types = array['system']::text[]
  ) then
    raise exception 'The frozen launch cancellation negotiation is incomplete';
  end if;

  begin
    update public.workflow_transitions
    set description = 'tampered'
    where transition_code = 'cancellation_client_requests_full';
    raise exception 'A frozen workflow definition was mutable';
  exception when sqlstate '55000' then null;
  end;
end
$$;

insert into public.financial_flow_versions (
  version,
  charge_pattern,
  platform_fee_rate_bps,
  rounding_mode,
  release_delay_seconds,
  notes
) values (
  'state_models_test_v2',
  'separate_charges_and_transfers',
  1000,
  'half_up',
  172800,
  'Transaction-scoped state model test definition.'
);

insert into auth.users (id, email, raw_user_meta_data) values
  (
    '71000000-0000-0000-0000-000000000010',
    'state-model-client@example.test',
    '{"requested_role":"client"}'::jsonb
  ),
  (
    '71000000-0000-0000-0000-000000000020',
    'state-model-provider@example.test',
    '{"requested_role":"pro"}'::jsonb
  );

insert into public.bookings (
  id, client_id, pro_id, service, date, time_slot, address, notes, status
) values (
  '71000000-0000-0000-0000-000000000100',
  '71000000-0000-0000-0000-000000000010',
  '71000000-0000-0000-0000-000000000020',
  'Financial state model test',
  current_date + 7,
  '10:00',
  'Test address',
  'Immutable cents snapshot fixture',
  'pending'
);

insert into public.missions (
  id, client_id, pro_id, service, date, price, status, booking_id
) values (
  '71000000-0000-0000-0000-000000000200',
  '71000000-0000-0000-0000-000000000010',
  '71000000-0000-0000-0000-000000000020',
  'Financial state model proposal',
  current_date + 7,
  99,
  'proposed',
  '71000000-0000-0000-0000-000000000100'
);

insert into public.financial_terms_snapshots (
  id,
  financial_flow_version,
  request_id,
  proposal_id,
  proposal_version,
  currency,
  service_amount_cents,
  travel_amount_cents,
  provider_initial_gross_amount_cents,
  platform_fee_rate_bps,
  platform_fee_initial_amount_cents,
  client_tax_initial_amount_cents,
  client_total_amount_cents,
  provider_initial_statutory_withholding_cents,
  provider_initial_transfer_amount_cents,
  scheduled_start_at,
  scheduled_end_at,
  jurisdiction_code,
  contract_version,
  eligibility_policy_version,
  cancellation_policy_version,
  created_by_actor_type,
  deduplication_key
) values (
  '71000000-0000-0000-0000-000000000300',
  'state_models_test_v2',
  '71000000-0000-0000-0000-000000000100',
  '71000000-0000-0000-0000-000000000200',
  1,
  'eur',
  8000,
  1000,
  9000,
  1000,
  900,
  0,
  9900,
  500,
  8500,
  '2026-09-01 10:00:00+00',
  null,
  'BE',
  'terms-v1',
  'be-eligibility-test-v1',
  null,
  'system',
  'test:terms:state-models:1'
);

do $$
begin
  if (
    select completion_not_before_at <> scheduled_start_at
    from public.financial_terms_snapshots
    where id = '71000000-0000-0000-0000-000000000300'
  ) then
    raise exception 'Missing scheduled end did not fall back to scheduled start';
  end if;

  if (select financial_flow_version from public.missions
      where id = '71000000-0000-0000-0000-000000000200') <> 'legacy_v1' then
    raise exception 'The existing mission behavior no longer defaults to legacy_v1';
  end if;

  begin
    update public.financial_terms_snapshots
    set service_amount_cents = 7999
    where id = '71000000-0000-0000-0000-000000000300';
    raise exception 'A contractual terms snapshot was mutable';
  exception when sqlstate '55000' then null;
  end;
end
$$;

insert into public.financial_allocation_snapshots (
  id,
  terms_snapshot_id,
  revision,
  allocation_reason,
  currency,
  provider_awarded_gross_amount_cents,
  platform_fee_final_amount_cents,
  client_refund_amount_cents,
  client_tax_allocated_amount_cents,
  provider_statutory_withholding_amount_cents,
  provider_transfer_amount_cents,
  created_by_actor_type,
  decision_reason,
  deduplication_key
) values (
  '71000000-0000-0000-0000-000000000400',
  '71000000-0000-0000-0000-000000000300',
  1,
  'partial_service_award',
  'eur',
  4500,
  450,
  4950,
  0,
  500,
  4000,
  'system',
  'Half of provider gross awarded; withholding remains within that gross.',
  'test:allocation:state-models:1'
);

do $$
begin
  if (
    select provider_transfer_amount_cents
             + provider_statutory_withholding_amount_cents
             <> provider_awarded_gross_amount_cents
    from public.financial_allocation_snapshots
    where id = '71000000-0000-0000-0000-000000000400'
  ) then
    raise exception 'Provider withholding is not contained in awarded gross';
  end if;

  begin
    insert into public.financial_allocation_snapshots (
      terms_snapshot_id, previous_snapshot_id, revision, allocation_reason,
      currency, provider_awarded_gross_amount_cents,
      platform_fee_final_amount_cents, client_refund_amount_cents,
      provider_statutory_withholding_amount_cents,
      provider_transfer_amount_cents, created_by_actor_type, decision_reason,
      deduplication_key
    ) values (
      '71000000-0000-0000-0000-000000000300',
      '71000000-0000-0000-0000-000000000400', 2,
      'invalid_double_withholding', 'eur', 4500, 450, 5450, 500, 4000,
      'system', 'Must fail because withholding cannot reduce refund twice.',
      'test:allocation:invalid-double-withholding'
    );
    raise exception 'Provider withholding reduced the customer refund a second time';
  exception when check_violation then null;
  end;

  begin
    insert into public.financial_allocation_snapshots (
      terms_snapshot_id, previous_snapshot_id, revision, allocation_reason,
      currency, provider_awarded_gross_amount_cents,
      platform_fee_final_amount_cents, client_refund_amount_cents,
      provider_statutory_withholding_amount_cents,
      provider_transfer_amount_cents, created_by_actor_type, decision_reason,
      deduplication_key
    ) values (
      '71000000-0000-0000-0000-000000000300',
      '71000000-0000-0000-0000-000000000400', 2,
      'invalid_fee', 'eur', 4500, 449, 4951, 500, 4000,
      'system', 'Must fail because the platform fee must be recomputed.',
      'test:allocation:invalid-fee'
    );
    raise exception 'An incorrectly rounded platform fee was accepted';
  exception when check_violation then null;
  end;

  begin
    delete from public.financial_allocation_snapshots
    where id = '71000000-0000-0000-0000-000000000400';
    raise exception 'An allocation snapshot was deletable';
  exception when sqlstate '55000' then null;
  end;
end
$$;

select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  v_instance_id uuid;
  v_retry_id uuid;
begin
  select (public.create_workflow_instance(
    'service_execution',
    'v1',
    '71000000-0000-0000-0000-000000000200',
    'state_models_test_v2',
    'system',
    null,
    'Initialize execution state.',
    '{"source":"sql_test"}'::jsonb,
    'test:workflow:create:execution:1'
  )).id into v_instance_id;

  perform public.transition_workflow_instance(
    v_instance_id,
    1,
    'execution_reach_completion_threshold',
    'system',
    null,
    'The completion threshold has passed.',
    '{"clock":"server"}'::jsonb,
    'test:workflow:execution:eligible:1'
  );

  perform public.transition_workflow_instance(
    v_instance_id,
    2,
    'execution_client_reports_problem_without_provider',
    'client',
    '71000000-0000-0000-0000-000000000010',
    'Provider did not attend.',
    '{"category":"provider_no_show"}'::jsonb,
    'test:workflow:execution:problem:1'
  );

  select (public.transition_workflow_instance(
    v_instance_id,
    2,
    'execution_client_reports_problem_without_provider',
    'client',
    '71000000-0000-0000-0000-000000000010',
    'Provider did not attend.',
    '{"category":"provider_no_show"}'::jsonb,
    'test:workflow:execution:problem:1'
  )).id into v_retry_id;

  if v_retry_id <> v_instance_id
     or (select current_state from public.workflow_instances where id = v_instance_id)
          <> 'problem_reported'
     or (select revision from public.workflow_instances where id = v_instance_id) <> 3
     or (select count(*) from public.workflow_transition_events where instance_id = v_instance_id) <> 3 then
    raise exception 'Workflow transition retry was not idempotent';
  end if;

  begin
    perform public.transition_workflow_instance(
      v_instance_id,
      3,
      'execution_conclude_problem',
      'client',
      '71000000-0000-0000-0000-000000000010',
      'A client cannot adjudicate the problem.',
      '{}'::jsonb,
      'test:workflow:execution:invalid-actor'
    );
    raise exception 'A client performed an administrative transition';
  exception when check_violation then null;
  end;

  begin
    update public.workflow_instances
    set current_state = 'concluded', revision = revision + 1
    where id = v_instance_id;
    raise exception 'A workflow instance bypassed the transition function';
  exception when sqlstate '55000' then null;
  end;
end
$$;

rollback;
