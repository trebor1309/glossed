\set ON_ERROR_STOP on

select set_config('app.test_database_url', :'TEST_DATABASE_URL', false);

insert into auth.users (id,email,raw_user_meta_data) values
  ('85000000-0000-0000-0000-000000000001','admin-incidents@example.test','{}'),
  ('85000000-0000-0000-0000-000000000002','incident-outsider@example.test','{}')
on conflict (id) do nothing;
insert into public.admin_accounts(user_id,display_name) values
  ('85000000-0000-0000-0000-000000000001','Incident super admin')
on conflict (user_id) do nothing;
insert into public.admin_account_roles(user_id,role_code) values
  ('85000000-0000-0000-0000-000000000001','super_admin')
on conflict do nothing;

insert into public.financial_runtime_controls(
  control_code,currency,state,source,reason,updated_by
) values (
  'test_incident_reactivation','usd','blocked','manual',
  'Local-only critical control used to test safe incident reactivation.',
  '85000000-0000-0000-0000-000000000001'
) on conflict (control_code,currency) do update set
  state='blocked',source='manual',reason=excluded.reason,updated_by=excluded.updated_by;

do $$ begin
  if has_table_privilege('authenticated','public.admin_incident_reconciliation_snapshots_v2','select')
     or has_table_privilege('authenticated','public.jurisdiction_policy_versions_v2','select')
     or has_function_privilege('authenticated',
       'public.consume_admin_financial_control_reactivation_v2(uuid,uuid,text,timestamptz,uuid)',
       'execute') then
    raise exception 'Browser roles can access server-only incident or policy state';
  end if;
end $$;

-- An ordinary AAL2 user cannot reach any of the three administrative sections.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','85000000-0000-0000-0000-000000000002','role','authenticated','aal','aal2',
  'amr',jsonb_build_array(jsonb_build_object('method','totp',
    'timestamp',extract(epoch from clock_timestamp())::bigint)))::text,true);
do $$ begin
  begin perform public.admin_list_financial_incidents('open',50,0);
    raise exception 'Ordinary user read incidents'; exception when insufficient_privilege then null; end;
  begin perform public.admin_search_audit(null,'all',50,0);
    raise exception 'Ordinary user searched audit'; exception when insufficient_privilege then null; end;
  begin perform public.admin_get_configuration_catalog();
    raise exception 'Ordinary user read configuration'; exception when insufficient_privilege then null; end;
end $$;
rollback;

-- A super administrator can inspect the normalized incident, run a server
-- reconciliation, and prepare one immutable reactivation preview.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','85000000-0000-0000-0000-000000000001','role','authenticated','aal','aal2',
  'session_id','admin-incidents-test','amr',jsonb_build_array(jsonb_build_object(
    'method','totp','timestamp',extract(epoch from clock_timestamp())::bigint)))::text,true);
do $$
declare v_control uuid; v_key text; v_queue jsonb; v_detail jsonb;
  v_reconciliation jsonb; v_preview jsonb; v_flags_before jsonb;
begin
  v_queue:=public.admin_list_financial_incidents('open',100,0);
  select (item->>'control_id')::uuid,item->>'incident_key' into v_control,v_key
    from jsonb_array_elements(v_queue->'items') item
    where item->>'incident_type'='runtime_control_blocked'
      and item->>'currency'='usd' limit 1;
  if v_control is null then
    raise exception 'Blocked financial control was omitted from incident queue';
  end if;
  v_detail:=public.admin_get_financial_incident_detail(v_key);
  if v_detail#>>'{incident,control_id}'<>v_control::text
     or v_detail->'ledger_batches' is null or v_detail->'policy_versions' is null then
    raise exception 'Incident detail omitted control, ledger, or policy context';
  end if;
  v_reconciliation:=public.admin_reconcile_financial_incident_v2(
    v_key,'admin-incident-test-reconcile');
  if v_reconciliation->>'reconciliation_status'<>'matched'
     or not (v_reconciliation->>'ledger_balanced')::boolean
     or not (v_reconciliation->>'source_resolved')::boolean then
    raise exception 'Conclusive server reconciliation was not recorded';
  end if;
  if (public.admin_reconcile_financial_incident_v2(
        v_key,'admin-incident-test-reconcile')->>'id')::uuid
      <> (v_reconciliation->>'id')::uuid then
    raise exception 'Incident reconciliation retry was not idempotent';
  end if;
  v_preview:=public.admin_preview_financial_control_reactivation_v2(
    v_control,(v_reconciliation->>'id')::uuid);
  if v_preview->>'previous_state'<>'blocked' or v_preview->>'target_state'<>'normal' then
    raise exception 'Reactivation preview did not preserve the state transition';
  end if;
  perform set_config('app.admin_incident_preview_id',v_preview->>'id',false);
  perform set_config('app.admin_incident_control_id',v_control::text,false);
  perform set_config('app.admin_incident_reconciliation_id',v_reconciliation->>'id',false);
  v_flags_before:=public.admin_get_configuration_catalog()->'feature_flags';

  perform public.admin_create_configuration_version('liquidity_limit',
    'admin_test_liquidity_v1',jsonb_build_object('currency','eur',
      'metric_code','checkout_liquidity_exposure','comparison_operator','above',
      'warning_threshold_cents',10000,'blocking_threshold_cents',20000,
      'notes','Local test thresholds only; never activated in Production.'),
    'Create a local immutable threshold version for automated tests.');
  perform public.admin_create_configuration_version('checkout_policy',
    'admin_test_checkout_v1',jsonb_build_object('currency','eur',
      'payment_window_open_before_start_seconds',86400,'payment_deadline_seconds',3600,
      'checkout_ttl_seconds',1800,'checkout_expiry_margin_before_start_seconds',1800,
      'liquidity_limit_version','admin_test_liquidity_v1',
      'stripe_payment_method_configuration_reference','pmc_admin_test',
      'notes','Local test Checkout policy; feature flag remains disabled.'),
    'Create a local immutable Checkout policy version for automated tests.');
  perform public.admin_create_configuration_version('payout_policy',
    'admin_test_payout_v1',jsonb_build_object('currency','eur',
      'schedule_timezone','Europe/Brussels','standard_payout_isodays',jsonb_build_array(1,4),
      'standard_payout_local_time','09:00:00','minimum_payout_amount_cents',0,
      'instant_quote_ttl_seconds',300,'stripe_instant_cost_rate_bps',100,
      'effective_from','2030-01-01T00:00:00Z',
      'notes','Local future payout policy version for automated tests only.'),
    'Create a local immutable payout calendar version for automated tests.');
  perform public.admin_create_configuration_version('jurisdiction_policy_structure',
    'admin_test_be_structure_v1',jsonb_build_object('jurisdiction_code','BE',
      'policy_type','eligibility','lifecycle_state','draft',
      'notes','Empty Belgian eligibility structure awaiting validated legal rules.'),
    'Create an empty draft structure without inventing Belgian legal rules.');
  if (public.admin_get_configuration_catalog()->'jurisdiction_policies'->0->>'lifecycle_state')
      is distinct from 'draft'
     or public.admin_get_configuration_catalog()->'feature_flags' is distinct from v_flags_before then
    raise exception 'Configuration creation activated a flag or a national policy';
  end if;
