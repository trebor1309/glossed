-- Persistent, idempotent in-app notifications and transactional-email outbox.
-- Existing unread work is backfilled without creating retroactive email jobs.

begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'new_message',
    'booking_request',
    'offer_received',
    'mission_confirmed',
    'cancellation_requested',
    'mission_cancelled',
    'mission_completed',
    'payment_confirmed',
    'refund_completed',
    'verification_approved',
    'verification_rejected'
  )),
  title text not null check (length(title) between 1 and 160),
  body text not null check (length(body) between 1 and 2000),
  source_table text not null check (source_table in (
    'messages',
    'booking_notifications',
    'missions',
    'payments',
    'professional_verification_reviews'
  )),
  source_id text not null,
  entity_type text not null check (entity_type in (
    'chat', 'booking', 'mission', 'payment', 'verification'
  )),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  deduplication_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, event_type, created_at desc)
  where read_at is null;
create index notifications_source_idx
  on public.notifications (source_table, source_id);

alter table public.notifications replica identity full;
alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;

create policy notifications_select_own
on public.notifications for select
to authenticated
using (recipient_id = auth.uid());

create table public.notification_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique
    references public.notifications(id) on delete cascade,
  recipient_email text,
  status text not null default 'pending' check (status in (
    'pending', 'processing', 'failed', 'sent', 'skipped', 'dead'
  )),
  attempts integer not null default 0 check (attempts between 0 and 5),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  lock_token uuid,
  provider_message_id text unique,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_email_recipient_required check (
    status = 'skipped' or recipient_email is not null
  ),
  constraint notification_email_lock_consistent check (
    (status = 'processing' and locked_at is not null and lock_token is not null)
    or (status <> 'processing' and locked_at is null and lock_token is null)
  )
);

create index notification_email_deliveries_ready_idx
  on public.notification_email_deliveries (available_at, created_at)
  where status in ('pending', 'failed');

alter table public.notification_email_deliveries enable row level security;
revoke all on public.notification_email_deliveries from public, anon, authenticated;
grant all on public.notification_email_deliveries to service_role;

create or replace function public.enqueue_notification(
  p_recipient_id uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_source_table text,
  p_source_id text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb,
  p_deduplication_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notification_id uuid;
begin
  if p_recipient_id is null then
    return null;
  end if;

  insert into public.notifications (
    recipient_id,
    event_type,
    title,
    body,
    source_table,
    source_id,
    entity_type,
    entity_id,
    metadata,
    deduplication_key
  ) values (
    p_recipient_id,
    p_event_type,
    p_title,
    p_body,
    p_source_table,
    p_source_id,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb),
    p_deduplication_key
  )
  on conflict (deduplication_key) do nothing
  returning id into v_notification_id;

  if v_notification_id is null then
    select id into v_notification_id
    from public.notifications
    where deduplication_key = p_deduplication_key;
  end if;

  return v_notification_id;
end
$$;

revoke all on function public.enqueue_notification(
  uuid, text, text, text, text, text, text, uuid, jsonb, text
) from public, anon, authenticated;

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
        'refund_completed'
      ) then coalesce(p_user.notif_booking_updates, true)
      else true
    end
$$;

revoke all on function public.notification_email_preference_enabled(public.users, text)
from public, anon, authenticated;

create or replace function public.queue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users%rowtype;
  v_enabled boolean;
begin
  select * into v_user from public.users where id = new.recipient_id;
  v_enabled := found
    and v_user.email is not null
    and public.notification_email_preference_enabled(v_user, new.event_type);

  insert into public.notification_email_deliveries (
    notification_id,
    recipient_email,
    status,
    available_at
  ) values (
    new.id,
    v_user.email,
    case when v_enabled then 'pending' else 'skipped' end,
    case when new.event_type = 'new_message' then now() + interval '5 minutes' else now() end
  );

  return new;
end
$$;

revoke all on function public.queue_notification_email() from public, anon, authenticated;

-- Backfill visible outstanding work before enabling email queue creation.
insert into public.notifications (
  recipient_id, event_type, title, body, source_table, source_id,
  entity_type, entity_id, metadata, deduplication_key, created_at
)
select
  case when m.sender_id = c.client_id then c.pro_id else c.client_id end,
  'new_message',
  'New message',
  'You have a new unread message in Glossed.',
  'messages',
  m.id::text,
  'chat',
  m.chat_id,
  jsonb_build_object(
    'chat_id', m.chat_id,
    'sender_id', m.sender_id,
    'path', case
      when m.sender_id = c.client_id then '/prodashboard/messages/' || m.chat_id::text
      else '/dashboard/messages/' || m.chat_id::text
    end
  ),
  'message:' || m.id::text,
  m.created_at
