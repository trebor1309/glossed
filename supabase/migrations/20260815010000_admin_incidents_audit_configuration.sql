-- Admin incidents, global audit, and versioned configuration.
-- Additive only: no marketplace_v2 feature flag is enabled by this migration.

begin;

insert into public.admin_permission_definitions (
  permission_code, description, requires_recent_mfa
) values
  ('incidents.reconcile', 'Run a server-side financial incident reconciliation.', true),
  ('incidents.reactivate', 'Reactivate a blocked financial runtime control after reconciliation.', true),
  ('configuration.read', 'Read versioned financial and compliance configuration.', false)
on conflict (permission_code) do nothing;

insert into public.admin_role_permissions (role_code, permission_code) values
  ('finance', 'incidents.read'),
  ('finance', 'incidents.reconcile'),
  ('finance', 'incidents.reactivate'),
  ('finance', 'configuration.read'),
  ('super_admin', 'incidents.reconcile'),
  ('super_admin', 'incidents.reactivate'),
  ('super_admin', 'configuration.read')
on conflict do nothing;

create table public.jurisdiction_policy_versions_v2 (
  version text primary key,
  jurisdiction_code text not null,
  policy_type text not null check (policy_type in (
    'eligibility', 'cancellation', 'consumer_rights', 'reporting', 'compliance'
  )),
  lifecycle_state text not null default 'draft' check (lifecycle_state in (
    'draft', 'legal_review', 'approved', 'retired'
  )),
  schema_version text not null default 'jurisdiction_policy_structure_v1',
  legal_review_reference text,
  effective_from timestamptz,
  effective_until timestamptz,
  notes text not null check (length(trim(notes)) between 10 and 4000),
  created_by uuid not null references public.admin_accounts(user_id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  constraint jurisdiction_policy_version_format check (
    version ~ '^[a-z][a-z0-9_.-]{2,99}$'
  ),
  constraint jurisdiction_policy_code_format check (
    jurisdiction_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'
  ),
  constraint jurisdiction_policy_period check (
    effective_until is null or (effective_from is not null and effective_until > effective_from)
  ),
  constraint jurisdiction_policy_approval_check check (
    lifecycle_state <> 'approved'
    or (effective_from is not null and length(trim(legal_review_reference)) between 3 and 255)
  )
);

comment on table public.jurisdiction_policy_versions_v2 is
  'Versioned jurisdiction policy metadata only. This foundation contains no national legal or tax rules.';

create trigger jurisdiction_policy_versions_v2_immutable
before update or delete on public.jurisdiction_policy_versions_v2
for each row execute function public.reject_financial_definition_mutation();

create or replace view public.admin_financial_incident_sources_v2 as
with latest_remediation as (
  select distinct on (attempt.operation_type, attempt.operation_id) attempt.*
  from public.financial_remediation_attempts_v2 attempt
  order by attempt.operation_type, attempt.operation_id, attempt.attempt_number desc
), latest_transfer as (
  select distinct on (attempt.transfer_id) attempt.*
  from public.provider_transfer_v2_attempts attempt
  order by attempt.transfer_id, attempt.attempt_number desc
)
select 'recovery_deficit:' || deficit.id::text as incident_key,
  'recovery_deficit'::text as incident_type, deficit.id::text as source_id,
  'critical'::text as severity, deficit.payment_id, null::uuid as control_id,
  payment.provider_id, deficit.currency,
  reversal.requested_amount_cents as glossed_amount_cents,
  reversal.recovered_amount_cents as stripe_amount_cents,
  deficit.amount_cents as divergence_amount_cents,
  reversal.stripe_reversal_id as stripe_object_id, deficit.reason as detail,
  deficit.created_at as occurred_at, deficit.status = 'admin_review' as is_open
from public.financial_recovery_deficits_v2 deficit
join public.transfer_reversals_v2 reversal on reversal.id = deficit.transfer_reversal_id
join public.checkout_v2_payments payment on payment.id = deficit.payment_id
union all
select 'remediation_manual_review:' || attempt.id::text,
  'remediation_manual_review', attempt.id::text, 'critical',
  coalesce(refund.payment_id, reversal.payment_id), null::uuid,
  payment.provider_id, coalesce(refund.currency, reversal.currency),
  coalesce(refund.amount_cents, reversal.requested_amount_cents), null::bigint,
  null::bigint, attempt.stripe_object_id,
  coalesce(attempt.error_message, attempt.error_code, attempt.operation_type),
  attempt.created_at, attempt.outcome = 'manual_review'
from latest_remediation attempt
left join public.refunds_v2 refund on refund.id = attempt.refund_id
left join public.transfer_reversals_v2 reversal on reversal.id = attempt.transfer_reversal_id
left join public.checkout_v2_payments payment
  on payment.id = coalesce(refund.payment_id, reversal.payment_id)
where attempt.outcome = 'manual_review'
union all
select 'transfer_manual_review:' || attempt.id::text,
  'transfer_manual_review', attempt.id::text, 'critical', transfer.payment_id,
  null::uuid, transfer.provider_id, transfer.currency, transfer.amount_cents,
  case when attempt.outcome = 'succeeded' then transfer.amount_cents else null end,
  null::bigint, coalesce(attempt.stripe_transfer_id, transfer.stripe_transfer_id),
  coalesce(attempt.error_message, attempt.error_code, 'Provider transfer requires review'),
  attempt.created_at, attempt.outcome = 'manual_review'
from latest_transfer attempt
join public.provider_transfers_v2 transfer on transfer.id = attempt.transfer_id
where attempt.outcome = 'manual_review'
union all
select 'payout_failure:' || payout.id::text, 'payout_failure', payout.id::text,
  'critical', null::uuid, null::uuid, payout.provider_id, payout.currency,
  payout.provider_balance_debit_amount_cents, null::bigint, null::bigint,
  payout.stripe_payout_id, coalesce(payout.failure_message, payout.failure_code,
    'Provider payout failed'), coalesce(payout.failed_at, payout.updated_at),
  payout.failed_at is not null and payout.paid_at is null and payout.cancelled_at is null
from public.provider_payouts_v2 payout
where payout.failed_at is not null and payout.paid_at is null and payout.cancelled_at is null
union all
select 'runtime_control:' || control.id::text, 'runtime_control_blocked',
  control.id::text, 'critical', null::uuid, control.id, null::uuid,
  control.currency, null::bigint, null::bigint, null::bigint, null::text,
  control.reason, control.updated_at, control.state = 'blocked'
from public.financial_runtime_controls control
where control.state = 'blocked';

revoke all on public.admin_financial_incident_sources_v2 from public, anon, authenticated;
grant select on public.admin_financial_incident_sources_v2 to service_role;

create table public.admin_incident_reconciliation_snapshots_v2 (
  id uuid primary key default gen_random_uuid(),
  incident_key text not null,
  incident_type text not null,
  source_id text not null,
  payment_id uuid references public.checkout_v2_payments(id) on delete restrict,
  control_id uuid references public.financial_runtime_controls(id) on delete restrict,
  currency text,
  glossed_amount_cents bigint,
  stripe_amount_cents bigint,
  divergence_amount_cents bigint,
  ledger_balanced boolean not null,
  source_resolved boolean not null,
  reconciliation_status text not null check (reconciliation_status in (
    'matched', 'divergent', 'incomplete'
  )),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  checked_by uuid not null references public.admin_accounts(user_id) on delete restrict,
  mfa_authenticated_at timestamptz not null,
  checked_at timestamptz not null default clock_timestamp(),
  deduplication_key text not null unique,
  constraint admin_incident_reconciliation_key_length check (
    length(incident_key) between 3 and 255 and length(deduplication_key) between 3 and 255
  )
);

create index admin_incident_reconciliation_incident_idx
  on public.admin_incident_reconciliation_snapshots_v2(incident_key, checked_at desc);

create trigger admin_incident_reconciliation_immutable
before update or delete on public.admin_incident_reconciliation_snapshots_v2
for each row execute function public.reject_financial_definition_mutation();

create table public.admin_financial_control_reactivation_previews_v2 (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admin_accounts(user_id) on delete restrict,
  control_id uuid not null references public.financial_runtime_controls(id) on delete restrict,
  control_revision bigint not null,
  reconciliation_id uuid not null
    references public.admin_incident_reconciliation_snapshots_v2(id) on delete restrict,
  previous_state text not null check (previous_state = 'blocked'),
  target_state text not null default 'normal' check (target_state = 'normal'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  execution_operation_id uuid unique,
  created_at timestamptz not null default clock_timestamp(),
  constraint admin_control_reactivation_consumed_check check (
    (consumed_at is null and execution_operation_id is null)
    or (consumed_at is not null and execution_operation_id is not null)
  )
);

create or replace function public.protect_admin_control_reactivation_preview_v2()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'Reactivation previews cannot be deleted' using errcode = '42501'; end if;
  if current_setting('app.admin_control_reactivation_consume', true) is distinct from 'on'
     or new.id is distinct from old.id or new.admin_id is distinct from old.admin_id
     or new.control_id is distinct from old.control_id
     or new.control_revision is distinct from old.control_revision
     or new.reconciliation_id is distinct from old.reconciliation_id
     or new.previous_state is distinct from old.previous_state
     or new.target_state is distinct from old.target_state
     or new.expires_at is distinct from old.expires_at
     or old.consumed_at is not null or new.consumed_at is null
     or new.execution_operation_id is null then
    raise exception 'Reactivation previews are immutable except for controlled one-time consumption'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger protect_admin_control_reactivation_preview_v2
before update or delete on public.admin_financial_control_reactivation_previews_v2
for each row execute function public.protect_admin_control_reactivation_preview_v2();

create or replace function public.admin_list_financial_incidents(
  p_queue text default 'open', p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  perform public.assert_admin_permission('incidents.read');
  if p_queue not in ('open', 'all') or p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'Invalid incident queue request' using errcode = '22023';
  end if;
  with filtered as (
    select source.*,
      (select to_jsonb(snapshot) from public.admin_incident_reconciliation_snapshots_v2 snapshot
       where snapshot.incident_key = source.incident_key
       order by snapshot.checked_at desc limit 1) as latest_reconciliation
    from public.admin_financial_incident_sources_v2 source
    where p_queue = 'all' or source.is_open
  ), page as (
    select filtered.*, count(*) over () as total_count
    from filtered order by occurred_at asc, incident_key limit p_limit offset p_offset
  )
  select jsonb_build_object('queue', p_queue, 'total', coalesce(max(total_count), 0),
    'items', coalesce(jsonb_agg(to_jsonb(page) - 'total_count'
      order by occurred_at asc, incident_key), '[]'::jsonb)) into v_result from page;
  perform public.record_admin_read_audit('incidents.list', 'financial_incident_queue_v2',
    p_queue, jsonb_build_object('limit',p_limit,'offset',p_offset));
  return v_result;
end
$$;

create or replace function public.admin_get_financial_incident_detail(p_incident_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_incident public.admin_financial_incident_sources_v2%rowtype; v_result jsonb;
begin
  perform public.assert_admin_permission('incidents.read');
  select * into v_incident from public.admin_financial_incident_sources_v2
    where incident_key = p_incident_key;
  if not found then raise exception 'Financial incident not found' using errcode = 'P0002'; end if;
  select jsonb_build_object(
    'incident', to_jsonb(v_incident),
    'reconciliations', coalesce((select jsonb_agg(to_jsonb(snapshot) order by checked_at desc)
      from public.admin_incident_reconciliation_snapshots_v2 snapshot
      where snapshot.incident_key = p_incident_key), '[]'::jsonb),
    'runtime_control', (select to_jsonb(control) from public.financial_runtime_controls control
      where control.id = v_incident.control_id),
    'runtime_events', coalesce((select jsonb_agg(to_jsonb(event) order by changed_at desc)
      from public.financial_runtime_control_events event
      where event.control_id = v_incident.control_id), '[]'::jsonb),
    'ledger_batches', coalesce((select jsonb_agg(batch_detail order by created_at)
      from (select batch.id, batch.operation_type, batch.operation_key, batch.currency,
        batch.status, batch.external_reference_type, batch.external_reference_id,
        batch.created_at, batch.posted_at,
        coalesce(sum(entry.amount_cents) filter(where entry.direction='debit'),0) as debit_total_cents,
        coalesce(sum(entry.amount_cents) filter(where entry.direction='credit'),0) as credit_total_cents
        from public.financial_ledger_batches batch
        left join public.financial_ledger_entries entry on entry.batch_id = batch.id
        where v_incident.payment_id is not null and (
          batch.external_reference_id = v_incident.payment_id::text
          or batch.operation_key like '%' || v_incident.payment_id::text || '%')
        group by batch.id) batch_detail), '[]'::jsonb),
    'financial_timeline', coalesce((select jsonb_agg(to_jsonb(event) order by created_at)
      from public.financial_audit_log event where v_incident.payment_id is not null
        and (event.entity_id = v_incident.payment_id::text
          or event.evidence::text like '%' || v_incident.payment_id::text || '%')), '[]'::jsonb),
    'policy_versions', coalesce((select jsonb_build_object(
      'contract_version', terms.contract_version,
      'eligibility_policy_version', terms.eligibility_policy_version,
      'cancellation_policy_version', terms.cancellation_policy_version,
      'checkout_policy_version', selection.policy_version)
      from public.checkout_v2_payments payment
      join public.checkout_v2_selections selection on selection.id = payment.selection_id
      join public.financial_terms_snapshots terms on terms.id = payment.terms_snapshot_id
      where payment.id = v_incident.payment_id), '{}'::jsonb)
  ) into v_result;
  perform public.record_admin_read_audit('incidents.read', 'financial_incident_v2',
    p_incident_key, jsonb_build_object('incident_type',v_incident.incident_type));
  return v_result;
end
$$;

create or replace function public.admin_reconcile_financial_incident_v2(
  p_incident_key text, p_deduplication_key text
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_incident public.admin_financial_incident_sources_v2%rowtype;
  v_snapshot public.admin_incident_reconciliation_snapshots_v2%rowtype;
  v_ledger_balanced boolean; v_source_resolved boolean; v_status text;
begin
  perform public.assert_admin_permission('incidents.reconcile', true);
  if length(coalesce(p_deduplication_key,'')) not between 3 and 255 then
    raise exception 'Invalid reconciliation identity' using errcode = '22023';
  end if;
  select * into v_incident from public.admin_financial_incident_sources_v2
    where incident_key = p_incident_key;
  if not found then raise exception 'Financial incident not found' using errcode = 'P0002'; end if;
  select not exists (
    select 1 from public.financial_ledger_batches batch
    left join public.financial_ledger_entries entry on entry.batch_id = batch.id
    where batch.status = 'posted'
    group by batch.id
    having coalesce(sum(entry.amount_cents) filter(where entry.direction='debit'),0)
      <> coalesce(sum(entry.amount_cents) filter(where entry.direction='credit'),0)
  ) into v_ledger_balanced;
  v_source_resolved := case when v_incident.incident_type = 'runtime_control_blocked' then
    not exists (select 1 from public.admin_financial_incident_sources_v2 other
      where other.is_open and other.incident_type <> 'runtime_control_blocked'
        and (v_incident.currency is null or other.currency = v_incident.currency))
    else not v_incident.is_open end;
  v_status := case
    when not v_ledger_balanced or not v_source_resolved then 'incomplete'
    when coalesce(v_incident.divergence_amount_cents,0) <> 0 then 'divergent'
    else 'matched' end;
  insert into public.admin_incident_reconciliation_snapshots_v2 (
    incident_key, incident_type, source_id, payment_id, control_id, currency,
    glossed_amount_cents, stripe_amount_cents, divergence_amount_cents,
    ledger_balanced, source_resolved, reconciliation_status, evidence,
    checked_by, mfa_authenticated_at, deduplication_key
  ) values (
    v_incident.incident_key, v_incident.incident_type, v_incident.source_id,
    v_incident.payment_id, v_incident.control_id, v_incident.currency,
    v_incident.glossed_amount_cents, v_incident.stripe_amount_cents,
    v_incident.divergence_amount_cents, v_ledger_balanced, v_source_resolved,
    v_status, jsonb_build_object('stripe_object_id',v_incident.stripe_object_id,
      'source_snapshot_at',v_incident.occurred_at), auth.uid(),
    public.admin_current_mfa_authenticated_at(), p_deduplication_key
  ) on conflict (deduplication_key) do nothing
  returning * into v_snapshot;
  if v_snapshot.id is null then
    select * into strict v_snapshot
      from public.admin_incident_reconciliation_snapshots_v2
      where deduplication_key = p_deduplication_key;
  end if;
  insert into public.admin_audit_log (admin_account_id,event_type,entity_type,entity_id,
    action,outcome,after_state,mfa_authenticated_at,deduplication_key)
  values (auth.uid(),'financial_incident_reconciled','financial_incident_v2',p_incident_key,
    'incidents.reconcile','success',to_jsonb(v_snapshot),
    public.admin_current_mfa_authenticated_at(),'admin-incident-reconcile:'||v_snapshot.id::text)
  on conflict (deduplication_key) do nothing;
  return to_jsonb(v_snapshot);
end
$$;

create or replace function public.admin_preview_financial_control_reactivation_v2(
  p_control_id uuid, p_reconciliation_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_control public.financial_runtime_controls%rowtype;
  v_reconciliation public.admin_incident_reconciliation_snapshots_v2%rowtype;
  v_preview public.admin_financial_control_reactivation_previews_v2%rowtype;
  v_max_age integer;
begin
  perform public.assert_admin_permission('incidents.reactivate', true);
  perform public.assert_admin_permission('finance.execute', true);
  select * into v_control from public.financial_runtime_controls where id=p_control_id for update;
  if not found or v_control.state <> 'blocked' then
    raise exception 'Only a blocked financial control can be reactivated' using errcode='23514';
  end if;
  select * into v_reconciliation from public.admin_incident_reconciliation_snapshots_v2
    where id=p_reconciliation_id and control_id=p_control_id
      and reconciliation_status='matched';
  if not found then raise exception 'A conclusive reconciliation is required' using errcode='23514'; end if;
  select financial_reauthentication_max_age_seconds into v_max_age
    from public.admin_security_policy_versions where effective_from<=clock_timestamp()
      and (effective_until is null or effective_until>clock_timestamp())
    order by effective_from desc limit 1;
  if v_reconciliation.checked_at < clock_timestamp()-make_interval(secs=>coalesce(v_max_age,300)) then
    raise exception 'Reconciliation is no longer recent' using errcode='23514';
  end if;
  insert into public.admin_financial_control_reactivation_previews_v2 (
    admin_id,control_id,control_revision,reconciliation_id,previous_state,expires_at
  ) values (auth.uid(),p_control_id,v_control.revision,p_reconciliation_id,'blocked',
    clock_timestamp()+make_interval(secs=>coalesce(v_max_age,300))) returning * into v_preview;
  insert into public.admin_audit_log (admin_account_id,event_type,entity_type,entity_id,
    action,outcome,after_state,mfa_authenticated_at,deduplication_key)
  values (auth.uid(),'financial_control_reactivation_previewed','financial_runtime_control',
    p_control_id::text,'incidents.reactivate.preview','success',to_jsonb(v_preview),
    public.admin_current_mfa_authenticated_at(),'admin-control-preview:'||v_preview.id::text);
  return to_jsonb(v_preview);
end
$$;

create or replace function public.consume_admin_financial_control_reactivation_v2(
  p_preview_id uuid, p_admin_id uuid, p_reason text,
  p_mfa_authenticated_at timestamptz, p_execution_operation_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_preview public.admin_financial_control_reactivation_previews_v2%rowtype;
  v_control public.financial_runtime_controls%rowtype;
  v_reconciliation public.admin_incident_reconciliation_snapshots_v2%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if not public.admin_account_has_permission(p_admin_id,'finance.execute')
     or not public.admin_account_has_permission(p_admin_id,'incidents.reactivate') then
    raise exception 'Financial incident reactivation permission required' using errcode='42501';
  end if;
  perform public.assert_recent_financial_admin_mfa_v2(
    p_admin_id,p_mfa_authenticated_at,'financial_admin_mfa_v1');
  if length(trim(coalesce(p_reason,''))) not between 10 and 4000 then
    raise exception 'A detailed justification is required' using errcode='22023';
  end if;
  select * into v_preview from public.admin_financial_control_reactivation_previews_v2
    where id=p_preview_id for update;
  if not found then raise exception 'Reactivation preview not found' using errcode='P0002'; end if;
  if v_preview.admin_id<>p_admin_id then raise exception 'Preview belongs to another administrator' using errcode='42501'; end if;
  if v_preview.consumed_at is not null then
    if v_preview.execution_operation_id<>p_execution_operation_id then
      raise exception 'Preview already consumed by another operation' using errcode='23505';
    end if;
    return jsonb_build_object('control_id',v_preview.control_id,'state','normal','idempotent',true);
  end if;
  if v_preview.expires_at<clock_timestamp() then raise exception 'Reactivation preview expired' using errcode='22023'; end if;
  select * into v_control from public.financial_runtime_controls
    where id=v_preview.control_id for update;
  if v_control.state<>'blocked' or v_control.revision<>v_preview.control_revision then
    raise exception 'Financial control changed after preview' using errcode='40001';
  end if;
  select * into v_reconciliation from public.admin_incident_reconciliation_snapshots_v2
    where id=v_preview.reconciliation_id and reconciliation_status='matched';
  if not found or exists (select 1 from public.admin_financial_incident_sources_v2 incident
      where incident.is_open and incident.incident_type<>'runtime_control_blocked'
        and (v_control.currency is null or incident.currency=v_control.currency)) then
    raise exception 'Reconciliation is no longer conclusive' using errcode='40001';
  end if;
  perform set_config('app.admin_control_reactivation_consume','on',true);
  update public.admin_financial_control_reactivation_previews_v2 set
    consumed_at=clock_timestamp(),execution_operation_id=p_execution_operation_id
    where id=v_preview.id;
  perform set_config('app.admin_control_reactivation_consume','off',true);
  update public.financial_runtime_controls set state='normal',source='manual',
    reason=null,updated_by=p_admin_id where id=v_control.id;
  insert into public.admin_audit_log (admin_account_id,event_type,entity_type,entity_id,
    action,outcome,reason,before_state,after_state,mfa_authenticated_at,deduplication_key)
  values (p_admin_id,'financial_control_reactivated','financial_runtime_control',
    v_control.id::text,'incidents.reactivate','success',trim(p_reason),to_jsonb(v_control),
    jsonb_build_object('state','normal','reconciliation_id',v_reconciliation.id),
    p_mfa_authenticated_at,'admin-control-reactivate:'||p_execution_operation_id::text)
  on conflict (deduplication_key) do nothing;
  insert into public.financial_audit_log (financial_flow_version,event_type,entity_type,
    entity_id,actor_type,actor_user_id,reason,before_state,after_state,evidence,
    deduplication_key)
  values ('marketplace_v2','financial_control.reactivated','financial_runtime_control',
    v_control.id::text,'admin',p_admin_id,trim(p_reason),to_jsonb(v_control),
    jsonb_build_object('state','normal'),jsonb_build_object('reconciliation_id',v_reconciliation.id),
    'financial-control-reactivate:'||p_execution_operation_id::text)
  on conflict (deduplication_key) do nothing;
  return jsonb_build_object('control_id',v_control.id,'state','normal','idempotent',false);
end
$$;

create or replace function public.admin_search_audit(
  p_query text default null, p_source text default 'all',
  p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  perform public.assert_admin_permission('audit.read');
  if p_source not in ('all','admin','financial','authentication')
     or p_limit not between 1 and 100 or p_offset<0 then
    raise exception 'Invalid audit search' using errcode='22023';
  end if;
  with events as (
    select 'admin'::text source,id::text record_id,event_type,entity_type,
      coalesce(entity_id,'') entity_id,admin_account_id actor_id,action,outcome,reason,
      occurred_at,coalesce(deduplication_key,'') deduplication_key,
      jsonb_build_object('before',before_state,'after',after_state,'evidence',evidence) payload
    from public.admin_audit_log
    union all
    select 'financial',id::text,event_type,entity_type,entity_id,actor_user_id,
      event_type,'success',reason,created_at,deduplication_key,
      jsonb_build_object('before',before_state,'after',after_state,'evidence',evidence)
    from public.financial_audit_log
    union all
    select 'authentication',id::text,event_type,'admin_session',coalesce(session_id,''),
      user_id,event_type,outcome,null,occurred_at,deduplication_key,client_context
    from public.admin_auth_events
  ), filtered as (
    select event.*,users.email as actor_email from events event
    left join public.users users on users.id=event.actor_id
    where (p_source='all' or event.source=p_source) and (
      nullif(trim(coalesce(p_query,'')),'') is null or concat_ws(' ',event.event_type,
        event.entity_type,event.entity_id,event.actor_id::text,users.email,event.action,
        event.outcome,event.reason,event.deduplication_key) ilike '%'||trim(p_query)||'%')
  ), page as (
    select filtered.*,count(*) over() total_count from filtered
    order by occurred_at desc,record_id desc limit p_limit offset p_offset
  )
  select jsonb_build_object('source',p_source,'query',p_query,
    'total',coalesce(max(total_count),0),'items',coalesce(jsonb_agg(to_jsonb(page)-'total_count'
      order by occurred_at desc,record_id desc),'[]'::jsonb)) into v_result from page;
  perform public.record_admin_read_audit('audit.search','admin_audit','global',
    jsonb_build_object('source',p_source,'query',p_query,'limit',p_limit,'offset',p_offset));
  return v_result;
end
$$;

create or replace function public.admin_get_configuration_catalog()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  perform public.assert_admin_permission('configuration.read');
  select jsonb_build_object(
    'feature_flags',coalesce((select jsonb_agg(to_jsonb(flag) order by flag.flag_code)
      from public.financial_feature_flags flag),'[]'::jsonb),
    'runtime_controls',coalesce((select jsonb_agg(to_jsonb(control) order by control.control_code,control.currency)
      from public.financial_runtime_controls control),'[]'::jsonb),
    'liquidity_limits',coalesce((select jsonb_agg(to_jsonb(limit_row) order by created_at desc)
      from public.financial_limit_versions limit_row),'[]'::jsonb),
    'checkout_policies',coalesce((select jsonb_agg(to_jsonb(policy)||jsonb_build_object(
      'applied_operation_count',(select count(*) from public.checkout_v2_selections selection
        where selection.policy_version=policy.version)) order by policy.created_at desc)
      from public.checkout_v2_policy_versions policy),'[]'::jsonb),
    'payout_policies',coalesce((select jsonb_agg(to_jsonb(policy)||jsonb_build_object(
      'applied_operation_count',(select count(*) from public.provider_payouts_v2 payout
        where payout.policy_version=policy.version)) order by policy.created_at desc)
      from public.provider_payout_policy_versions policy),'[]'::jsonb),
    'eligibility_policies',coalesce((select jsonb_agg(to_jsonb(policy) order by policy.created_at desc)
      from public.provider_eligibility_policy_versions policy),'[]'::jsonb),
    'jurisdiction_policies',coalesce((select jsonb_agg(to_jsonb(policy) order by policy.created_at desc)
      from public.jurisdiction_policy_versions_v2 policy),'[]'::jsonb),
    'admin_security_policies',coalesce((select jsonb_agg(to_jsonb(policy) order by policy.effective_from desc)
      from public.admin_security_policy_versions policy),'[]'::jsonb)
  ) into v_result;
  perform public.record_admin_read_audit('configuration.read','configuration_catalog_v2','global','{}'::jsonb);
  return v_result;
end
$$;

create or replace function public.admin_create_configuration_version(
  p_configuration_type text,p_version text,p_payload jsonb,p_reason text
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_admin uuid:=auth.uid(); v_result jsonb;
begin
  perform public.assert_admin_permission('configuration.manage',true);
  if length(trim(coalesce(p_reason,''))) not between 10 and 4000
     or coalesce(jsonb_typeof(p_payload),'')<>'object' then
    raise exception 'A valid payload and detailed reason are required' using errcode='22023';
  end if;
  if p_configuration_type='liquidity_limit' then
    insert into public.financial_limit_versions(version,metric_code,currency,
      comparison_operator,warning_threshold_cents,blocking_threshold_cents,notes,created_by)
    values(p_version,coalesce(p_payload->>'metric_code','checkout_liquidity_exposure'),
      lower(p_payload->>'currency'),coalesce(p_payload->>'comparison_operator','above'),
      (p_payload->>'warning_threshold_cents')::bigint,
      (p_payload->>'blocking_threshold_cents')::bigint,
      coalesce(p_payload->>'notes',trim(p_reason)),v_admin);
  elsif p_configuration_type='checkout_policy' then
    insert into public.checkout_v2_policy_versions(version,currency,
      payment_window_open_before_start_seconds,payment_deadline_seconds,
      checkout_ttl_seconds,checkout_expiry_margin_before_start_seconds,
      liquidity_limit_version,stripe_payment_method_configuration_reference,notes,created_by)
    values(p_version,lower(p_payload->>'currency'),
      (p_payload->>'payment_window_open_before_start_seconds')::bigint,
      (p_payload->>'payment_deadline_seconds')::bigint,
      (p_payload->>'checkout_ttl_seconds')::bigint,
      (p_payload->>'checkout_expiry_margin_before_start_seconds')::bigint,
      p_payload->>'liquidity_limit_version',
      p_payload->>'stripe_payment_method_configuration_reference',
      coalesce(p_payload->>'notes',trim(p_reason)),v_admin);
  elsif p_configuration_type='payout_policy' then
    insert into public.provider_payout_policy_versions(version,currency,schedule_timezone,
      standard_payout_isodays,standard_payout_local_time,minimum_payout_amount_cents,
      instant_quote_ttl_seconds,stripe_instant_cost_rate_bps,effective_from,notes)
    values(p_version,lower(p_payload->>'currency'),p_payload->>'schedule_timezone',
      array(select jsonb_array_elements_text(p_payload->'standard_payout_isodays')::smallint),
      (p_payload->>'standard_payout_local_time')::time,
      coalesce((p_payload->>'minimum_payout_amount_cents')::bigint,0),
      (p_payload->>'instant_quote_ttl_seconds')::integer,
      (p_payload->>'stripe_instant_cost_rate_bps')::integer,
      (p_payload->>'effective_from')::timestamptz,coalesce(p_payload->>'notes',trim(p_reason)));
  elsif p_configuration_type='jurisdiction_policy_structure' then
    if coalesce(p_payload->>'lifecycle_state','draft')<>'draft' then
      raise exception 'Jurisdiction policy foundations can only be created as drafts' using errcode='23514';
    end if;
    insert into public.jurisdiction_policy_versions_v2(version,jurisdiction_code,
      policy_type,lifecycle_state,notes,created_by)
    values(p_version,upper(p_payload->>'jurisdiction_code'),p_payload->>'policy_type','draft',
      coalesce(p_payload->>'notes',trim(p_reason)),v_admin);
  else raise exception 'Unsupported configuration type' using errcode='22023';
  end if;
  v_result:=jsonb_build_object('configuration_type',p_configuration_type,
    'version',p_version,'created_by',v_admin,'feature_flags_changed',false);
  insert into public.admin_audit_log(admin_account_id,event_type,entity_type,entity_id,
    action,outcome,reason,after_state,mfa_authenticated_at,deduplication_key)
  values(v_admin,'configuration_version_created',p_configuration_type,p_version,
    'configuration.create','success',trim(p_reason),p_payload,
    public.admin_current_mfa_authenticated_at(),
    'admin-config:'||p_configuration_type||':'||p_version);
  return v_result;
end
$$;

alter table public.jurisdiction_policy_versions_v2 enable row level security;
alter table public.admin_incident_reconciliation_snapshots_v2 enable row level security;
alter table public.admin_financial_control_reactivation_previews_v2 enable row level security;

revoke all on public.jurisdiction_policy_versions_v2 from public,anon,authenticated;
revoke all on public.admin_incident_reconciliation_snapshots_v2 from public,anon,authenticated;
revoke all on public.admin_financial_control_reactivation_previews_v2 from public,anon,authenticated;
grant all on public.jurisdiction_policy_versions_v2 to service_role;
grant all on public.admin_incident_reconciliation_snapshots_v2 to service_role;
grant all on public.admin_financial_control_reactivation_previews_v2 to service_role;

revoke all on function public.admin_list_financial_incidents(text,integer,integer) from public,anon;
revoke all on function public.admin_get_financial_incident_detail(text) from public,anon;
revoke all on function public.admin_reconcile_financial_incident_v2(text,text) from public,anon;
revoke all on function public.admin_preview_financial_control_reactivation_v2(uuid,uuid) from public,anon;
revoke all on function public.admin_search_audit(text,text,integer,integer) from public,anon;
revoke all on function public.admin_get_configuration_catalog() from public,anon;
revoke all on function public.admin_create_configuration_version(text,text,jsonb,text) from public,anon;
grant execute on function public.admin_list_financial_incidents(text,integer,integer) to authenticated;
grant execute on function public.admin_get_financial_incident_detail(text) to authenticated;
grant execute on function public.admin_reconcile_financial_incident_v2(text,text) to authenticated;
grant execute on function public.admin_preview_financial_control_reactivation_v2(uuid,uuid) to authenticated;
grant execute on function public.admin_search_audit(text,text,integer,integer) to authenticated;
grant execute on function public.admin_get_configuration_catalog() to authenticated;
grant execute on function public.admin_create_configuration_version(text,text,jsonb,text) to authenticated;

revoke all on function public.consume_admin_financial_control_reactivation_v2(
  uuid,uuid,text,timestamptz,uuid
) from public,anon,authenticated;
grant execute on function public.consume_admin_financial_control_reactivation_v2(
  uuid,uuid,text,timestamptz,uuid
) to service_role;

commit;