end $$;
commit;

-- Stale MFA blocks both configuration writes and reactivation previews.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','85000000-0000-0000-0000-000000000001','role','authenticated','aal','aal2',
  'amr',jsonb_build_array(jsonb_build_object('method','totp',
    'timestamp',extract(epoch from clock_timestamp()-interval '10 minutes')::bigint)))::text,true);
do $$ begin
  begin perform public.admin_create_configuration_version('liquidity_limit','stale_test_v1',
    '{"currency":"eur"}'::jsonb,'This stale MFA attempt must be rejected by the server.');
    raise exception 'Stale MFA created configuration'; exception when insufficient_privilege then null; end;
  begin perform public.admin_preview_financial_control_reactivation_v2(
    current_setting('app.admin_incident_control_id')::uuid,
    current_setting('app.admin_incident_reconciliation_id')::uuid);
    raise exception 'Stale MFA created reactivation preview'; exception when insufficient_privilege then null; end;
end $$;
rollback;

-- Concurrent retries with the same operation identity consume the preview
-- once and produce one control transition plus one immutable audit record.
select extensions.dblink_connect_u('admin_incident_1',current_setting('app.test_database_url'));
select extensions.dblink_connect_u('admin_incident_2',current_setting('app.test_database_url'));
select extensions.dblink_send_query('admin_incident_1',$q$
  with configured as materialized(select set_config('request.jwt.claim.role','service_role',false))
  select public.consume_admin_financial_control_reactivation_v2(
    (select id from public.admin_financial_control_reactivation_previews_v2
      where admin_id='85000000-0000-0000-0000-000000000001'
        and consumed_at is null order by created_at desc limit 1),
    '85000000-0000-0000-0000-000000000001',
    'Rapprochement concluant confirmé avant remise en service locale.',clock_timestamp(),
    '85000000-0000-0000-0000-000000000099') from configured
$q$);
select pg_sleep(0.1);
select extensions.dblink_send_query('admin_incident_2',$q$
  with configured as materialized(select set_config('request.jwt.claim.role','service_role',false))
  select public.consume_admin_financial_control_reactivation_v2(
    (select id from public.admin_financial_control_reactivation_previews_v2
      where admin_id='85000000-0000-0000-0000-000000000001'
      order by created_at desc limit 1),
    '85000000-0000-0000-0000-000000000001',
    'Rapprochement concluant confirmé avant remise en service locale.',clock_timestamp(),
    '85000000-0000-0000-0000-000000000099') from configured
$q$);
select * from extensions.dblink_get_result('admin_incident_1') as result(payload jsonb);
select * from extensions.dblink_get_result('admin_incident_2') as result(payload jsonb);
select extensions.dblink_disconnect('admin_incident_1');
select extensions.dblink_disconnect('admin_incident_2');

do $$ begin
  if (select state from public.financial_runtime_controls
      where control_code='test_incident_reactivation')<>'normal'
     or (select count(*) from public.admin_audit_log where
       deduplication_key='admin-control-reactivate:85000000-0000-0000-0000-000000000099')<>1
     or (select count(*) from public.financial_audit_log where
       deduplication_key='financial-control-reactivate:85000000-0000-0000-0000-000000000099')<>1 then
    raise exception 'Concurrent control reactivation duplicated state or audit';
  end if;
end $$;

-- The global audit projection exposes the reactivation and applied versions.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','85000000-0000-0000-0000-000000000001','role','authenticated','aal','aal2',
  'amr',jsonb_build_array(jsonb_build_object('method','totp',
    'timestamp',extract(epoch from clock_timestamp())::bigint)))::text,true);
do $$ begin
  if (public.admin_search_audit('financial_control.reactivated','all',100,0)->>'total')::integer<1
     or (public.admin_get_configuration_catalog()->'checkout_policies') is null then
    raise exception 'Audit search or configuration applied-version catalog is incomplete';
  end if;
end $$;
rollback;

select 'admin incidents audit and configuration tests passed' as result;
