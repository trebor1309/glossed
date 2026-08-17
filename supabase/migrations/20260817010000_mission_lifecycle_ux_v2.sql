-- User-facing read model and notifications for the already-defined mission
-- lifecycle v2. Financial mutations remain exclusively service-side.

begin;

-- A catalogue service has no contractual default duration. V2 terms already
-- derive completion_not_before_at from scheduled_end_at when present, otherwise
-- from scheduled_start_at.
alter table public.missions alter column duration drop default;

alter table public.notifications drop constraint notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check
check (event_type in (
  'new_message', 'booking_request', 'offer_received', 'mission_confirmed',
  'cancellation_requested', 'mission_cancelled', 'mission_completed',
  'payment_confirmed', 'refund_completed', 'verification_approved',
  'verification_rejected', 'proposal_not_selected',
  'service_provider_completed', 'service_confirmation_requested',
  'service_release_reminder', 'service_funds_released',
  'service_problem_reported', 'service_problem_resolved'
));

alter table public.notifications drop constraint notifications_source_table_check;
alter table public.notifications add constraint notifications_source_table_check
check (source_table in (
  'messages', 'booking_notifications', 'missions', 'payments',
  'professional_verification_reviews', 'checkout_v2_awards',
  'service_executions_v2', 'fund_releases_v2', 'workflow_transition_events'
));

