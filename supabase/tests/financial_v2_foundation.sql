\set ON_ERROR_STOP on

begin;

do $$
begin
  if (select version from public.financial_flow_versions where version = 'legacy_v1') is distinct from 'legacy_v1' then
    raise exception 'The legacy financial flow definition is missing';
  end if;

  if has_table_privilege('authenticated', 'public.financial_flow_versions', 'select')
     or has_table_privilege('authenticated', 'public.financial_runtime_controls', 'select')
     or has_table_privilege('authenticated', 'public.financial_ledger_accounts', 'select')
     or has_table_privilege('authenticated', 'public.financial_ledger_batches', 'select')
     or has_table_privilege('authenticated', 'public.financial_ledger_entries', 'select')
     or has_table_privilege('authenticated', 'public.financial_audit_log', 'select') then
    raise exception 'Authenticated browser sessions can read server-only financial tables';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.post_financial_ledger_batch(uuid)',
    'execute'
  ) then
    raise exception 'Authenticated browser sessions can post ledger batches';
  end if;
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
  'test_v2',
  'separate_charges_and_transfers',
  1000,
  'half_up',
  172800,
  'Transaction-scoped test definition.'
);

do $$
begin
  begin
    update public.financial_flow_versions
    set platform_fee_rate_bps = 900
    where version = 'test_v2';
    raise exception 'A financial flow definition was mutable';
  exception when sqlstate '55000' then null;
  end;

  begin
    delete from public.financial_flow_versions where version = 'test_v2';
    raise exception 'A financial flow definition was deletable';
  exception when sqlstate '55000' then null;
  end;
end
$$;

insert into public.financial_limit_versions (
  version,
  metric_code,
  currency,
  comparison_operator,
  warning_threshold_cents,
  blocking_threshold_cents,
  notes
) values (
  'test_limits_v1',
  'available_liquidity',
  'eur',
  'below',
  100000,
  50000,
  'Test-only thresholds.'
);

do $$
begin
  begin
    insert into public.financial_limit_versions (
      version,
      metric_code,
      currency,
      comparison_operator,
      warning_threshold_cents,
      blocking_threshold_cents
    ) values (
      'test_invalid_limits',
      'available_liquidity',
      'eur',
      'below',
      50000,
      100000
    );
    raise exception 'An inverted liquidity threshold was accepted';
  exception when check_violation then null;
  end;
end
$$;

insert into public.financial_runtime_controls (
  control_code,
  currency,
  state,
  source,
  reason
) values (
  'test_new_checkout_creation',
  'eur',
  'normal',
  'manual',
  'Test baseline.'
);

update public.financial_runtime_controls
set state = 'warning', source = 'automatic', reason = 'Test threshold reached.'
where control_code = 'test_new_checkout_creation' and currency = 'eur';

do $$
declare
  v_control_id uuid;
begin
  select id into v_control_id
  from public.financial_runtime_controls
  where control_code = 'test_new_checkout_creation' and currency = 'eur';

  if (select revision from public.financial_runtime_controls where id = v_control_id) <> 2 then
    raise exception 'Runtime control revision was not incremented';
  end if;
  if (select count(*) from public.financial_runtime_control_events where control_id = v_control_id) <> 2 then
    raise exception 'Runtime control changes were not audited';
  end if;
  if (select max(revision) from public.financial_runtime_control_events where control_id = v_control_id) <> 2 then
    raise exception 'Runtime control audit revision is incorrect';
  end if;

  begin
    update public.financial_runtime_control_events
    set reason = 'Tampered'
    where control_id = v_control_id;
    raise exception 'A runtime control audit event was mutable';
  exception when sqlstate '55000' then null;
  end;
end
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  (
    '70000000-0000-0000-0000-000000000010',
    'financial-client@example.test',
    '{"requested_role":"client"}'::jsonb
  ),
  (
    '70000000-0000-0000-0000-000000000020',
    'financial-provider@example.test',
    '{"requested_role":"pro"}'::jsonb
  );

insert into public.missions (
  id,
  client_id,
  pro_id,
  service,
  date,
  price,
  status
) values (
  '70000000-0000-0000-0000-000000000100',
  '70000000-0000-0000-0000-000000000010',
  '70000000-0000-0000-0000-000000000020',
  'Financial foundation test',
  now(),
  100,
  'proposed'
);