from public.messages m
join public.chats c on c.id = m.chat_id
where m.read_at is null
  and m.sender_id in (c.client_id, c.pro_id)
on conflict (deduplication_key) do nothing;

insert into public.notifications (
  recipient_id, event_type, title, body, source_table, source_id,
  entity_type, entity_id, metadata, deduplication_key, created_at
)
select
  bn.pro_id,
  'booking_request',
  'New booking request',
  'A new booking request is waiting for your review.',
  'booking_notifications',
  bn.id::text,
  'booking',
  bn.booking_id,
  jsonb_build_object('booking_id', bn.booking_id, 'path', '/prodashboard/missions'),
  'booking-request:' || bn.id::text,
  bn.created_at
from public.booking_notifications bn
join public.bookings b on b.id = bn.booking_id
where b.status in ('pending', 'offers')
on conflict (deduplication_key) do nothing;

insert into public.notifications (
  recipient_id, event_type, title, body, source_table, source_id,
  entity_type, entity_id, metadata, deduplication_key, created_at
)
select
  m.client_id,
  'offer_received',
  'New offer received',
  'A professional sent you an offer for ' || m.service || '.',
  'missions',
  m.id::text,
  case when m.booking_id is null then 'mission' else 'booking' end,
  coalesce(m.booking_id, m.id),
  jsonb_build_object(
    'mission_id', m.id,
    'booking_id', m.booking_id,
    'status', m.status,
    'path', '/dashboard/reservations'
  ),
  'mission:' || m.id::text || ':proposed:' || m.client_id::text,
  m.created_at
from public.missions m
where m.status = 'proposed'
on conflict (deduplication_key) do nothing;

create trigger trg_queue_notification_email
after insert on public.notifications
for each row execute function public.queue_notification_email();

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_chat public.chats%rowtype;
  v_recipient_id uuid;
  v_path text;
begin
  if new.read_at is not null then
    return new;
  end if;

  select * into v_chat from public.chats where id = new.chat_id;
  if not found or new.sender_id not in (v_chat.client_id, v_chat.pro_id) then
    return new;
  end if;

  if new.sender_id = v_chat.client_id then
    v_recipient_id := v_chat.pro_id;
    v_path := '/prodashboard/messages/' || new.chat_id::text;
  else
    v_recipient_id := v_chat.client_id;
    v_path := '/dashboard/messages/' || new.chat_id::text;
  end if;

  perform public.enqueue_notification(
    v_recipient_id,
    'new_message',
    'New message',
    'You have a new unread message in Glossed.',
    'messages',
    new.id::text,
    'chat',
    new.chat_id,
    jsonb_build_object(
      'chat_id', new.chat_id,
      'sender_id', new.sender_id,
      'path', v_path
    ),
    'message:' || new.id::text
  );

  return new;
end
$$;

revoke all on function public.notify_new_message() from public, anon, authenticated;

create trigger trg_notify_new_message
after insert on public.messages
for each row execute function public.notify_new_message();

create or replace function public.mark_message_notification_read()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.read_at is null and new.read_at is not null then
    update public.notifications
    set read_at = new.read_at
    where source_table = 'messages'
      and source_id = new.id::text
      and read_at is null;

    update public.notification_email_deliveries d
    set status = 'skipped', updated_at = now()
    from public.notifications n
    where n.source_table = 'messages'
      and n.source_id = new.id::text
      and d.notification_id = n.id
      and d.status in ('pending', 'failed');
  end if;
  return new;
end
$$;

revoke all on function public.mark_message_notification_read() from public, anon, authenticated;

create trigger trg_mark_message_notification_read
after update of read_at on public.messages
for each row execute function public.mark_message_notification_read();

create or replace function public.notify_booking_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service text;
begin
  select service into v_service from public.bookings where id = new.booking_id;

  perform public.enqueue_notification(
    new.pro_id,
    'booking_request',
    'New booking request',
    'A new ' || coalesce(v_service, 'service') || ' request is waiting for your review.',
    'booking_notifications',
    new.id::text,
    'booking',
    new.booking_id,
    jsonb_build_object('booking_id', new.booking_id, 'path', '/prodashboard/missions'),
    'booking-request:' || new.id::text
  );
  return new;
end
$$;

revoke all on function public.notify_booking_request() from public, anon, authenticated;

create trigger trg_notify_booking_request
after insert on public.booking_notifications
for each row execute function public.notify_booking_request();