create or replace function public.notification_email_preference_enabled(
  p_user public.users,
  p_event_type text
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    coalesce(p_user.notifications_email, p_user.notif_email, true)
    and case
      when p_event_type = 'new_message'
        then coalesce(p_user.notif_new_messages, true)
      when p_event_type = 'booking_request'
        then coalesce(p_user.notif_job_alerts, true)
      when p_event_type in (
        'offer_received', 'mission_confirmed', 'cancellation_requested',
        'mission_cancelled', 'mission_completed', 'payment_confirmed',
        'refund_completed', 'proposal_not_selected',
        'service_provider_completed', 'service_confirmation_requested',
        'service_release_reminder', 'service_funds_released',
        'service_problem_reported', 'service_problem_resolved'
      ) then coalesce(p_user.notif_booking_updates, true)
      else true
    end
$$;

create or replace function public.get_my_mission_lifecycle_v2()
returns table (
  payment_id uuid,
  mission_id uuid,
  request_id uuid,
  actor_role text,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  completion_not_before_at timestamptz,
  provider_completed_at timestamptz,
  client_confirmed_at timestamptz,
  problem_reported_at timestamptz,
  problem_code text,
  problem_reason text,
  release_due_at timestamptz,
  original_release_due_at timestamptz,
  execution_state text,
  release_state text,
  transfer_state text,
  release_trigger text,
  released_at timestamptz,
  blocker_codes text[],
  transfer_succeeded_at timestamptz,
  can_provider_complete boolean,
  can_client_confirm boolean,
  can_client_report_problem boolean,
  review_available boolean,
  reviewed_by_me boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with participant_executions as (
    select
      execution.*,
      terms.scheduled_start_at,
      terms.scheduled_end_at,
      execution_workflow.current_state as stored_execution_state,
      case
        when execution_workflow.current_state = 'planned'
          and now() >= execution.completion_not_before_at
          then 'completion_eligible'
        else execution_workflow.current_state
      end as projected_execution_state,
      release_workflow.current_state as release_workflow_state,
      transfer_workflow.current_state as transfer_workflow_state,
      release.release_trigger,
      release.released_at,
      release.blocker_codes,
      transfer.succeeded_at as transfer_succeeded_at
    from public.service_executions_v2 execution
    join public.financial_terms_snapshots terms
      on terms.id = execution.terms_snapshot_id
    join public.workflow_instances execution_workflow
      on execution_workflow.id = execution.workflow_instance_id
    join public.fund_releases_v2 release
      on release.payment_id = execution.payment_id
    join public.workflow_instances release_workflow
      on release_workflow.id = release.workflow_instance_id
    left join public.provider_transfers_v2 transfer
      on transfer.payment_id = execution.payment_id
    left join public.workflow_instances transfer_workflow
      on transfer_workflow.id = transfer.workflow_instance_id
    where auth.uid() is not null
      and auth.uid() in (execution.client_id, execution.provider_id)
  )
  select
    execution.payment_id,
    execution.proposal_id as mission_id,
    execution.request_id,
    case when auth.uid() = execution.provider_id then 'provider' else 'client' end,
    execution.scheduled_start_at,
    execution.scheduled_end_at,
    execution.completion_not_before_at,
    execution.provider_completed_at,
    execution.client_confirmed_at,
    execution.problem_reported_at,
    execution.problem_code,
    execution.problem_reason,
    execution.release_due_at,
    execution.original_release_due_at,
    execution.projected_execution_state,
    execution.release_workflow_state,
    coalesce(execution.transfer_workflow_state, 'not_created'),
    execution.release_trigger,
    execution.released_at,
    execution.blocker_codes,
    execution.transfer_succeeded_at,
    auth.uid() = execution.provider_id
      and execution.projected_execution_state = 'completion_eligible'
      and execution.provider_completed_at is null
      and execution.client_confirmed_at is null
      and execution.problem_reported_at is null,
    auth.uid() = execution.client_id
      and execution.projected_execution_state in (
        'completion_eligible', 'provider_completed_waiting_client'
      )
      and execution.client_confirmed_at is null
      and execution.problem_reported_at is null,
    auth.uid() = execution.client_id
      and execution.projected_execution_state in (
        'completion_eligible', 'provider_completed_waiting_client'
      )
      and execution.client_confirmed_at is null
      and execution.problem_reported_at is null,
    execution.projected_execution_state = 'concluded',
    exists (
      select 1 from public.reviews review
      where review.mission_id = execution.proposal_id
        and review.reviewer_id = auth.uid()
    )
  from participant_executions execution
  order by execution.completion_not_before_at desc, execution.payment_id
$$;

revoke all on function public.get_my_mission_lifecycle_v2()
from public, anon;
grant execute on function public.get_my_mission_lifecycle_v2()
to authenticated;

-- Reviews remain attached to the mission record, but eligibility for v2 is
-- derived from the terminal service-execution workflow rather than mission.status.
create or replace function public.is_mission_review_eligible_v2(p_mission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.service_executions_v2 execution
    join public.workflow_instances workflow
      on workflow.id = execution.workflow_instance_id
    where execution.proposal_id = p_mission_id
      and auth.uid() in (execution.client_id, execution.provider_id)
      and workflow.machine_code = 'service_execution'
      and workflow.machine_version = 'v1'
      and workflow.current_state = 'concluded'
  )
$$;

revoke all on function public.is_mission_review_eligible_v2(uuid)
from public, anon;
grant execute on function public.is_mission_review_eligible_v2(uuid)
to authenticated;

drop policy if exists "reviews_insert_completed_mission_participant" on public.reviews;
create policy "reviews_insert_concluded_mission_participant"
on public.reviews for insert to authenticated
with check (
  reviewer_id = auth.uid()
  and exists (
    select 1
    from public.missions mission
    where mission.id = mission_id
      and auth.uid() in (mission.client_id, mission.pro_id)
      and target_id = case
        when auth.uid() = mission.client_id then mission.pro_id
        else mission.client_id
      end
      and (
        mission.status = 'completed'
        or public.is_mission_review_eligible_v2(mission.id)
      )
  )
);

create or replace function public.notify_service_execution_lifecycle_v2()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.provider_completed_at is null and new.provider_completed_at is not null then
    perform public.enqueue_notification(
      new.provider_id, 'service_provider_completed',
      'Prestation marquée comme terminée',
      'Votre déclaration a été enregistrée. La période de protection client de 48 heures a commencé.',
      'service_executions_v2', new.payment_id::text, 'mission', new.proposal_id,
      jsonb_build_object('payment_id', new.payment_id,
        'release_due_at', new.release_due_at),
      'service-v2:' || new.payment_id::text || ':provider-completed:provider'
    );
    perform public.enqueue_notification(
      new.client_id, 'service_confirmation_requested',
      'Confirmez votre prestation',
      'Le prestataire a déclaré la prestation terminée. Confirmez-la ou signalez un problème avant la fin de la période de protection.',
      'service_executions_v2', new.payment_id::text, 'mission', new.proposal_id,
      jsonb_build_object('payment_id', new.payment_id,
        'release_due_at', new.release_due_at),
      'service-v2:' || new.payment_id::text || ':confirmation-requested'
    );
  end if;

  if old.problem_reported_at is null and new.problem_reported_at is not null then
    perform public.enqueue_notification(
      new.provider_id, 'service_problem_reported',
      'Un problème a été signalé',
      'Le client a signalé un problème. La libération des fonds reste bloquée pendant son traitement.',
      'service_executions_v2', new.payment_id::text, 'mission', new.proposal_id,
      jsonb_build_object('payment_id', new.payment_id,
        'problem_code', new.problem_code),
      'service-v2:' || new.payment_id::text || ':problem-reported:provider'
    );
    perform public.enqueue_notification(
      new.client_id, 'service_problem_reported',
      'Problème enregistré',
      'Votre signalement a été enregistré. La libération des fonds est bloquée pendant son traitement.',
      'service_executions_v2', new.payment_id::text, 'mission', new.proposal_id,
      jsonb_build_object('payment_id', new.payment_id,
        'problem_code', new.problem_code),
      'service-v2:' || new.payment_id::text || ':problem-reported:client'
    );
  end if;
  return new;
end
$$;

create trigger notify_service_execution_lifecycle_v2
after update on public.service_executions_v2
for each row execute function public.notify_service_execution_lifecycle_v2();

revoke all on function public.notify_service_execution_lifecycle_v2()
from public, anon, authenticated;

create or replace function public.notify_fund_release_lifecycle_v2()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_execution public.service_executions_v2%rowtype;
begin
  if old.released_at is null and new.released_at is not null then
    select * into v_execution from public.service_executions_v2
    where payment_id = new.payment_id;
    perform public.enqueue_notification(
      v_execution.provider_id, 'service_funds_released',
      'Fonds libérés',
      'Les fonds de cette prestation ont été libérés vers votre solde prestataire.',
      'fund_releases_v2', new.payment_id::text, 'mission', v_execution.proposal_id,
      jsonb_build_object('payment_id', new.payment_id,
        'release_trigger', new.release_trigger),
      'service-v2:' || new.payment_id::text || ':funds-released:provider'
    );
    perform public.enqueue_notification(
      v_execution.client_id, 'service_funds_released',
      'Prestation conclue',
      'La prestation est conclue et le workflow d’avis est maintenant disponible.',
      'fund_releases_v2', new.payment_id::text, 'mission', v_execution.proposal_id,
      jsonb_build_object('payment_id', new.payment_id,
        'release_trigger', new.release_trigger),
      'service-v2:' || new.payment_id::text || ':funds-released:client'
    );
  end if;
  return new;
end
$$;

create trigger notify_fund_release_lifecycle_v2
after update on public.fund_releases_v2
for each row execute function public.notify_fund_release_lifecycle_v2();

revoke all on function public.notify_fund_release_lifecycle_v2()
from public, anon, authenticated;

create or replace function public.notify_service_problem_resolution_v2()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_execution public.service_executions_v2%rowtype;
begin
  if new.event_kind = 'transition'
     and new.transition_code = 'execution_conclude_problem' then
    select * into v_execution from public.service_executions_v2
    where workflow_instance_id = new.instance_id;
    if found then
      perform public.enqueue_notification(
        v_execution.client_id, 'service_problem_resolved',
        'Signalement résolu',
        'Une décision a été enregistrée pour le problème signalé. Consultez la mission pour son état financier.',
        'workflow_transition_events', new.id::text, 'mission', v_execution.proposal_id,
        jsonb_build_object('payment_id', v_execution.payment_id),
        'service-v2:' || v_execution.payment_id::text || ':problem-resolved:client'
      );
      perform public.enqueue_notification(
        v_execution.provider_id, 'service_problem_resolved',
        'Signalement résolu',
        'Une décision a été enregistrée pour le problème signalé. Consultez la mission pour son état financier.',
        'workflow_transition_events', new.id::text, 'mission', v_execution.proposal_id,
        jsonb_build_object('payment_id', v_execution.payment_id),
        'service-v2:' || v_execution.payment_id::text || ':problem-resolved:provider'
      );
    end if;
  end if;
  return new;
end
$$;

create trigger notify_service_problem_resolution_v2
after insert on public.workflow_transition_events
for each row execute function public.notify_service_problem_resolution_v2();

revoke all on function public.notify_service_problem_resolution_v2()
from public, anon, authenticated;

-- The deadline worker calls this before processing releases. The reminder point
-- is derived from the versioned protection delay (halfway through it), not from
-- a second hard-coded financial rule. Deduplication guarantees at most one alert.
create or replace function public.enqueue_due_service_release_reminders_v2(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_execution record;
  v_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform public.require_completion_release_v2_enabled();

  for v_execution in
    select execution.*, flow.release_delay_seconds
    from public.service_executions_v2 execution
    join public.checkout_v2_payments payment on payment.id = execution.payment_id
    join public.financial_flow_versions flow
      on flow.version = payment.financial_flow_version
    join public.workflow_instances workflow
      on workflow.id = execution.workflow_instance_id
    join public.fund_releases_v2 release
      on release.payment_id = execution.payment_id
    where execution.provider_completed_at is not null
      and execution.client_confirmed_at is null
      and execution.problem_reported_at is null
      and execution.release_due_at > clock_timestamp()
      and clock_timestamp() >= execution.provider_completed_at
        + make_interval(secs => (flow.release_delay_seconds / 2)::integer)
      and workflow.current_state = 'provider_completed_waiting_client'
      and release.released_at is null
      and release.blocked_at is null
    order by execution.release_due_at, execution.payment_id
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    perform public.enqueue_notification(
      v_execution.client_id, 'service_release_reminder',
      'Période de protection en cours',
      'Confirmez la prestation ou signalez un problème avant la libération automatique des fonds.',
      'service_executions_v2', v_execution.payment_id::text,
      'mission', v_execution.proposal_id,
      jsonb_build_object('payment_id', v_execution.payment_id,
        'release_due_at', v_execution.release_due_at),
      'service-v2:' || v_execution.payment_id::text || ':release-reminder'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

revoke all on function public.enqueue_due_service_release_reminders_v2(integer)
from public, anon, authenticated;
grant execute on function public.enqueue_due_service_release_reminders_v2(integer)
to service_role;

commit;
