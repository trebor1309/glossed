-- Reputation moderation backend: immutable provider replies, private reports,
-- RBAC-protected moderation queues and append-only decisions.

begin;

insert into public.admin_permission_definitions (
  permission_code, description, requires_recent_mfa
) values
  ('reputation.read', 'Read private review reports and moderation history.', false),
  ('reputation.moderate', 'Keep, hide, remove or restore reported reviews.', false);

insert into public.admin_role_permissions (role_code, permission_code) values
  ('support', 'reputation.read'),
  ('support', 'reputation.moderate'),
  ('super_admin', 'reputation.read'),
  ('super_admin', 'reputation.moderate');

create table public.review_replies_v1 (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.reviews(id) on delete restrict,
  provider_id uuid not null references public.users(id) on delete restrict,
  content text not null,
  created_at timestamptz not null default clock_timestamp(),
  published_at timestamptz not null default clock_timestamp(),
  constraint review_reply_content_check check (
    content = trim(content) and char_length(content) between 1 and 2000
  )
);

create table public.review_reply_operations_v1 (
  provider_id uuid not null references public.users(id) on delete restrict,
  operation_id uuid not null,
  review_id uuid not null references public.reviews(id) on delete restrict,
  content text not null,
  reply_id uuid unique references public.review_replies_v1(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  primary key (provider_id, operation_id),
  constraint review_reply_operation_content_check check (
    content = trim(content) and char_length(content) between 1 and 2000
  ),
  constraint review_reply_operation_completion_check check (
    (reply_id is null and completed_at is null)
    or (reply_id is not null and completed_at is not null)
  )
);

create table public.review_reports_v1 (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete restrict,
  reporter_id uuid not null references public.users(id) on delete restrict,
  operation_id uuid not null,
  reason_code text not null check (reason_code in (
    'abusive_or_hateful', 'personal_or_sensitive_info',
    'spam_or_commercial', 'off_topic_or_misleading', 'other'
  )),
  explanation text,
  status text not null default 'open' check (status in (
    'open', 'resolved_kept', 'resolved_hidden', 'resolved_removed'
  )),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolved_by uuid references public.admin_accounts(user_id) on delete restrict,
  resolution_event_id bigint references public.review_status_events_v1(id) on delete restrict,
  unique (reporter_id, operation_id),
  unique (review_id, reporter_id),
  constraint review_report_explanation_check check (
    explanation is null
    or (explanation = trim(explanation) and char_length(explanation) between 1 and 1000)
  ),
  constraint review_report_other_explanation_check check (
    reason_code <> 'other' or explanation is not null
  ),
  constraint review_report_resolution_check check (
    (status = 'open' and resolved_at is null and resolved_by is null and resolution_event_id is null)
    or
    (status <> 'open' and resolved_at is not null and resolved_by is not null
      and resolution_event_id is not null)
  )
);

create index review_reports_open_queue_idx
on public.review_reports_v1 (created_at, review_id)
where status = 'open';
create index review_reports_review_history_idx
on public.review_reports_v1 (review_id, created_at desc, id desc);

create table public.review_moderation_operations_v1 (
  admin_id uuid not null references public.admin_accounts(user_id) on delete restrict,
  operation_id uuid not null,
  review_id uuid not null references public.reviews(id) on delete restrict,
  target_status text not null check (target_status in ('published', 'hidden', 'removed')),
  reason text not null check (reason = trim(reason) and char_length(reason) between 1 and 4000),
  previous_status text check (previous_status in ('published', 'hidden')),
  status_event_id bigint unique references public.review_status_events_v1(id) on delete restrict,
  resolved_report_count integer check (resolved_report_count is null or resolved_report_count >= 0),
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  primary key (admin_id, operation_id),
  constraint review_moderation_operation_completion_check check (
    (completed_at is null and previous_status is null and status_event_id is null
      and resolved_report_count is null)
    or
    (completed_at is not null and previous_status is not null and status_event_id is not null
      and resolved_report_count is not null)
  )
);

alter table public.review_replies_v1 enable row level security;
alter table public.review_reply_operations_v1 enable row level security;
alter table public.review_reports_v1 enable row level security;
alter table public.review_moderation_operations_v1 enable row level security;

revoke all on public.review_replies_v1 from public, anon, authenticated;
revoke all on public.review_reply_operations_v1 from public, anon, authenticated;
revoke all on public.review_reports_v1 from public, anon, authenticated;
revoke all on public.review_moderation_operations_v1 from public, anon, authenticated;
grant all on public.review_replies_v1 to service_role;
grant all on public.review_reply_operations_v1 to service_role;
grant all on public.review_reports_v1 to service_role;
grant all on public.review_moderation_operations_v1 to service_role;

create or replace function public.protect_review_reply_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.review_reply_maintenance_v1', true) is distinct from 'on' then
      raise exception 'Review replies cannot be physically deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Published review replies are immutable' using errcode = '42501';
  end if;
  if current_setting('app.review_reply_submission_v1_mutation', true) is distinct from 'on'
     or new.content is distinct from trim(new.content)
     or not exists (
       select 1 from public.reviews review
       where review.id = new.review_id
         and review.review_direction = 'client_to_provider'
         and review.target_id = new.provider_id
     ) then
    raise exception 'Review replies must use the trusted submission workflow'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger protect_review_reply_v1
before insert or update or delete on public.review_replies_v1
for each row execute function public.protect_review_reply_v1();

create or replace function public.protect_review_report_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.review_report_maintenance_v1', true) is distinct from 'on' then
      raise exception 'Review reports cannot be physically deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if current_setting('app.review_report_submission_v1_mutation', true) is distinct from 'on' then
      raise exception 'Review reports must use the trusted reporting workflow'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if current_setting('app.review_report_resolution_v1_mutation', true) is distinct from 'on'
     or old.status <> 'open' or new.status = 'open'
     or new.id is distinct from old.id
     or new.review_id is distinct from old.review_id
     or new.reporter_id is distinct from old.reporter_id
     or new.operation_id is distinct from old.operation_id
     or new.reason_code is distinct from old.reason_code
     or new.explanation is distinct from old.explanation
     or new.created_at is distinct from old.created_at then
    raise exception 'Review reports are immutable outside trusted resolution'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger protect_review_report_v1
before insert or update or delete on public.review_reports_v1
for each row execute function public.protect_review_report_v1();

revoke all on function public.protect_review_reply_v1() from public, anon, authenticated;
revoke all on function public.protect_review_report_v1() from public, anon, authenticated;

alter table public.notifications drop constraint notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check
check (event_type in (
  'new_message', 'booking_request', 'offer_received', 'mission_confirmed',
  'cancellation_requested', 'mission_cancelled', 'mission_completed',
  'payment_confirmed', 'refund_completed', 'verification_approved',
  'verification_rejected', 'proposal_not_selected',
  'service_provider_completed', 'service_confirmation_requested',
  'service_release_reminder', 'service_funds_released',
  'service_problem_reported', 'service_problem_resolved',
  'review_received', 'review_reply_received', 'review_moderation_decided'
));

alter table public.notifications drop constraint notifications_source_table_check;
alter table public.notifications add constraint notifications_source_table_check
check (source_table in (
  'messages', 'booking_notifications', 'missions', 'payments',
  'professional_verification_reviews', 'checkout_v2_awards',
  'service_executions_v2', 'fund_releases_v2', 'workflow_transition_events',
  'reviews', 'review_replies_v1', 'review_status_events_v1'
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
        'service_problem_reported', 'service_problem_resolved',
        'review_received', 'review_reply_received', 'review_moderation_decided'
      ) then coalesce(p_user.notif_booking_updates, true)
      else true
    end
$$;

create or replace function public.notify_reviewer_of_reply_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_review public.reviews%rowtype;
begin
  select * into v_review from public.reviews where id = new.review_id;
  if found then
    perform public.enqueue_notification(
      v_review.reviewer_id,
      'review_reply_received',
      'New response to your review',
      'The professional published a response to your Glossed review.',
      'review_replies_v1',
      new.id::text,
      'review',
      new.review_id,
      jsonb_build_object(
        'review_id', new.review_id,
        'path', '/profile/' || v_review.target_id::text
      ),
      'review-reply-received:' || new.id::text
    );
  end if;
  return new;
end
$$;

create trigger notify_reviewer_of_reply_v1
after insert on public.review_replies_v1
for each row execute function public.notify_reviewer_of_reply_v1();

revoke all on function public.notify_reviewer_of_reply_v1()
from public, anon, authenticated;

create or replace function public.submit_review_reply_v1(
  p_operation_id uuid,
  p_review_id uuid,
  p_content text
)
returns table (
  reply_id uuid,
  review_id uuid,
  content text,
  created_at timestamptz,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider_id uuid := auth.uid();
  v_content text := nullif(trim(p_content), '');
  v_operation public.review_reply_operations_v1%rowtype;
  v_review public.reviews%rowtype;
  v_reply public.review_replies_v1%rowtype;
begin
  if v_provider_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_operation_id is null or p_review_id is null then
    raise exception 'operation_id and review_id are required' using errcode = '22023';
  end if;
  if v_content is null or char_length(v_content) > 2000 then
    raise exception 'reply must contain between 1 and 2000 characters'
      using errcode = '22023';
  end if;

  insert into public.review_reply_operations_v1 (
    provider_id, operation_id, review_id, content
  ) values (v_provider_id, p_operation_id, p_review_id, v_content)
  on conflict (provider_id, operation_id) do nothing;

  select * into v_operation
  from public.review_reply_operations_v1
  where provider_id = v_provider_id and operation_id = p_operation_id
  for update;

  if v_operation.review_id <> p_review_id or v_operation.content <> v_content then
    raise exception 'operation_id was already used with a different reply request'
      using errcode = '23505';
  end if;
  if v_operation.completed_at is not null then
    select * into v_reply from public.review_replies_v1 where id = v_operation.reply_id;
    if not found then
      raise exception 'Completed reply operation has no retained reply' using errcode = 'P0002';
    end if;
    return query select v_reply.id, v_reply.review_id, v_reply.content,
      v_reply.created_at, true;
    return;
  end if;

  select * into v_review from public.reviews where id = p_review_id for update;
  if not found
     or v_review.review_direction <> 'client_to_provider'
     or v_review.target_id <> v_provider_id then
    raise exception 'Only the reviewed professional may reply' using errcode = '42501';
  end if;
  if v_review.status <> 'published' then
    raise exception 'Only a published review may receive a reply' using errcode = '23514';
  end if;
  if exists (select 1 from public.review_replies_v1 reply where reply.review_id = p_review_id) then
    raise exception 'This review already has a provider reply' using errcode = '23505';
  end if;

  perform set_config('app.review_reply_submission_v1_mutation', 'on', true);
  insert into public.review_replies_v1 (review_id, provider_id, content)
  values (p_review_id, v_provider_id, v_content)
  returning * into v_reply;
  perform set_config('app.review_reply_submission_v1_mutation', 'off', true);

  update public.review_reply_operations_v1
  set reply_id = v_reply.id, completed_at = clock_timestamp()
  where provider_id = v_provider_id and operation_id = p_operation_id;

  return query select v_reply.id, v_reply.review_id, v_reply.content,
    v_reply.created_at, false;
end
$$;

revoke all on function public.submit_review_reply_v1(uuid, uuid, text)
from public, anon;
grant execute on function public.submit_review_reply_v1(uuid, uuid, text)
to authenticated;

create or replace function public.report_review_v1(
  p_operation_id uuid,
  p_review_id uuid,
  p_reason_code text,
  p_explanation text default null
)
returns table (
  report_id uuid,
  review_id uuid,
  reason_code text,
  status text,
  created_at timestamptz,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reporter_id uuid := auth.uid();
  v_reason_code text := lower(trim(coalesce(p_reason_code, '')));
  v_explanation text := nullif(trim(p_explanation), '');
  v_review public.reviews%rowtype;
  v_report public.review_reports_v1%rowtype;
begin
  if v_reporter_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_operation_id is null or p_review_id is null then
    raise exception 'operation_id and review_id are required' using errcode = '22023';
  end if;
  if v_reason_code not in (
    'abusive_or_hateful', 'personal_or_sensitive_info',
    'spam_or_commercial', 'off_topic_or_misleading', 'other'
  ) then
    raise exception 'Invalid review report reason' using errcode = '22023';
  end if;
  if v_explanation is not null and char_length(v_explanation) > 1000 then
    raise exception 'report explanation must not exceed 1000 characters'
      using errcode = '22023';
  end if;
  if v_reason_code = 'other' and v_explanation is null then
    raise exception 'An explanation is required for other reports' using errcode = '22023';
  end if;

  select * into v_report from public.review_reports_v1
  where reporter_id = v_reporter_id and operation_id = p_operation_id
  for update;
  if found then
    if v_report.review_id <> p_review_id
       or v_report.reason_code <> v_reason_code
       or v_report.explanation is distinct from v_explanation then
      raise exception 'operation_id was already used with a different report request'
        using errcode = '23505';
    end if;
    return query select v_report.id, v_report.review_id, v_report.reason_code,
      v_report.status, v_report.created_at, true;
    return;
  end if;

  select * into v_review from public.reviews where id = p_review_id for update;
  if not found or v_review.review_direction <> 'client_to_provider' then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;

  select * into v_report from public.review_reports_v1
  where reporter_id = v_reporter_id and operation_id = p_operation_id
  for update;
  if found then
    if v_report.review_id <> p_review_id
       or v_report.reason_code <> v_reason_code
       or v_report.explanation is distinct from v_explanation then
      raise exception 'operation_id was already used with a different report request'
        using errcode = '23505';
    end if;
    return query select v_report.id, v_report.review_id, v_report.reason_code,
      v_report.status, v_report.created_at, true;
    return;
  end if;

  if v_review.status <> 'published' then
    raise exception 'Only a published review may be reported' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.review_reports_v1 report
    where report.review_id = p_review_id and report.reporter_id = v_reporter_id
  ) then
    raise exception 'This user already reported the review' using errcode = '23505';
  end if;

  perform set_config('app.review_report_submission_v1_mutation', 'on', true);
  insert into public.review_reports_v1 (
    review_id, reporter_id, operation_id, reason_code, explanation
  ) values (
    p_review_id, v_reporter_id, p_operation_id, v_reason_code, v_explanation
  ) returning * into v_report;
  perform set_config('app.review_report_submission_v1_mutation', 'off', true);

  return query select v_report.id, v_report.review_id, v_report.reason_code,
    v_report.status, v_report.created_at, false;
end
$$;

revoke all on function public.report_review_v1(uuid, uuid, text, text)
from public, anon;
grant execute on function public.report_review_v1(uuid, uuid, text, text)
to authenticated;

drop function public.get_public_reviews(uuid, integer, timestamptz, uuid);
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
  verified_glossed_service boolean,
  provider_reply text,
  provider_replied_at timestamptz
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
    reviewer.username, reviewer.profile_photo, true,
    reply.content, reply.published_at
  from public.reviews review
  join public.users reviewer on reviewer.id = review.reviewer_id
  join public.users target on target.id = review.target_id
  left join public.review_replies_v1 reply on reply.review_id = review.id
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

create or replace function public.admin_get_reputation_moderation_counts()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  perform public.assert_admin_permission('reputation.read');
  select jsonb_build_object(
    'open', count(distinct report.review_id) filter (where report.status = 'open'),
    'history', count(distinct report.review_id) filter (
      where not exists (
        select 1 from public.review_reports_v1 open_report
        where open_report.review_id = report.review_id and open_report.status = 'open'
      )
    )
  ) into v_result
  from public.review_reports_v1 report;
  perform public.record_admin_read_audit(
    'reputation.counts', 'review_moderation_collection', null, '{}'::jsonb
  );
  return v_result;
end
$$;

create or replace function public.admin_list_reported_reviews(
  p_view text default 'open',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  perform public.assert_admin_permission('reputation.read');
  if p_view not in ('open', 'history') or p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'Invalid reputation moderation pagination' using errcode = '22023';
  end if;

  with grouped as (
    select review.id as review_id, review.status as review_status,
      review.rating, review.comment, review.created_at as review_created_at,
      reviewer.username as reviewer_name,
      coalesce(provider.business_name, provider.username) as provider_name,
      count(*) as report_count,
      count(*) filter (where report.status = 'open') as open_report_count,
      min(report.created_at) as first_reported_at,
      max(report.created_at) as last_reported_at,
      reply.content as provider_reply
    from public.review_reports_v1 report
    join public.reviews review on review.id = report.review_id
    join public.users reviewer on reviewer.id = review.reviewer_id
    join public.users provider on provider.id = review.target_id
    left join public.review_replies_v1 reply on reply.review_id = review.id
    group by review.id, review.status, review.rating, review.comment, review.created_at,
      reviewer.username, provider.business_name, provider.username, reply.content
  ), filtered as (
    select grouped.*, count(*) over() as total_count
    from grouped
    where (p_view = 'open' and grouped.open_report_count > 0)
       or (p_view = 'history' and grouped.open_report_count = 0)
  ), page as (
    select * from filtered
    order by last_reported_at desc, review_id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'view', p_view,
    'total', coalesce(max(total_count), 0),
    'limit', p_limit,
    'offset', p_offset,
    'items', coalesce(jsonb_agg(to_jsonb(page) - 'total_count'
      order by last_reported_at desc, review_id), '[]'::jsonb)
  ) into v_result from page;

  perform public.record_admin_read_audit(
    'reputation.list', 'review_moderation_collection', null,
    jsonb_build_object('view', p_view, 'limit', p_limit, 'offset', p_offset)
  );
  return v_result;
end
$$;

create or replace function public.admin_get_reported_review_detail(p_review_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  perform public.assert_admin_permission('reputation.read');
  if not exists (
    select 1 from public.review_reports_v1 report where report.review_id = p_review_id
  ) then
    raise exception 'Reported review not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'review', jsonb_build_object(
      'id', review.id, 'rating', review.rating, 'comment', review.comment,
      'status', review.status, 'created_at', review.created_at,
      'status_changed_at', review.status_changed_at
    ),
    'reply', case when reply.id is null then null else jsonb_build_object(
      'content', reply.content, 'published_at', reply.published_at
    ) end,
    'author', jsonb_build_object(
      'id', reviewer.id, 'username', reviewer.username, 'email', reviewer.email
    ),
    'provider', jsonb_build_object(
      'id', provider.id, 'username', provider.username,
      'business_name', provider.business_name, 'email', provider.email
    ),
    'service_context', jsonb_build_object(
      'mission_id', mission.id, 'service', mission.service, 'date', mission.date,
      'mission_status', mission.status,
      'delivery_outcome', outcome.outcome, 'outcome_source', outcome.source,
      'outcome_recorded_at', outcome.recorded_at
    ),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', report.id, 'reporter_id', report.reporter_id,
        'reporter_username', reporter.username, 'reporter_email', reporter.email,
        'reason_code', report.reason_code, 'explanation', report.explanation,
        'status', report.status, 'created_at', report.created_at,
        'resolved_at', report.resolved_at, 'resolved_by', report.resolved_by,
        'resolution_event_id', report.resolution_event_id
      ) order by report.created_at, report.id)
      from public.review_reports_v1 report
      join public.users reporter on reporter.id = report.reporter_id
      where report.review_id = review.id
    ), '[]'::jsonb),
    'status_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id, 'event_type', event.event_type,
        'actor_type', event.actor_type, 'actor_user_id', event.actor_user_id,
        'reason', event.reason, 'metadata', event.metadata,
        'created_at', event.created_at
      ) order by event.created_at, event.id)
      from public.review_status_events_v1 event where event.review_id = review.id
    ), '[]'::jsonb)
  ) into v_result
  from public.reviews review
  join public.users reviewer on reviewer.id = review.reviewer_id
  join public.users provider on provider.id = review.target_id
  join public.missions mission on mission.id = review.mission_id
  left join public.review_replies_v1 reply on reply.review_id = review.id
  left join public.service_delivery_outcomes_v1 outcome on outcome.mission_id = mission.id
  where review.id = p_review_id;

  perform public.record_admin_read_audit(
    'reputation.detail', 'review', p_review_id::text, '{}'::jsonb
  );
  return v_result;
