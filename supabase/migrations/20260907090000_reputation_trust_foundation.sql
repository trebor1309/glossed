-- Reputation trust foundation: verified-service reviews, durable idempotency,
-- private raw storage and public published-only projections.

alter table public.reviews
  add column if not exists review_direction text,
  add column if not exists status text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists withdrawal_requested_at timestamptz;

update public.reviews review
set review_direction = case
  when review.reviewer_id = mission.client_id
    and review.target_id = mission.pro_id then 'client_to_provider'
  else 'legacy_provider_to_client'
end
from public.missions mission
where mission.id = review.mission_id
  and review.review_direction is null;

update public.reviews
set status = case
  when review_direction = 'client_to_provider' then 'published'
  else 'hidden'
end,
status_changed_at = case
  when review_direction = 'client_to_provider' then status_changed_at
  else coalesce(status_changed_at, clock_timestamp())
end
where status is null;

alter table public.reviews
  alter column review_direction set not null,
  alter column status set not null,
  alter column status set default 'published',
  add constraint reviews_direction_check
    check (review_direction in ('client_to_provider', 'legacy_provider_to_client')),
  add constraint reviews_status_check
    check (status in ('published', 'hidden', 'removed')),
  add constraint reviews_comment_length_check
    check (comment is null or char_length(comment) <= 2000),
  add constraint reviews_status_timestamp_check
    check (status = 'published' or status_changed_at is not null);

-- New public reputation has exactly one client review per mission. Historical
-- provider-to-client rows remain retained but hidden and cannot be recreated.
create unique index reviews_one_client_review_per_mission_idx
  on public.reviews(mission_id)
  where review_direction = 'client_to_provider';

-- Reputation history must not disappear as a side effect of deleting a
-- mission or profile. A future account-erasure workflow must explicitly
-- anonymize retained review identity before removing the account.
alter table public.reviews
  drop constraint if exists reviews_mission_id_fkey,
  drop constraint if exists reviews_reviewer_id_fkey,
  drop constraint if exists reviews_target_id_fkey;
alter table public.reviews
  add constraint reviews_mission_id_fkey foreign key (mission_id)
    references public.missions(id) on delete restrict,
  add constraint reviews_reviewer_id_fkey foreign key (reviewer_id)
    references public.users(id) on delete restrict,
  add constraint reviews_target_id_fkey foreign key (target_id)
    references public.users(id) on delete restrict;

-- This fact is deliberately independent from financial allocation. Normal
-- client confirmation / 48-hour completion records it automatically. A
-- disputed or administrative conclusion remains ineligible until a future
-- explicit outcome workflow records performed or partially_performed.
create table public.service_delivery_outcomes_v1 (
  mission_id uuid primary key references public.missions(id) on delete restrict,
  payment_id uuid unique references public.checkout_v2_payments(id) on delete restrict,
  outcome text not null check (
    outcome in ('performed', 'partially_performed', 'not_performed')
  ),
  source text not null check (
    source in ('automatic_normal_completion', 'explicit_resolution')
  ),
  recorded_by_actor_type text not null check (
    recorded_by_actor_type in ('system', 'administrator')
  ),
  recorded_by uuid references public.app_admins(user_id) on delete restrict,
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint service_delivery_outcome_actor_check check (
    (recorded_by_actor_type = 'system' and recorded_by is null)
    or (recorded_by_actor_type = 'administrator' and recorded_by is not null)
  ),
  constraint service_delivery_outcome_reason_check check (
    source <> 'explicit_resolution'
    or length(trim(reason)) between 3 and 4000
  )
);

alter table public.service_delivery_outcomes_v1 enable row level security;
revoke all on public.service_delivery_outcomes_v1 from public, anon, authenticated;
grant all on public.service_delivery_outcomes_v1 to service_role;

create or replace function public.record_normal_service_delivery_outcome_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_execution public.service_executions_v2%rowtype;
  v_workflow public.workflow_instances%rowtype;