do $$
begin
  if (select financial_flow_version from public.missions
      where id = '70000000-0000-0000-0000-000000000100') <> 'legacy_v1' then
    raise exception 'Existing mission creation no longer defaults to the legacy flow';
  end if;

  begin
    update public.missions
    set financial_flow_version = 'test_v2'
    where id = '70000000-0000-0000-0000-000000000100';
    raise exception 'A mission changed financial flow version after creation';
  exception when sqlstate '55000' then null;
  end;

  begin
    insert into public.payments (
      id,
      mission_id,
      client_id,
      pro_id,
      amount_total_cents,
      status,
      financial_flow_version
    ) values (
      '70000000-0000-0000-0000-000000000200',
      '70000000-0000-0000-0000-000000000100',
      '70000000-0000-0000-0000-000000000010',
      '70000000-0000-0000-0000-000000000020',
      11000,
      'pending',
      'test_v2'
    );
    raise exception 'A payment used a different financial flow version from its mission';
  exception when foreign_key_violation then null;
  end;
end
$$;

insert into public.financial_ledger_accounts (
  id,
  account_code,
  account_class,
  owner_type,
  owner_user_id,
  currency
) values
  (
    '70000000-0000-0000-0000-000000000301',
    'platform_stripe_balance',
    'asset',
    'platform',
    null,
    'eur'
  ),
  (
    '70000000-0000-0000-0000-000000000302',
    'provider_payable',
    'liability',
    'provider',
    '70000000-0000-0000-0000-000000000020',
    'eur'
  ),
  (
    '70000000-0000-0000-0000-000000000303',
    'platform_stripe_balance',
    'asset',
    'platform',
    null,
    'usd'
  );

do $$
begin
  begin
    update public.financial_ledger_accounts
    set currency = 'usd'
    where id = '70000000-0000-0000-0000-000000000301';
    raise exception 'A ledger account identity was mutable';
  exception when sqlstate '55000' then null;
  end;
end
$$;

insert into public.financial_ledger_batches (
  id,
  financial_flow_version,
  operation_type,
  operation_key,
  currency,
  actor_type,
  reason
) values (
  '70000000-0000-0000-0000-000000000401',
  'test_v2',
  'test_payment_received',
  'test:payment:received:1',
  'eur',
  'system',
  'Balanced posting test.'
);

insert into public.financial_ledger_entries (
  batch_id,
  line_number,
  account_id,
  direction,
  amount_cents
) values
  (
    '70000000-0000-0000-0000-000000000401',
    1,
    '70000000-0000-0000-0000-000000000301',
    'debit',
    9000
  ),
  (
    '70000000-0000-0000-0000-000000000401',
    2,
    '70000000-0000-0000-0000-000000000302',
    'credit',
    9000
  );

select set_config('request.jwt.claim.role', 'service_role', true);
select public.post_financial_ledger_batch('70000000-0000-0000-0000-000000000401');
select public.post_financial_ledger_batch('70000000-0000-0000-0000-000000000401');

do $$
begin
  if (select status from public.financial_ledger_batches
      where id = '70000000-0000-0000-0000-000000000401') <> 'posted' then
    raise exception 'A balanced ledger batch was not posted';
  end if;

  begin
    insert into public.financial_ledger_entries (
      batch_id, line_number, account_id, direction, amount_cents
    ) values (
      '70000000-0000-0000-0000-000000000401',
      3,
      '70000000-0000-0000-0000-000000000301',
      'debit',
      1
    );
    raise exception 'An entry was appended to a posted batch';
  exception when sqlstate '55000' then null;
  end;

  begin
    update public.financial_ledger_entries
    set amount_cents = 1
    where batch_id = '70000000-0000-0000-0000-000000000401';
    raise exception 'A ledger entry was mutable';
  exception when sqlstate '55000' then null;
  end;

  begin
    update public.financial_ledger_batches
    set reason = 'Tampered'
    where id = '70000000-0000-0000-0000-000000000401';
    raise exception 'A posted ledger batch was mutable';
  exception when sqlstate '55000' then null;
  end;
end
$$;

insert into public.financial_ledger_batches (
  id,
  financial_flow_version,
  operation_type,
  operation_key,
  currency,
  reversal_of_batch_id,
  actor_type,
  reason
) values (
  '70000000-0000-0000-0000-000000000402',
  'test_v2',
  'test_payment_reversed',
  'test:payment:reversed:1',
  'eur',
  '70000000-0000-0000-0000-000000000401',
  'system',
  'First partial reversal test.'
);

insert into public.financial_ledger_entries (
  batch_id,
  line_number,
  account_id,
  direction,
  amount_cents
) values
  (
    '70000000-0000-0000-0000-000000000402',
    1,
    '70000000-0000-0000-0000-000000000302',
    'debit',
    4000
  ),
  (
    '70000000-0000-0000-0000-000000000402',
    2,
    '70000000-0000-0000-0000-000000000301',
    'credit',
    4000
  );

select public.post_financial_ledger_batch('70000000-0000-0000-0000-000000000402');

