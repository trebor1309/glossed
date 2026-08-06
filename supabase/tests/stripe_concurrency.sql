\set ON_ERROR_STOP on

create schema if not exists extensions;
create extension if not exists dblink with schema extensions;
select set_config('app.test_database_url', :'TEST_DATABASE_URL', false);

delete from public.stripe_webhook_events where event_id like 'evt_concurrency_test_%';
delete from public.refund_attempts where mission_id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
);
delete from public.checkout_attempts where mission_id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
);
delete from public.payments where mission_id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
);
delete from public.missions where id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
);
delete from public.users where id in (
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000020'
);
delete from auth.users where id in (
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000020'
);

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000010', 'checkout-client@example.test'),
  ('10000000-0000-0000-0000-000000000020', 'checkout-pro@example.test');
update public.users set role = 'pro', active_role = 'pro'
where id = '10000000-0000-0000-0000-000000000020';

insert into public.missions (id, client_id, pro_id, service, date, price, status) values
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000010',
   '10000000-0000-0000-0000-000000000020', 'Concurrency checkout', now(), 100, 'proposed'),
  ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000010',
   '10000000-0000-0000-0000-000000000020', 'Concurrency webhook', now(), 100, 'proposed'),
  ('10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000010',
   '10000000-0000-0000-0000-000000000020', 'Concurrency refund', now(), 100, 'cancel_requested');

insert into public.payments (
  id, mission_id, client_id, pro_id, amount_total_cents, amount_net_cents,
  application_fee_cents, stripe_payment_id, stripe_session_id, status
) values (
  '10000000-0000-0000-0000-000000000030',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000020',
  11000, 10000, 1000, 'pi_concurrency_refund_1', 'cs_concurrency_refund_1', 'paid'
);

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000010","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    update public.users
    set stripe_account_id = 'acct_browser_injection'
    where id = '10000000-0000-0000-0000-000000000010';
    raise exception 'Browser was allowed to change Stripe profile state';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.missions
    set price = 1
    where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'Client was allowed to change a mission amount';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.missions
    set status = 'confirmed'
    where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'Client was allowed to confirm an unpaid mission';
  exception when insufficient_privilege then null;
  end;
end
$$;
rollback;