create or replace function public.notify_mission_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_type text;
  v_title text;
  v_body text;
  v_recipient_id uuid;
  v_path text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'proposed' then
      return new;
    end if;
    perform public.enqueue_notification(
      new.client_id,
      'offer_received',
      'New offer received',
      'A professional sent you an offer for ' || new.service || '.',
      'missions',
      new.id::text,
      case when new.booking_id is null then 'mission' else 'booking' end,
      coalesce(new.booking_id, new.id),
      jsonb_build_object(
        'mission_id', new.id,
        'booking_id', new.booking_id,
        'status', new.status,
        'path', '/dashboard/reservations'
      ),
      'mission:' || new.id::text || ':proposed:' || new.client_id::text
    );
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'confirmed' then
    v_event_type := 'mission_confirmed';
    v_title := 'Booking confirmed';
    v_body := 'The booking for ' || new.service || ' is confirmed.';
  elsif new.status = 'cancel_requested' then
    v_event_type := 'cancellation_requested';
    v_title := 'Cancellation requested';
    v_body := 'A cancellation was requested for ' || new.service || '.';
  elsif new.status = 'cancelled' then
    v_event_type := 'mission_cancelled';
    v_title := 'Booking cancelled';
    v_body := 'The booking for ' || new.service || ' was cancelled.';
  elsif new.status = 'completed' then
    v_event_type := 'mission_completed';
    v_title := 'Mission completed';
    v_body := 'The mission for ' || new.service || ' was marked as completed.';
  else
    return new;
  end if;

  for v_recipient_id, v_path in
    select new.client_id, '/dashboard/reservations'
    union all
    select new.pro_id, '/prodashboard/missions'
  loop
    if v_recipient_id is not null then
      perform public.enqueue_notification(
        v_recipient_id,
        v_event_type,
        v_title,
        v_body,
        'missions',
        new.id::text,
        'mission',
        new.id,
        jsonb_build_object(
          'mission_id', new.id,
          'booking_id', new.booking_id,
          'status', new.status,
          'path', v_path
        ),
        'mission:' || new.id::text || ':status:' || new.status || ':' || v_recipient_id::text
      );
    end if;
  end loop;

  return new;
end
$$;

revoke all on function public.notify_mission_change() from public, anon, authenticated;

create trigger trg_notify_mission_insert
after insert on public.missions
for each row execute function public.notify_mission_change();

create trigger trg_notify_mission_status
after update of status on public.missions
for each row execute function public.notify_mission_change();

create or replace function public.notify_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_type text;
  v_title text;
  v_body text;
  v_recipient_id uuid;
  v_path text;
  v_dedupe_status text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'paid' then return new; end if;
  elsif new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'paid' then
    v_event_type := 'payment_confirmed';
    v_title := 'Payment confirmed';
    v_body := 'Your Glossed payment was recorded successfully.';
    v_dedupe_status := 'paid';
  elsif new.status in ('refunded', 'partially_refunded') then
    v_event_type := 'refund_completed';
    v_title := case when new.status = 'refunded' then 'Refund completed' else 'Partial refund completed' end;
    v_body := case
      when new.status = 'refunded' then 'The Glossed payment was refunded.'
      else 'The Glossed payment was partially refunded.'
    end;
    v_dedupe_status := coalesce(new.stripe_refund_id, new.status);
  else
    return new;
  end if;

  for v_recipient_id, v_path in
    select new.client_id, '/dashboard/payments'
    union all
    select new.pro_id, '/prodashboard/payments'
  loop
    if v_recipient_id is not null then
      perform public.enqueue_notification(
        v_recipient_id,
        v_event_type,
        v_title,
        v_body,
        'payments',
        new.id::text,
        'payment',
        new.id,
        jsonb_build_object(
          'payment_id', new.id,
          'mission_id', new.mission_id,
          'status', new.status,
          'path', v_path
        ),
        'payment:' || new.id::text || ':' || v_dedupe_status || ':' || v_recipient_id::text
      );
    end if;
  end loop;

  return new;
end
$$;

revoke all on function public.notify_payment_change() from public, anon, authenticated;

create trigger trg_notify_payment_insert
after insert on public.payments
for each row execute function public.notify_payment_change();

create trigger trg_notify_payment_status
after update of status on public.payments
for each row execute function public.notify_payment_change();