insert into public.financial_ledger_batches (
  id, financial_flow_version, operation_type, operation_key, currency,
  reversal_of_batch_id, actor_type, reason
) values (
  '70000000-0000-0000-0000-000000000405',
  'test_v2',
  'test_payment_reversed',
  'test:payment:reversed:2',
  'eur',
  '70000000-0000-0000-0000-000000000401',
  'system',
  'Second partial reversal test.'
);

insert into public.financial_ledger_entries (
  batch_id, line_number, account_id, direction, amount_cents
) values
  (
    '70000000-0000-0000-0000-000000000405', 1,
    '70000000-0000-0000-0000-000000000302', 'debit', 5000
  ),
  (
    '70000000-0000-0000-0000-000000000405', 2,
    '70000000-0000-0000-0000-000000000301', 'credit', 5000
  );

select public.post_financial_ledger_batch('70000000-0000-0000-0000-000000000405');

insert into public.financial_ledger_batches (
  id, financial_flow_version, operation_type, operation_key, currency,
  reversal_of_batch_id, actor_type, reason
) values (
  '70000000-0000-0000-0000-000000000406',
  'test_v2',
  'test_payment_reversed',
  'test:payment:reversed:overage',
  'eur',
  '70000000-0000-0000-0000-000000000401',
  'system',
  'Over-reversal rejection test.'
);

insert into public.financial_ledger_entries (
  batch_id, line_number, account_id, direction, amount_cents
) values
  (
    '70000000-0000-0000-0000-000000000406', 1,
    '70000000-0000-0000-0000-000000000302', 'debit', 1
  ),
  (
    '70000000-0000-0000-0000-000000000406', 2,
    '70000000-0000-0000-0000-000000000301', 'credit', 1
  );

do $$
begin
  begin
    perform public.post_financial_ledger_batch(
      '70000000-0000-0000-0000-000000000406'
    );
    raise exception 'Cumulative partial reversals exceeded the original batch';
  exception when check_violation then null;
  end;
end
$$;

insert into public.financial_ledger_batches (
  id,
  financial_flow_version,
  operation_type,
  operation_key,
  currency,
  actor_type
) values (
  '70000000-0000-0000-0000-000000000403',
  'test_v2',
  'test_unbalanced',
  'test:unbalanced:1',
  'eur',
  'system'
);

insert into public.financial_ledger_entries (
  batch_id,
  line_number,
  account_id,
  direction,
  amount_cents
) values
  (
    '70000000-0000-0000-0000-000000000403',
    1,
    '70000000-0000-0000-0000-000000000301',
    'debit',
    100
  ),
  (
    '70000000-0000-0000-0000-000000000403',
    2,
    '70000000-0000-0000-0000-000000000302',
    'credit',
    99
  );

do $$
begin
  begin
    perform public.post_financial_ledger_batch(
      '70000000-0000-0000-0000-000000000403'
    );
    raise exception 'An unbalanced ledger batch was posted';
  exception when check_violation then null;
  end;
end
$$;

insert into public.financial_ledger_batches (
  id,
  financial_flow_version,
  operation_type,
  operation_key,
  currency,
  actor_type
) values (
  '70000000-0000-0000-0000-000000000404',
  'test_v2',
  'test_currency_mismatch',
  'test:currency:mismatch:1',
  'eur',
  'system'
);

do $$
begin
  begin
    insert into public.financial_ledger_entries (
      batch_id, line_number, account_id, direction, amount_cents
    ) values (
      '70000000-0000-0000-0000-000000000404',
      1,
      '70000000-0000-0000-0000-000000000303',
      'debit',
      100
    );
    raise exception 'A cross-currency ledger entry was accepted';
  exception when check_violation then null;
  end;
end
$$;

insert into public.financial_audit_log (
  financial_flow_version,
  event_type,
  entity_type,
  entity_id,
  actor_type,
  reason,
  after_state,
  evidence,
  deduplication_key
) values (
  'test_v2',
  'test.payment.recorded',
  'payment',
  'test-payment-1',
  'system',
  'Audit immutability test.',
  '{"status":"recorded"}'::jsonb,
  '{"source":"test"}'::jsonb,
  'test:audit:payment:1'
);

do $$
begin
  begin
    update public.financial_audit_log
    set reason = 'Tampered'
    where deduplication_key = 'test:audit:payment:1';
    raise exception 'A financial audit event was mutable';
  exception when sqlstate '55000' then null;
  end;

  begin
    insert into public.financial_audit_log (
      financial_flow_version,
      event_type,
      entity_type,
      entity_id,
      actor_type,
      deduplication_key
    ) values (
      'test_v2',
      'test.payment.recorded',
      'payment',
      'test-payment-1',
      'system',
      'test:audit:payment:1'
    );
    raise exception 'A duplicate financial audit event was accepted';
  exception when unique_violation then null;
  end;
end
$$;

rollback;