select extensions.dblink_connect('checkout_1', current_setting('app.test_database_url'));
select extensions.dblink_connect('checkout_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('checkout_1', $$
  select attempt_id, idempotency_key, attempt_status, stripe_session_id,
         stripe_session_url, expires_at
  from public.reserve_checkout_attempt(
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000010', 1800)
$$);
select extensions.dblink_send_query('checkout_2', $$
  select attempt_id, idempotency_key, attempt_status, stripe_session_id,
         stripe_session_url, expires_at
  from public.reserve_checkout_attempt(
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000010', 1800)
$$);

create temporary table checkout_results (
  attempt_id uuid, idempotency_key text, attempt_status text,
  stripe_session_id text, stripe_session_url text, expires_at timestamptz
);
insert into checkout_results select * from extensions.dblink_get_result('checkout_1') as t(
  attempt_id uuid, idempotency_key text, attempt_status text,
  stripe_session_id text, stripe_session_url text, expires_at timestamptz
);
insert into checkout_results select * from extensions.dblink_get_result('checkout_2') as t(
  attempt_id uuid, idempotency_key text, attempt_status text,
  stripe_session_id text, stripe_session_url text, expires_at timestamptz
);

do $$
begin
  if (select count(distinct attempt_id) from checkout_results) <> 1 then
    raise exception 'Concurrent checkout calls returned different attempts';
  end if;
  if (select count(distinct idempotency_key) from checkout_results) <> 1 then
    raise exception 'Concurrent checkout calls returned different idempotency keys';
  end if;
end
$$;

update public.checkout_attempts
set status = 'open', expires_at = now() - interval '1 second'
where mission_id = '10000000-0000-0000-0000-000000000001';
create temporary table expired_attempt as
select * from public.reserve_checkout_attempt(
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000010', 1800
);
do $$
begin
  if exists (
    select 1
    from expired_attempt e
    join checkout_results c using (attempt_id)
  ) then
    raise exception 'Expired checkout attempt was reused';
  end if;
end
$$;

select extensions.dblink_connect('webhook_1', current_setting('app.test_database_url'));
select extensions.dblink_connect('webhook_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('webhook_1', $$
  select * from public.process_stripe_checkout_completed(
    'evt_concurrency_test_1', 'checkout.session.completed', now(), false,
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000010',
    '10000000-0000-0000-0000-000000000020',
    'pi_concurrency_test_1', 'cs_concurrency_test_1', 11000, 1000, 'eur')
$$);
select extensions.dblink_send_query('webhook_2', $$
  select * from public.process_stripe_checkout_completed(
    'evt_concurrency_test_1', 'checkout.session.completed', now(), false,
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000010',
    '10000000-0000-0000-0000-000000000020',
    'pi_concurrency_test_1', 'cs_concurrency_test_1', 11000, 1000, 'eur')
$$);
select * from extensions.dblink_get_result('webhook_1') as t(payment_id uuid, duplicate boolean);
select * from extensions.dblink_get_result('webhook_2') as t(payment_id uuid, duplicate boolean);

do $$
begin
  if (select count(*) from public.payments where stripe_payment_id = 'pi_concurrency_test_1') <> 1 then
    raise exception 'Duplicate webhook produced an invalid payment count';
  end if;
  if (select count(*) from public.stripe_webhook_events where event_id = 'evt_concurrency_test_1') <> 1 then
    raise exception 'Duplicate webhook produced an invalid event count';
  end if;
  if (select status from public.missions where id = '10000000-0000-0000-0000-000000000002') <> 'confirmed' then
    raise exception 'Payment and mission status were not updated atomically';
  end if;
end
$$;

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000020","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
delete from public.missions
where id = '10000000-0000-0000-0000-000000000002';
do $$
begin
  if not exists (
    select 1 from public.missions
    where id = '10000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'Professional was allowed to delete a paid mission';
  end if;
end
$$;
rollback;

do $$
begin
  begin
    delete from public.missions
    where id = '10000000-0000-0000-0000-000000000002';
    raise exception 'Payment foreign key allowed mission deletion';
  exception when foreign_key_violation then null;
  end;
end
$$;

select extensions.dblink_connect('refund_1', current_setting('app.test_database_url'));
select extensions.dblink_connect('refund_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('refund_1', $$
  select * from public.reserve_mission_refund(
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000020',
    'client_cancel_approved')
$$);
select extensions.dblink_send_query('refund_2', $$
  select * from public.reserve_mission_refund(
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000020',
    'client_cancel_approved')
$$);
create temporary table refund_reservations (
  attempt_id uuid, attempt_status text, attempt_number integer,
  payment_id uuid, stripe_payment_id text, refund_amount_cents bigint, idempotency_key text,
  resulting_payment_status text, stripe_refund_id text
);
insert into refund_reservations
select * from extensions.dblink_get_result('refund_1') as t(
  attempt_id uuid, attempt_status text, attempt_number integer,
  payment_id uuid, stripe_payment_id text, refund_amount_cents bigint, idempotency_key text,
  resulting_payment_status text, stripe_refund_id text
);
insert into refund_reservations
select * from extensions.dblink_get_result('refund_2') as t(
  attempt_id uuid, attempt_status text, attempt_number integer,
  payment_id uuid, stripe_payment_id text, refund_amount_cents bigint, idempotency_key text,
  resulting_payment_status text, stripe_refund_id text
);
-- Fully drain both asynchronous result queues before reusing the connections.
select * from extensions.dblink_get_result('refund_1') as t(
  attempt_id uuid, attempt_status text, attempt_number integer,
  payment_id uuid, stripe_payment_id text, refund_amount_cents bigint, idempotency_key text,
  resulting_payment_status text, stripe_refund_id text
);
select * from extensions.dblink_get_result('refund_2') as t(
  attempt_id uuid, attempt_status text, attempt_number integer,
  payment_id uuid, stripe_payment_id text, refund_amount_cents bigint, idempotency_key text,
  resulting_payment_status text, stripe_refund_id text
);
do $$
begin
  if (select count(distinct attempt_id) from refund_reservations) <> 1
     or (select count(distinct idempotency_key) from refund_reservations) <> 1 then
    raise exception 'Concurrent refund calls did not share one reservation';
  end if;
  if (select min(refund_amount_cents) from refund_reservations) <> 10000 then
    raise exception 'Reserved partial refund amount is incorrect';
  end if;
end
$$;

select * from public.fail_mission_refund(
  (select id from public.refund_attempts
   where mission_id = '10000000-0000-0000-0000-000000000003'),
  1,
  'balance_insufficient'
);
do $$
begin
  if (select status from public.refund_attempts
      where mission_id = '10000000-0000-0000-0000-000000000003') <> 'failed'
     or (select last_failure_code from public.refund_attempts
         where mission_id = '10000000-0000-0000-0000-000000000003') <> 'balance_insufficient' then
    raise exception 'Definitive Stripe rejection did not release the refund reservation';
  end if;
end
$$;

-- A definitively failed Stripe request did not create a refund, so the ordinary
-- professional transition must be available again.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000020","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
update public.missions set status = 'confirmed'
where id = '10000000-0000-0000-0000-000000000003';
rollback;

select extensions.dblink_send_query('refund_1', $$
  select * from public.reserve_mission_refund(
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000020',
    'client_cancel_approved')
$$);
select extensions.dblink_send_query('refund_2', $$
  select * from public.reserve_mission_refund(
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000020',
    'client_cancel_approved')
$$);
create temporary table refund_retry_reservations (
  attempt_id uuid, attempt_status text, attempt_number integer,
  payment_id uuid, stripe_payment_id text, refund_amount_cents bigint, idempotency_key text,
  resulting_payment_status text, stripe_refund_id text
);
insert into refund_retry_reservations
select * from extensions.dblink_get_result('refund_1') as t(
  attempt_id uuid, attempt_status text, attempt_number integer,
  payment_id uuid, stripe_payment_id text, refund_amount_cents bigint, idempotency_key text,
  resulting_payment_status text, stripe_refund_id text
);
insert into refund_retry_reservations
select * from extensions.dblink_get_result('refund_2') as t(
  attempt_id uuid, attempt_status text, attempt_number integer,
  payment_id uuid, stripe_payment_id text, refund_amount_cents bigint, idempotency_key text,
  resulting_payment_status text, stripe_refund_id text
);
select * from extensions.dblink_get_result('refund_1') as t(
  attempt_id uuid, attempt_status text, attempt_number integer,
  payment_id uuid, stripe_payment_id text, refund_amount_cents bigint, idempotency_key text,
  resulting_payment_status text, stripe_refund_id text
);
select * from extensions.dblink_get_result('refund_2') as t(
  attempt_id uuid, attempt_status text, attempt_number integer,
  payment_id uuid, stripe_payment_id text, refund_amount_cents bigint, idempotency_key text,
  resulting_payment_status text, stripe_refund_id text
);
do $$
begin
  if (select count(distinct attempt_id) from refund_retry_reservations) <> 1
     or (select count(distinct idempotency_key) from refund_retry_reservations) <> 1
     or (select min(attempt_number) from refund_retry_reservations) <> 2 then
    raise exception 'Concurrent retry did not share one second-generation reservation';
  end if;
  if (select min(r.idempotency_key) from refund_retry_reservations r)
     = (select min(r.idempotency_key) from refund_reservations r) then
    raise exception 'Definitively failed refund reused its rejected Stripe key';
  end if;
end
$$;

select * from public.fail_mission_refund(
  (select id from public.refund_attempts
   where mission_id = '10000000-0000-0000-0000-000000000003'),
  1,
  'late_first_generation_failure'
);
do $$
begin
  if (select status from public.refund_attempts
      where mission_id = '10000000-0000-0000-0000-000000000003') <> 'reserved'
     or (select attempt_number from public.refund_attempts
         where mission_id = '10000000-0000-0000-0000-000000000003') <> 2 then
    raise exception 'Stale failure report overwrote a newer refund generation';
  end if;
end
$$;

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000020","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    update public.missions set status = 'confirmed'
    where id = '10000000-0000-0000-0000-000000000003';
    raise exception 'Professional rejected cancellation during a reserved refund';
  exception when sqlstate '55000' then null;
  end;
end
$$;
rollback;

select extensions.dblink_send_query('refund_1', $$
  select public.finalize_mission_refund(
    (select id from public.refund_attempts
     where mission_id = '10000000-0000-0000-0000-000000000003'),
    2,
    're_concurrency_test_1', 10000)
$$);
select extensions.dblink_send_query('refund_2', $$
  select public.finalize_mission_refund(
    (select id from public.refund_attempts
     where mission_id = '10000000-0000-0000-0000-000000000003'),
    2,
    're_concurrency_test_1', 10000)
$$);
select * from extensions.dblink_get_result('refund_1') as t(result text);
select * from extensions.dblink_get_result('refund_2') as t(result text);
select * from public.fail_mission_refund(
  (select id from public.refund_attempts
   where mission_id = '10000000-0000-0000-0000-000000000003'),
  2,
  'late_rejection'
);
do $$
begin
  if (select count(*) from public.payments where stripe_refund_id = 're_concurrency_test_1') <> 1 then
    raise exception 'Concurrent refund finalization was not idempotent';
  end if;
  if (select status from public.missions where id = '10000000-0000-0000-0000-000000000003') <> 'cancelled'
     or (select status from public.payments where id = '10000000-0000-0000-0000-000000000030') <> 'partially_refunded'
     or (select status from public.refund_attempts where mission_id = '10000000-0000-0000-0000-000000000003') <> 'completed'
     or (select attempt_number from public.refund_attempts where mission_id = '10000000-0000-0000-0000-000000000003') <> 2 then
    raise exception 'Refund payment and mission writes were not atomic';
  end if;
end
$$;

select extensions.dblink_disconnect('checkout_1');
select extensions.dblink_disconnect('checkout_2');
select extensions.dblink_disconnect('webhook_1');
select extensions.dblink_disconnect('webhook_2');
select extensions.dblink_disconnect('refund_1');
select extensions.dblink_disconnect('refund_2');

delete from public.stripe_webhook_events where event_id = 'evt_concurrency_test_1';
delete from public.refund_attempts where mission_id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
);
delete from public.checkout_attempts where mission_id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
);
delete from public.payments where mission_id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
);
delete from public.missions where id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
);
delete from public.users where id in (
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000020'
);
delete from auth.users where id in (
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000020'
);

select 'stripe concurrency tests passed' as result;