create or replace function public.notify_verification_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.enqueue_notification(
    new.professional_id,
    case when new.decision = 'verified' then 'verification_approved' else 'verification_rejected' end,
    case when new.decision = 'verified' then 'Verification approved' else 'Verification rejected' end,
    case
      when new.decision = 'verified' then 'Your professional verification was approved.'
      else 'Your professional verification was rejected. Open your settings to review the reason.'
    end,
    'professional_verification_reviews',
    new.id::text,
    'verification',
    new.professional_id,
    jsonb_build_object(
      'decision', new.decision,
      'reason', new.reason,
      'path', '/prodashboard/settings'
    ),
    'verification-review:' || new.id::text
  );
  return new;
end
$$;

revoke all on function public.notify_verification_review() from public, anon, authenticated;

create trigger trg_notify_verification_review
after insert on public.professional_verification_reviews
for each row execute function public.notify_verification_review();

create or replace function public.get_notification_summary()
returns table (
  unread_total bigint,
  unread_messages bigint,
  client_offers bigint,
  pro_bookings bigint,
  pro_cancellations bigint,
  payments bigint,
  verifications bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return query
  select
    count(*) filter (where n.read_at is null),
    count(*) filter (where n.read_at is null and n.event_type = 'new_message'),
    count(*) filter (where n.read_at is null and n.event_type = 'offer_received'),
    count(*) filter (where n.read_at is null and n.event_type = 'booking_request'),
    count(*) filter (where n.read_at is null and n.event_type in (
      'cancellation_requested', 'mission_cancelled'
    )),
    count(*) filter (where n.read_at is null and n.event_type in (
      'payment_confirmed', 'refund_completed'
    )),
    count(*) filter (where n.read_at is null and n.event_type in (
      'verification_approved', 'verification_rejected'
    ))
  from public.notifications n
  where n.recipient_id = v_uid;
end
$$;

revoke all on function public.get_notification_summary() from public, anon;
grant execute on function public.get_notification_summary() to authenticated;

create or replace function public.mark_notifications_read(
  p_event_types text[] default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_mark_all boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not p_mark_all and p_event_types is null and p_entity_type is null and p_entity_id is null then
    raise exception 'At least one notification filter is required' using errcode = '22023';
  end if;

  with marked as (
    update public.notifications n
    set read_at = now()
    where n.recipient_id = v_uid
      and n.read_at is null
      and (p_mark_all or p_event_types is null or n.event_type = any(p_event_types))
      and (p_mark_all or p_entity_type is null or n.entity_type = p_entity_type)
      and (p_mark_all or p_entity_id is null or n.entity_id = p_entity_id)
    returning n.id
  ), skipped as (
    update public.notification_email_deliveries d
    set status = 'skipped', updated_at = now()
    where d.notification_id in (select id from marked)
      and d.status in ('pending', 'failed')
  )
  select count(*)::integer into v_count from marked;

  return v_count;
end
$$;

revoke all on function public.mark_notifications_read(text[], text, uuid, boolean)
from public, anon;
grant execute on function public.mark_notifications_read(text[], text, uuid, boolean)
to authenticated;

create or replace function public.mark_notification_read(
  p_notification_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_marked boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_notification_id is null then
    raise exception 'Notification id is required' using errcode = '22023';
  end if;

  with marked as (
    update public.notifications n
    set read_at = coalesce(n.read_at, now())
    where n.id = p_notification_id
      and n.recipient_id = v_uid
    returning n.id
  ), skipped as (
    update public.notification_email_deliveries d
    set status = 'skipped', updated_at = now()
    where d.notification_id in (select id from marked)
      and d.status in ('pending', 'failed')
  )
  select exists(select 1 from marked) into v_marked;

  return v_marked;
end
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.claim_notification_email_deliveries(
  p_lock_token uuid,
  p_limit integer default 25
)
returns table (
  delivery_id uuid,
  notification_id uuid,
  recipient_id uuid,
  recipient_email text,
  event_type text,
  title text,
  body text,
  metadata jsonb,
  lock_token uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_lock_token is null or p_limit < 1 or p_limit > 50 then
    raise exception 'Invalid email claim parameters' using errcode = '22023';
  end if;

  -- Recover abandoned claims while keeping deliveries older than the provider's
  -- idempotency window out of automatic retries.
  update public.notification_email_deliveries d
  set status = case
        when d.attempts >= 5 or d.locked_at < now() - interval '24 hours' then 'dead'
        else 'failed'
      end,
      available_at = now(),
      locked_at = null,
      lock_token = null,
      last_error = case
        when d.locked_at < now() - interval '24 hours'
          then 'Delivery claim expired beyond provider idempotency window; manual reconciliation required'
        else 'Delivery worker claim expired before completion'
      end,
      updated_at = now()
  where d.status = 'processing'
    and d.locked_at < now() - interval '10 minutes';

  -- A notification read before delivery must not generate an email.
  update public.notification_email_deliveries d
  set status = 'skipped', updated_at = now()
  from public.notifications n
  where d.notification_id = n.id
    and n.read_at is not null
    and d.status in ('pending', 'failed');

  -- Re-evaluate preferences at delivery time.
  update public.notification_email_deliveries d
  set status = 'skipped', updated_at = now()
  from public.notifications n
  join public.users u on u.id = n.recipient_id
  where d.notification_id = n.id
    and d.status in ('pending', 'failed')
    and (
      u.email is null
      or not public.notification_email_preference_enabled(u, n.event_type)
    );

  -- Use the recipient's current address, not a stale address captured when the
  -- notification was first queued.
  update public.notification_email_deliveries d
  set recipient_email = u.email, updated_at = now()
  from public.notifications n
  join public.users u on u.id = n.recipient_id
  where d.notification_id = n.id
    and d.status in ('pending', 'failed')
    and u.email is not null
    and d.recipient_email is distinct from u.email;

  -- Collapse unread message emails per conversation to the latest message.
  update public.notification_email_deliveries d
  set status = 'skipped', updated_at = now()
  from public.notifications n
  where d.notification_id = n.id
    and d.status in ('pending', 'failed')
    and n.event_type = 'new_message'
    and exists (
      select 1
      from public.notifications newer
      join public.notification_email_deliveries newer_d
        on newer_d.notification_id = newer.id
      where newer.recipient_id = n.recipient_id
        and newer.entity_type = 'chat'
        and newer.entity_id = n.entity_id
        and newer.event_type = 'new_message'
        and newer.read_at is null
        and newer.created_at > n.created_at
        and newer_d.status in ('pending', 'failed')
    );

  return query
  with candidates as (
    select d.id
    from public.notification_email_deliveries d
    where d.status in ('pending', 'failed')
      and d.available_at <= now()
      and d.attempts < 5
      and (d.locked_at is null or d.locked_at < now() - interval '10 minutes')
    order by d.available_at, d.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.notification_email_deliveries d
    set status = 'processing',
        attempts = d.attempts + 1,
        locked_at = now(),
        lock_token = p_lock_token,
        updated_at = now()
    where d.id in (select id from candidates)
    returning d.*
  )
  select
    c.id,
    n.id,
    n.recipient_id,
    c.recipient_email,
    n.event_type,
    n.title,
    n.body,
    n.metadata,
    c.lock_token
  from claimed c
  join public.notifications n on n.id = c.notification_id
  order by c.created_at;
end
$$;

revoke all on function public.claim_notification_email_deliveries(uuid, integer)
from public, anon, authenticated;
grant execute on function public.claim_notification_email_deliveries(uuid, integer)
to service_role;

create or replace function public.complete_notification_email_delivery(
  p_delivery_id uuid,
  p_lock_token uuid,
  p_success boolean,
  p_provider_message_id text default null,
  p_error text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delivery public.notification_email_deliveries%rowtype;
  v_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select * into v_delivery
  from public.notification_email_deliveries
  where id = p_delivery_id
  for update;

  if not found then
    raise exception 'Email delivery not found' using errcode = 'P0002';
  end if;
  if v_delivery.status <> 'processing' or v_delivery.lock_token is distinct from p_lock_token then
    raise exception 'Email delivery lock is no longer valid' using errcode = '55000';
  end if;
  if p_success and nullif(btrim(p_provider_message_id), '') is null then
    raise exception 'Provider message id is required for a successful delivery'
      using errcode = '22023';
  end if;

  if p_success then
    v_status := 'sent';
    update public.notification_email_deliveries
    set status = v_status,
        provider_message_id = p_provider_message_id,
        sent_at = now(),
        last_error = null,
        locked_at = null,
        lock_token = null,
        updated_at = now()
    where id = p_delivery_id;
  else
    v_status := case when v_delivery.attempts >= 5 then 'dead' else 'failed' end;
    update public.notification_email_deliveries
    set status = v_status,
        last_error = left(coalesce(p_error, 'Unknown email delivery error'), 2000),
        available_at = case
          when v_status = 'dead' then available_at
          else now() + make_interval(mins => (2 ^ least(v_delivery.attempts, 5))::integer)
        end,
        locked_at = null,
        lock_token = null,
        updated_at = now()
    where id = p_delivery_id;
  end if;

  return v_status;
end
$$;

revoke all on function public.complete_notification_email_delivery(
  uuid, uuid, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.complete_notification_email_delivery(
  uuid, uuid, boolean, text, text
) to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

commit;