begin
  if new.released_at is null
     or new.release_trigger not in ('client_confirmation', 'provider_timeout') then
    return new;
  end if;

  select * into v_execution
  from public.service_executions_v2
  where payment_id = new.payment_id;
  if not found or v_execution.problem_reported_at is not null then
    return new;
  end if;

  select * into v_workflow
  from public.workflow_instances
  where id = v_execution.workflow_instance_id;
  if not found
     or v_workflow.machine_code <> 'service_execution'
     or v_workflow.machine_version <> 'v1'
     or v_workflow.current_state <> 'concluded' then
    return new;
  end if;

  insert into public.service_delivery_outcomes_v1 (
    mission_id, payment_id, outcome, source, recorded_by_actor_type,
    reason, evidence
  ) values (
    v_execution.proposal_id, new.payment_id, 'performed',
    'automatic_normal_completion', 'system',
    'Normal service completion reached an explicit release path.',
    jsonb_build_object('release_trigger', new.release_trigger)
  ) on conflict (mission_id) do nothing;

  return new;
end
$$;

revoke all on function public.record_normal_service_delivery_outcome_v1()
from public, anon, authenticated;

drop trigger if exists record_normal_service_delivery_outcome_v1
on public.fund_releases_v2;
create trigger record_normal_service_delivery_outcome_v1
after insert or update of released_at, release_trigger on public.fund_releases_v2
for each row execute function public.record_normal_service_delivery_outcome_v1();

insert into public.service_delivery_outcomes_v1 (
  mission_id, payment_id, outcome, source, recorded_by_actor_type,
  reason, evidence, recorded_at
)
select
  execution.proposal_id, execution.payment_id, 'performed',
  'automatic_normal_completion', 'system',
  'Backfilled from a normal concluded v2 release.',
  jsonb_build_object('release_trigger', release.release_trigger),
  coalesce(release.released_at, clock_timestamp())
from public.service_executions_v2 execution
join public.workflow_instances workflow
  on workflow.id = execution.workflow_instance_id
join public.fund_releases_v2 release on release.payment_id = execution.payment_id
where workflow.machine_code = 'service_execution'
  and workflow.machine_version = 'v1'
  and workflow.current_state = 'concluded'
  and execution.problem_reported_at is null
  and release.released_at is not null
  and release.release_trigger in ('client_confirmation', 'provider_timeout')
on conflict (mission_id) do nothing;

