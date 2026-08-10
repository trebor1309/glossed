\set ON_ERROR_STOP on

begin;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  end if;
end
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('60000000-0000-0000-0000-000000000010', 'notification-client@example.test',
   '{"requested_role":"client"}'::jsonb),
  ('60000000-0000-0000-0000-000000000020', 'notification-pro@example.test',
   '{"requested_role":"pro","business_name":"Notification Pro"}'::jsonb),
  ('60000000-0000-0000-0000-000000000030', 'notification-outsider@example.test',
   '{"requested_role":"client"}'::jsonb);

update public.users
set onboarding_completed = true
where id::text like '60000000-%';

insert into public.chats (id, client_id, pro_id) values (
  '60000000-0000-0000-0000-000000000100',
  '60000000-0000-0000-0000-000000000010',
  '60000000-0000-0000-0000-000000000020'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.messages (id, chat_id, sender_id, content) values (
  '60000000-0000-0000-0000-000000000110',
  '60000000-0000-0000-0000-000000000100',
  '60000000-0000-0000-0000-000000000010',
  'Persistent notification test'
);

reset role;

do $$
begin
  if (select count(*) from public.notifications
      where deduplication_key = 'message:60000000-0000-0000-0000-000000000110') <> 1 then
    raise exception 'A message did not create exactly one notification';
  end if;
  if (select recipient_id from public.notifications
      where deduplication_key = 'message:60000000-0000-0000-0000-000000000110')
     <> '60000000-0000-0000-0000-000000000020'::uuid then
    raise exception 'Message notification was assigned to the wrong recipient';
  end if;
  if (select count(*) from public.notification_email_deliveries d
      join public.notifications n on n.id = d.notification_id
      where n.deduplication_key = 'message:60000000-0000-0000-0000-000000000110'
        and d.status = 'pending') <> 1 then
    raise exception 'A new message did not create one delayed email delivery';
  end if;
end
$$;

-- Replaying the same logical event remains idempotent.
select public.enqueue_notification(
  '60000000-0000-0000-0000-000000000020',
  'new_message',
  'Duplicate',
  'Duplicate',
  'messages',
  '60000000-0000-0000-0000-000000000110',
  'chat',
  '60000000-0000-0000-0000-000000000100',
  '{}'::jsonb,
  'message:60000000-0000-0000-0000-000000000110'
);

do $$
begin
  if (select count(*) from public.notifications
      where deduplication_key = 'message:60000000-0000-0000-0000-000000000110') <> 1 then
    raise exception 'Notification deduplication failed';
  end if;
end
$$;

-- Only the recipient can see the notification.
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if (select unread_messages from public.get_notification_summary()) <> 1 then
    raise exception 'Recipient unread message summary is incorrect';
  end if;
end
$$;

update public.messages
set read_at = now()
where id = '60000000-0000-0000-0000-000000000110';

do $$
begin
  if (select unread_messages from public.get_notification_summary()) <> 0 then
    raise exception 'Reading a message did not clear its notification';
  end if;
end
$$;

reset role;

do $$
begin
  if (select d.status from public.notification_email_deliveries d
      join public.notifications n on n.id = d.notification_id
      where n.deduplication_key = 'message:60000000-0000-0000-0000-000000000110')
     <> 'skipped' then
    raise exception 'Reading a message did not suppress its pending email';
  end if;
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000030', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if (select count(*) from public.notifications) <> 0 then
    raise exception 'An unrelated user can read another user notifications';
  end if;
  begin
    update public.notifications set read_at = now();
    raise exception 'Authenticated users can update notification rows directly';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.bookings (
  id, client_id, service, date, time_slot, address, status
) values (
  '60000000-0000-0000-0000-000000000200',
  '60000000-0000-0000-0000-000000000010',
  'Notification service', current_date + 1, '10:00', 'Test address', 'pending'
), (
  '60000000-0000-0000-0000-000000000201',
  '60000000-0000-0000-0000-000000000010',
  'Notification service two', current_date + 2, '11:00', 'Test address', 'pending'
);

insert into public.booking_notifications (id, booking_id, pro_id) values (
  '60000000-0000-0000-0000-000000000210',
  '60000000-0000-0000-0000-000000000200',
  '60000000-0000-0000-0000-000000000020'
);

insert into public.missions (
  id, client_id, pro_id, service, date, status, booking_id
) values (
  '60000000-0000-0000-0000-000000000300',
  '60000000-0000-0000-0000-000000000010',
  '60000000-0000-0000-0000-000000000020',
  'Notification service', now() + interval '1 day', 'proposed',
  '60000000-0000-0000-0000-000000000200'
);

update public.missions
set status = 'confirmed'
where id = '60000000-0000-0000-0000-000000000300';

insert into public.payments (
  id, mission_id, pro_id, client_id, amount_total_cents, status,
  stripe_session_id, stripe_payment_id
) values (
  '60000000-0000-0000-0000-000000000400',
  '60000000-0000-0000-0000-000000000300',
  '60000000-0000-0000-0000-000000000020',
  '60000000-0000-0000-0000-000000000010',
  10000, 'paid', 'cs_notification_test', 'pi_notification_test'
);

do $$
begin
  if (select count(*) from public.notifications
      where source_table = 'booking_notifications'
        and source_id = '60000000-0000-0000-0000-000000000210') <> 1 then
    raise exception 'Booking request notification was not created';
  end if;
  if (select count(*) from public.notifications
      where source_table = 'missions'
        and source_id = '60000000-0000-0000-0000-000000000300') <> 3 then
    raise exception 'Offer and mission-status notifications are incomplete';
  end if;
  if (select count(*) from public.notifications
      where source_table = 'payments'
        and source_id = '60000000-0000-0000-0000-000000000400') <> 2 then
    raise exception 'Payment notifications were not created for both parties';
  end if;
end
$$;

select set_config(
  'app.test_pro_payment_notification_id',
  (
    select id::text
    from public.notifications
    where source_table = 'payments'
      and source_id = '60000000-0000-0000-0000-000000000400'
      and recipient_id = '60000000-0000-0000-0000-000000000020'
  ),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  v_own_notification_id uuid;
begin
  select id into v_own_notification_id
  from public.notifications
  where source_table = 'payments'
    and source_id = '60000000-0000-0000-0000-000000000400';

  if not public.mark_notification_read(v_own_notification_id) then
    raise exception 'Recipient could not mark one notification as read';
  end if;
  if public.mark_notification_read(
    current_setting('app.test_pro_payment_notification_id')::uuid
  ) then
    raise exception 'A user marked another recipient notification as read';
  end if;
  if (select payments from public.get_notification_summary()) <> 0 then
    raise exception 'Single-notification read did not update the summary';
  end if;
end
$$;

reset role;

do $$
begin
  if (select read_at from public.notifications
      where id = current_setting('app.test_pro_payment_notification_id')::uuid) is not null then
    raise exception 'Another recipient notification was changed';
  end if;
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.mark_notifications_read(
  array['booking_request'], null, null, false
);

do $$
begin
  if (select pro_bookings from public.get_notification_summary()) <> 0 then
    raise exception 'Marking booking notifications as read failed';
  end if;
end
$$;

reset role;

-- Disabled email preferences are enforced when the event is queued.
update public.users
set notifications_email = false
where id = '60000000-0000-0000-0000-000000000020';

insert into public.booking_notifications (id, booking_id, pro_id) values (
  '60000000-0000-0000-0000-000000000211',
  '60000000-0000-0000-0000-000000000201',
  '60000000-0000-0000-0000-000000000020'
);

do $$
begin
  if (select d.status from public.notification_email_deliveries d
      join public.notifications n on n.id = d.notification_id
      where n.source_id = '60000000-0000-0000-0000-000000000211') <> 'skipped' then
    raise exception 'Disabled email preference was ignored';
  end if;
end
$$;

do $$
declare
  v_delivery_id uuid;
  v_notification_id uuid;
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);

  select delivery_id, notification_id
  into v_delivery_id, v_notification_id
  from public.claim_notification_email_deliveries(
    '60000000-0000-0000-0000-000000000500', 1
  );

  if v_delivery_id is null then
    raise exception 'Email worker did not claim exactly one delivery';
  end if;

  if exists (
    select 1 from public.claim_notification_email_deliveries(
      '60000000-0000-0000-0000-000000000501', 50
    ) where notification_id = v_notification_id
  ) then
    raise exception 'Two workers claimed the same email delivery';
  end if;

  if public.complete_notification_email_delivery(
    v_delivery_id,
    '60000000-0000-0000-0000-000000000500',
    true,
    'email-provider-test-id',
    null
  ) <> 'sent' then
    raise exception 'Email delivery completion failed';
  end if;
end
$$;

reset role;
rollback;