end
$$;

create or replace function public.admin_moderate_review_v1(
  p_operation_id uuid,
  p_review_id uuid,
  p_target_status text,
  p_reason text
)
returns table (
  review_id uuid,
  status text,
  resolved_report_count integer,
  status_event_id bigint,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_target_status text := lower(trim(coalesce(p_target_status, '')));
  v_reason text := nullif(trim(p_reason), '');
  v_operation public.review_moderation_operations_v1%rowtype;
  v_review public.reviews%rowtype;
  v_event_id bigint;
  v_open_count integer;
  v_resolved_status text;
  v_notification_body text;
  v_recipient_id uuid;
begin
  perform public.assert_admin_permission('reputation.moderate');
  if p_operation_id is null or p_review_id is null then
    raise exception 'operation_id and review_id are required' using errcode = '22023';
  end if;
  if v_target_status not in ('published', 'hidden', 'removed') then
    raise exception 'Invalid review moderation status' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) > 4000 then
    raise exception 'A moderation reason between 1 and 4000 characters is required'
      using errcode = '22023';
  end if;

  insert into public.review_moderation_operations_v1 (
    admin_id, operation_id, review_id, target_status, reason
  ) values (v_admin_id, p_operation_id, p_review_id, v_target_status, v_reason)
  on conflict (admin_id, operation_id) do nothing;

  select * into v_operation
  from public.review_moderation_operations_v1
  where admin_id = v_admin_id and operation_id = p_operation_id
  for update;

  if v_operation.review_id <> p_review_id
     or v_operation.target_status <> v_target_status
     or v_operation.reason <> v_reason then
    raise exception 'operation_id was already used with a different moderation request'
      using errcode = '23505';
  end if;
  if v_operation.completed_at is not null then
    return query select v_operation.review_id, v_operation.target_status,
      v_operation.resolved_report_count, v_operation.status_event_id, true;
    return;
  end if;

  select * into v_review from public.reviews where id = p_review_id for update;
  if not found or v_review.review_direction <> 'client_to_provider' then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
  if v_review.status = 'removed' then
    raise exception 'Removed reviews are terminal' using errcode = '23514';
  end if;

  select count(*) into v_open_count from public.review_reports_v1 report
  where report.review_id = p_review_id and report.status = 'open';

  if not (
    (v_review.status = 'published' and v_target_status in ('hidden', 'removed'))
    or (v_review.status = 'hidden' and v_target_status in ('published', 'removed'))
    or (v_review.status = 'published' and v_target_status = 'published' and v_open_count > 0)
  ) then
    raise exception 'Review moderation transition is not allowed' using errcode = '23514';
  end if;

  if v_review.status <> v_target_status then
    perform set_config('app.review_moderation_v1_mutation', 'on', true);
    update public.reviews
    set status = v_target_status, status_changed_at = clock_timestamp()
    where id = p_review_id;
    perform set_config('app.review_moderation_v1_mutation', 'off', true);
  end if;

  insert into public.review_status_events_v1 (
    review_id, event_type, actor_type, actor_user_id, reason,
    metadata, deduplication_key
  ) values (
    p_review_id, v_target_status, 'administrator', v_admin_id, v_reason,
    jsonb_build_object(
      'operation_id', p_operation_id,
      'previous_status', v_review.status,
      'target_status', v_target_status,
      'open_report_count', v_open_count
    ),
    'review-moderation:' || v_admin_id::text || ':' || p_operation_id::text
  ) returning id into v_event_id;

  v_resolved_status := case v_target_status
    when 'published' then 'resolved_kept'
    when 'hidden' then 'resolved_hidden'
    else 'resolved_removed'
  end;
  perform set_config('app.review_report_resolution_v1_mutation', 'on', true);
  update public.review_reports_v1 report
  set status = v_resolved_status, updated_at = clock_timestamp(),
    resolved_at = clock_timestamp(), resolved_by = v_admin_id,
    resolution_event_id = v_event_id
  where report.review_id = p_review_id and report.status = 'open';
  get diagnostics v_open_count = row_count;
  perform set_config('app.review_report_resolution_v1_mutation', 'off', true);

  update public.review_moderation_operations_v1
  set previous_status = v_review.status, status_event_id = v_event_id,
    resolved_report_count = v_open_count, completed_at = clock_timestamp()
  where admin_id = v_admin_id and operation_id = p_operation_id;

  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    reason, before_state, after_state, evidence, session_id,
    mfa_authenticated_at, deduplication_key
  ) values (
    v_admin_id, 'review_moderated', 'review', p_review_id::text,
    'reputation.moderate.' || v_target_status, 'success', v_reason,
    jsonb_build_object('status', v_review.status),
    jsonb_build_object('status', v_target_status),
    jsonb_build_object(
      'operation_id', p_operation_id,
      'status_event_id', v_event_id,
      'resolved_report_count', v_open_count
    ),
    auth.jwt() ->> 'session_id', public.admin_current_mfa_authenticated_at(),
    'review-moderation:' || v_admin_id::text || ':' || p_operation_id::text
  );

  v_notification_body := case v_target_status
    when 'published' then 'A reported review was reviewed and remains published.'
    when 'hidden' then 'A review was hidden following a moderation decision.'
    else 'A review was removed following a moderation decision.'
  end;
  for v_recipient_id in
    select distinct concerned.recipient_id
    from (
      values (v_review.reviewer_id), (v_review.target_id)
      union all
      select report.reporter_id
      from public.review_reports_v1 report
      where report.review_id = p_review_id
        and report.resolution_event_id = v_event_id
    ) concerned(recipient_id)
    where concerned.recipient_id is not null
  loop
    perform public.enqueue_notification(
      v_recipient_id, 'review_moderation_decided', 'Review moderation update',
      v_notification_body, 'review_status_events_v1', v_event_id::text,
      'review', p_review_id,
      jsonb_build_object(
        'review_id', p_review_id,
        'path', '/profile/' || v_review.target_id::text
      ),
      'review-moderation:' || v_event_id::text || ':' || v_recipient_id::text
    );
  end loop;

  return query select p_review_id, v_target_status, v_open_count, v_event_id, false;
end
$$;

revoke all on function public.admin_get_reputation_moderation_counts()
from public, anon;
revoke all on function public.admin_list_reported_reviews(text, integer, integer)
from public, anon;
revoke all on function public.admin_get_reported_review_detail(uuid)
from public, anon;
revoke all on function public.admin_moderate_review_v1(uuid, uuid, text, text)
from public, anon;
grant execute on function public.admin_get_reputation_moderation_counts()
to authenticated;
grant execute on function public.admin_list_reported_reviews(text, integer, integer)
to authenticated;
grant execute on function public.admin_get_reported_review_detail(uuid)
to authenticated;
grant execute on function public.admin_moderate_review_v1(uuid, uuid, text, text)
to authenticated;

commit;