create table public.review_submission_operations_v1 (
  client_id uuid not null references public.users(id) on delete restrict,
  operation_id uuid not null,
  mission_id uuid not null references public.missions(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 2000),
  review_id uuid unique references public.reviews(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  primary key (client_id, operation_id),
  constraint review_submission_completion_check check (
    (review_id is null and completed_at is null)
    or (review_id is not null and completed_at is not null)
  )
);

alter table public.review_submission_operations_v1 enable row level security;
revoke all on public.review_submission_operations_v1 from public, anon, authenticated;
grant all on public.review_submission_operations_v1 to service_role;

create table public.review_status_events_v1 (
  id bigint generated always as identity primary key,
  review_id uuid not null references public.reviews(id) on delete restrict,
  event_type text not null check (
    event_type in ('published', 'hidden', 'removed', 'withdrawal_requested')
  ),
  actor_type text not null check (
    actor_type in ('client', 'system', 'administrator')
  ),
  actor_user_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  deduplication_key text not null unique,
  created_at timestamptz not null default clock_timestamp()
);

alter table public.review_status_events_v1 enable row level security;
revoke all on public.review_status_events_v1 from public, anon, authenticated;
grant all on public.review_status_events_v1 to service_role;

create or replace function public.protect_review_history_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.review_maintenance_v1', true) is distinct from 'on' then
      raise exception 'Reviews cannot be physically deleted by normal workflows'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if current_setting('app.review_submission_v1_mutation', true) is distinct from 'on' then
      raise exception 'Reviews must be submitted through submit_review_v1'
        using errcode = '42501';
    end if;
    if new.review_direction <> 'client_to_provider'
       or new.comment is distinct from nullif(trim(new.comment), '')
       or not exists (
         select 1 from public.missions mission
         where mission.id = new.mission_id
           and mission.client_id = new.reviewer_id
           and mission.pro_id = new.target_id
       ) then
      raise exception 'Review identity or normalized content is invalid'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if current_setting('app.review_moderation_v1_mutation', true) is distinct from 'on'
     or new.id is distinct from old.id
     or new.mission_id is distinct from old.mission_id
     or new.reviewer_id is distinct from old.reviewer_id
     or new.target_id is distinct from old.target_id
     or new.rating is distinct from old.rating
     or new.comment is distinct from old.comment
     or new.created_at is distinct from old.created_at
     or new.review_direction is distinct from old.review_direction then
    raise exception 'Published review content and identity are immutable'
      using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists protect_review_history_v1 on public.reviews;
create trigger protect_review_history_v1
before insert or update or delete on public.reviews
for each row execute function public.protect_review_history_v1();

create or replace function public.prevent_review_event_mutation_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_setting('app.review_maintenance_v1', true) is distinct from 'on' then
    raise exception 'Review status events are append-only' using errcode = '42501';
  end if;
  return old;
end
$$;

create trigger prevent_review_event_mutation_v1
before update or delete on public.review_status_events_v1
for each row execute function public.prevent_review_event_mutation_v1();

drop policy if exists "reviews_insert_completed_mission_participant" on public.reviews;
drop policy if exists "reviews_insert_concluded_mission_participant" on public.reviews;
drop policy if exists "reviews_select_authenticated" on public.reviews;
revoke all on public.reviews from public, anon, authenticated;
grant all on public.reviews to service_role;

create or replace function public.is_review_eligible_v1(
  p_mission_id uuid,
  p_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.missions mission
    where mission.id = p_mission_id
      and mission.client_id = p_client_id
      and mission.pro_id is not null
      and (
        exists (
          select 1
          from public.service_delivery_outcomes_v1 outcome
          where outcome.mission_id = mission.id
            and outcome.outcome in ('performed', 'partially_performed')
        )
        or (
          mission.status = 'completed'
          and not exists (
            select 1 from public.service_executions_v2 execution
            where execution.proposal_id = mission.id
          )
        )
      )
  )
$$;

revoke all on function public.is_review_eligible_v1(uuid, uuid)
from public, anon, authenticated;

create or replace function public.is_mission_review_eligible_v2(p_mission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and public.is_review_eligible_v1(p_mission_id, auth.uid())
    and exists (
      select 1 from public.service_executions_v2 execution
      where execution.proposal_id = p_mission_id
        and execution.client_id = auth.uid()
    )
$$;

revoke all on function public.is_mission_review_eligible_v2(uuid)
from public, anon;
grant execute on function public.is_mission_review_eligible_v2(uuid)
to authenticated;

create or replace function public.submit_review_v1(
  p_operation_id uuid,
  p_mission_id uuid,
  p_rating smallint,
  p_comment text default null
)
returns table (
  review_id uuid,
  rating smallint,
  comment text,
  status text,
  created_at timestamptz,
  verified_glossed_service boolean,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid := auth.uid();
  v_comment text := nullif(trim(p_comment), '');
  v_operation public.review_submission_operations_v1%rowtype;
  v_mission public.missions%rowtype;
  v_review public.reviews%rowtype;
begin
  if v_client_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_operation_id is null or p_mission_id is null then
    raise exception 'operation_id and mission_id are required' using errcode = '22023';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'rating must be between 1 and 5' using errcode = '22023';
  end if;
  if v_comment is not null and char_length(v_comment) > 2000 then
    raise exception 'comment must not exceed 2000 characters' using errcode = '22023';
  end if;

  insert into public.review_submission_operations_v1 (
    client_id, operation_id, mission_id, rating, comment
  ) values (
    v_client_id, p_operation_id, p_mission_id, p_rating, v_comment
  ) on conflict (client_id, operation_id) do nothing;

  select * into v_operation
  from public.review_submission_operations_v1
  where client_id = v_client_id and operation_id = p_operation_id
  for update;

  if v_operation.mission_id <> p_mission_id
     or v_operation.rating <> p_rating
     or v_operation.comment is distinct from v_comment then
    raise exception 'operation_id was already used with a different review request'
      using errcode = '23505';
  end if;

  if v_operation.completed_at is not null then
    select * into v_review from public.reviews where id = v_operation.review_id;
    if not found then
      raise exception 'Completed review operation has no retained review'
        using errcode = 'P0002';
    end if;
    return query select v_review.id, v_review.rating, v_review.comment,
      v_review.status, v_review.created_at, true, true;
    return;
  end if;

  select * into v_mission
  from public.missions where id = p_mission_id for update;
  if not found or v_mission.client_id is distinct from v_client_id then
    raise exception 'Only the mission client may submit the provider review'
      using errcode = '42501';
  end if;
  if v_mission.pro_id is null then
    raise exception 'Mission has no reviewable provider' using errcode = '23514';
  end if;
  if not public.is_review_eligible_v1(p_mission_id, v_client_id) then
    raise exception 'The mission does not establish that a service was performed'
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.reviews review
    where review.mission_id = p_mission_id
      and review.review_direction = 'client_to_provider'
  ) then
    raise exception 'The client has already reviewed this mission'
      using errcode = '23505';
  end if;

  perform set_config('app.review_submission_v1_mutation', 'on', true);
  insert into public.reviews (
    mission_id, reviewer_id, target_id, rating, comment,
    review_direction, status
  ) values (
    p_mission_id, v_client_id, v_mission.pro_id, p_rating, v_comment,
    'client_to_provider', 'published'
  ) returning * into v_review;
  perform set_config('app.review_submission_v1_mutation', 'off', true);

  insert into public.review_status_events_v1 (
    review_id, event_type, actor_type, actor_user_id, reason,
    metadata, deduplication_key
  ) values (
    v_review.id, 'published', 'client', v_client_id,
    'Verified Glossed service review published.',
    jsonb_build_object('verified_glossed_service', true),
    'review-submission:' || v_client_id::text || ':' || p_operation_id::text
  );

  update public.review_submission_operations_v1
  set review_id = v_review.id, completed_at = clock_timestamp()
  where client_id = v_client_id and operation_id = p_operation_id;

  return query select v_review.id, v_review.rating, v_review.comment,
    v_review.status, v_review.created_at, true, false;
end
$$;

revoke all on function public.submit_review_v1(uuid, uuid, smallint, text)
from public, anon;
grant execute on function public.submit_review_v1(uuid, uuid, smallint, text)
to authenticated;

drop function if exists public.get_public_reviews(uuid);
create function public.get_public_reviews(
  p_target_id uuid,
  p_page_size integer default 20,
  p_before_created_at timestamptz default null,
  p_before_review_id uuid default null
)
returns table (
  id uuid,
  rating smallint,
  comment text,
  created_at timestamptz,
  reviewer_username text,
  reviewer_profile_photo text,
  verified_glossed_service boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_page_size not between 1 and 50 then
    raise exception 'page_size must be between 1 and 50' using errcode = '22023';
  end if;
  if (p_before_created_at is null) <> (p_before_review_id is null) then
    raise exception 'Both pagination cursor values are required' using errcode = '22023';
  end if;

  return query
  select review.id, review.rating, review.comment, review.created_at,
    reviewer.username, reviewer.profile_photo, true
  from public.reviews review
  join public.users reviewer on reviewer.id = review.reviewer_id
  join public.users target on target.id = review.target_id
  where review.target_id = p_target_id
    and review.review_direction = 'client_to_provider'
    and review.status = 'published'
    and target.role = 'pro'
    and public.is_provider_profile_visible(target.id)
    and (
      p_before_created_at is null
      or (review.created_at, review.id) < (p_before_created_at, p_before_review_id)
    )
  order by review.created_at desc, review.id desc
  limit p_page_size;
end
$$;

revoke all on function public.get_public_reviews(uuid, integer, timestamptz, uuid)
from public;
grant execute on function public.get_public_reviews(uuid, integer, timestamptz, uuid)
to anon, authenticated;

create or replace function public.get_public_review_summary(p_target_id uuid)
returns table (
  average_rating numeric,
  review_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select round(avg(review.rating)::numeric, 1), count(*)
  from public.reviews review
  join public.users target on target.id = review.target_id
  where review.target_id = p_target_id
    and review.review_direction = 'client_to_provider'
    and review.status = 'published'
    and target.role = 'pro'
    and public.is_provider_profile_visible(target.id)
$$;

revoke all on function public.get_public_review_summary(uuid) from public;
grant execute on function public.get_public_review_summary(uuid)
to anon, authenticated;

-- Keep the lifecycle projection authoritative: only the client sees the review
-- action, and only after a positive service-delivery fact exists.
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
    execution.proposal_id,
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
    auth.uid() = execution.client_id
      and execution.projected_execution_state = 'concluded'
      and public.is_review_eligible_v1(execution.proposal_id, auth.uid()),
    auth.uid() = execution.client_id
      and exists (
        select 1 from public.reviews review
        where review.mission_id = execution.proposal_id
          and review.reviewer_id = auth.uid()
          and review.review_direction = 'client_to_provider'
      )
  from participant_executions execution
  order by execution.completion_not_before_at desc, execution.payment_id
$$;

revoke all on function public.get_my_mission_lifecycle_v2()
from public, anon;
grant execute on function public.get_my_mission_lifecycle_v2()
to authenticated;
