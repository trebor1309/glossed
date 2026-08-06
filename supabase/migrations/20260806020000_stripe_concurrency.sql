-- Stripe concurrency and accounting hardening.
-- Built against the read-only schema dump taken on 2026-08-06.

begin;

-- Abort instead of silently choosing a winner if historical Stripe identifiers
-- are already duplicated. Such rows require a manual accounting review.
do $$
begin
  if exists (
    select 1 from public.payments
    where stripe_payment_id is not null
    group by stripe_payment_id having count(*) > 1
  ) then
    raise exception 'Duplicate payments.stripe_payment_id values must be resolved first';
  end if;

  if exists (
    select 1 from public.payments
    where stripe_session_id is not null
    group by stripe_session_id having count(*) > 1
  ) then
    raise exception 'Duplicate payments.stripe_session_id values must be resolved first';
  end if;

  if exists (
    select 1 from public.users
    where stripe_account_id is not null
    group by stripe_account_id having count(*) > 1
  ) then
    raise exception 'Duplicate users.stripe_account_id values must be resolved first';
  end if;
end
$$;

-- Stripe monetary values are integers in the currency's smallest unit.
alter table public.payments rename column amount to amount_total_cents;
alter table public.payments rename column amount_net to amount_net_cents;
alter table public.payments rename column application_fee to application_fee_cents;
alter table public.payments rename column refund_amount to refund_amount_cents;
alter table public.payments rename column travel_fee to travel_fee_cents;
alter table public.payments rename column pro_service_price to pro_service_price_cents;
alter table public.payments rename column pro_total_price to pro_total_price_cents;

alter table public.payments
  alter column amount_total_cents type bigint using round(amount_total_cents)::bigint,
  alter column amount_net_cents type bigint using round(amount_net_cents * 100)::bigint,
  alter column application_fee_cents type bigint using round(application_fee_cents * 100)::bigint,
  alter column refund_amount_cents type bigint using round(refund_amount_cents * 100)::bigint,
  alter column travel_fee_cents type bigint using round(travel_fee_cents * 100)::bigint,
  alter column pro_service_price_cents type bigint using round(pro_service_price_cents * 100)::bigint,
  alter column pro_total_price_cents type bigint using round(pro_total_price_cents * 100)::bigint,
  add column if not exists stripe_refund_id text;

alter table public.payments
  add constraint payments_amount_total_cents_nonnegative check (amount_total_cents >= 0),
  add constraint payments_amount_net_cents_nonnegative check (amount_net_cents is null or amount_net_cents >= 0),
  add constraint payments_application_fee_cents_nonnegative check (application_fee_cents is null or application_fee_cents >= 0),
  add constraint payments_refund_amount_cents_nonnegative check (refund_amount_cents is null or refund_amount_cents >= 0);

create unique index payments_stripe_payment_id_uidx
  on public.payments (stripe_payment_id)
  where stripe_payment_id is not null;
create unique index payments_stripe_session_id_uidx
  on public.payments (stripe_session_id)
  where stripe_session_id is not null;
create unique index payments_stripe_refund_id_uidx
  on public.payments (stripe_refund_id)
  where stripe_refund_id is not null;
create unique index users_stripe_account_id_uidx
  on public.users (stripe_account_id)
  where stripe_account_id is not null;

-- Keep one canonical payout flag.
update public.users
set payouts_enabled = coalesce(stripe_payouts_enabled, payouts_enabled, false)
where payouts_enabled is distinct from coalesce(stripe_payouts_enabled, payouts_enabled, false);
alter table public.users drop column stripe_payouts_enabled;

alter table public.missions alter column paid_at drop default;

-- Financial records must survive mission deletion attempts.
alter table public.payments drop constraint payments_mission_id_fkey;
alter table public.payments
  add constraint payments_mission_id_fkey
  foreign key (mission_id) references public.missions(id) on delete restrict;

create table public.checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null unique references public.missions(id) on delete cascade,
  client_id uuid not null references public.users(id) on delete cascade,
  idempotency_key text not null unique,
  stripe_session_id text unique,
  stripe_session_url text,
  status text not null default 'reserved'
    check (status in ('reserved', 'open', 'completed', 'expired', 'abandoned', 'failed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  stripe_created_at timestamptz,
  livemode boolean not null,
  status text not null default 'processing'
    check (status in ('processing', 'processed')),
  payment_id uuid references public.payments(id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.refund_attempts (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null unique references public.missions(id) on delete restrict,
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  requested_by uuid not null references public.users(id) on delete restrict,
  mode text not null check (mode in ('pro_cancel', 'client_cancel_approved')),
  expected_mission_status text not null,
  resulting_payment_status text not null
    check (resulting_payment_status in ('refunded', 'partially_refunded')),
  stripe_payment_id text not null,
  refund_amount_cents bigint not null check (refund_amount_cents > 0),
  idempotency_key text not null unique,
  attempt_number integer not null default 1 check (attempt_number > 0),
  stripe_refund_id text unique,
  status text not null default 'reserved'
    check (status in ('reserved', 'completed', 'failed')),
  last_failure_code text check (
    last_failure_code is null or char_length(last_failure_code) between 1 and 100
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_failed_at timestamptz,
  completed_at timestamptz
);

alter table public.checkout_attempts enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.refund_attempts enable row level security;
revoke all on public.checkout_attempts from anon, authenticated;
revoke all on public.stripe_webhook_events from anon, authenticated;
revoke all on public.refund_attempts from anon, authenticated;
grant all on public.checkout_attempts to service_role;
grant all on public.stripe_webhook_events to service_role;
grant all on public.refund_attempts to service_role;

-- Payment rows are written only by privileged RPCs.
drop policy if exists "Users can update their own payments" on public.payments;

-- Replace permissive historical mission policies with ownership checks.
drop policy if exists "Users can manage their own missions" on public.missions;
drop policy if exists "Allow insert for pros" on public.missions;
drop policy if exists "allow insert for authenticated" on public.missions;
drop policy if exists "Allow delete for pro" on public.missions;

create policy "Pros can create assigned proposals"
on public.missions for insert to authenticated
with check (
  auth.uid() = pro_id
  and status = 'proposed'
  and paid_at is null
  and payment_intent_id is null
  and booking_id is not null
  and exists (
    select 1 from public.bookings b
    where b.id = booking_id and b.client_id = client_id
  )
);

create policy "Clients can request cancellation"
on public.missions for update to authenticated
using (auth.uid() = client_id)
with check (auth.uid() = client_id);

-- Browser sessions may edit ordinary profile fields, never Stripe state.
create or replace function public.protect_user_stripe_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' and (
    new.stripe_account_id is distinct from old.stripe_account_id
    or new.stripe_account_ready is distinct from old.stripe_account_ready
    or new.payouts_enabled is distinct from old.payouts_enabled
  ) then
    raise exception 'Stripe account fields are managed by trusted server functions'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger protect_user_stripe_fields
before update on public.users
for each row execute function public.protect_user_stripe_fields();

-- Enforce the narrow client/pro transitions even if another broad policy is
-- accidentally introduced later. Trusted SECURITY DEFINER RPCs are unaffected.
create or replace function public.protect_mission_payment_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if auth.role() is distinct from 'authenticated' then return new; end if;

  if new.client_id is distinct from old.client_id
     or new.pro_id is distinct from old.pro_id
     or new.booking_id is distinct from old.booking_id
     or new.paid_at is distinct from old.paid_at
     or new.payment_intent_id is distinct from old.payment_intent_id then
    raise exception 'Mission ownership and payment fields are server-managed'
      using errcode = '42501';
  end if;

  if new.price is distinct from old.price
     or new.service_price is distinct from old.service_price
     or new.travel_fee is distinct from old.travel_fee
     or new.total_price is distinct from old.total_price then
    if v_uid is distinct from old.pro_id or old.status <> 'proposed' then
      raise exception 'Only the assigned professional may edit an unpaid proposal amount'
        using errcode = '42501';
    end if;
    if exists (
      select 1 from public.checkout_attempts ca
      where ca.mission_id = old.id
        and ca.status in ('reserved', 'open')
        and ca.expires_at > now()
    ) then
      raise exception 'Mission amount is frozen while Checkout is active'
        using errcode = '55000';
    end if;
  end if;

  if new.status is distinct from old.status then
    if exists (
      select 1 from public.refund_attempts ra
      where ra.mission_id = old.id and ra.status = 'reserved'
    ) then
      raise exception 'Mission status is frozen while a refund is in progress'
        using errcode = '55000';
    end if;
    if v_uid = old.client_id
       and old.status = 'confirmed' and new.status = 'cancel_requested' then
      return new;
    end if;
    if v_uid = old.pro_id
       and old.status = 'cancel_requested' and new.status = 'confirmed' then
      return new;
    end if;
    raise exception 'Mission status transition requires a trusted server function'
      using errcode = '42501';
  end if;

  return new;
end
$$;

create or replace function public.reserve_mission_refund(
  p_mission_id uuid,
  p_requested_by uuid,
  p_mode text
)
returns table (
  attempt_id uuid,
  attempt_status text,
  attempt_number integer,
  payment_id uuid,
  stripe_payment_id text,
  refund_amount_cents bigint,
  idempotency_key text,
  resulting_payment_status text,
  stripe_refund_id text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_payment public.payments%rowtype;
  v_attempt public.refund_attempts%rowtype;
  v_expected_status text;
  v_resulting_status text;
  v_refund_amount bigint;
begin
  if p_mode = 'pro_cancel' then
    v_expected_status := 'confirmed';
    v_resulting_status := 'refunded';
  elsif p_mode = 'client_cancel_approved' then
    v_expected_status := 'cancel_requested';
    v_resulting_status := 'partially_refunded';
  else
    raise exception 'Invalid refund mode' using errcode = '22023';
  end if;

  select * into v_mission
  from public.missions where id = p_mission_id for update;
  if not found then raise exception 'Mission not found' using errcode = 'P0002'; end if;
  if v_mission.pro_id is distinct from p_requested_by then
    raise exception 'Only the assigned professional may refund this mission'
      using errcode = '42501';
  end if;

  select * into v_attempt
  from public.refund_attempts where mission_id = p_mission_id for update;
  if found then
    if v_attempt.status in ('reserved', 'completed') then
      if v_attempt.mode <> p_mode or v_attempt.requested_by <> p_requested_by then
        raise exception 'A different refund operation already exists' using errcode = '23505';
      end if;
      return query select v_attempt.id, v_attempt.status, v_attempt.attempt_number,
        v_attempt.payment_id, v_attempt.stripe_payment_id,
        v_attempt.refund_amount_cents, v_attempt.idempotency_key,
        v_attempt.resulting_payment_status, v_attempt.stripe_refund_id;
      return;
    end if;
    if v_attempt.status <> 'failed' then
      raise exception 'Refund attempt has an invalid status' using errcode = '23514';
    end if;
  end if;

  if v_mission.status <> v_expected_status then
    raise exception 'Mission is not refundable in its current status' using errcode = '23514';
  end if;

  if v_attempt.id is null then
    select * into v_payment
    from public.payments
    where mission_id = p_mission_id and status = 'paid'
    order by created_at desc
    limit 1
    for update;
  else
    select * into v_payment
    from public.payments
    where id = v_attempt.payment_id
      and mission_id = p_mission_id
      and status = 'paid'
    for update;
  end if;
  if not found then raise exception 'Paid payment not found' using errcode = 'P0002'; end if;
  if v_payment.stripe_payment_id is null then
    raise exception 'Payment has no Stripe identifier' using errcode = '23514';
  end if;

  if p_mode = 'pro_cancel' then
    v_refund_amount := v_payment.amount_total_cents;
  else
    v_refund_amount := v_payment.amount_net_cents;
  end if;
  if v_refund_amount is null or v_refund_amount <= 0 then
    raise exception 'Payment has an invalid refundable amount' using errcode = '23514';
  end if;

  if v_attempt.id is null then
    insert into public.refund_attempts (
      mission_id, payment_id, requested_by, mode, expected_mission_status,
      resulting_payment_status, stripe_payment_id, refund_amount_cents,
      idempotency_key
    ) values (
      p_mission_id, v_payment.id, p_requested_by, p_mode, v_expected_status,
      v_resulting_status, v_payment.stripe_payment_id, v_refund_amount,
      'refund:' || p_mission_id::text || ':' || p_mode || ':1'
    ) returning * into v_attempt;
  else
    update public.refund_attempts as ra
    set status = 'reserved',
        attempt_number = ra.attempt_number + 1,
        requested_by = p_requested_by,
        mode = p_mode,
        idempotency_key = 'refund:' || p_mission_id::text || ':' || p_mode
          || ':' || (ra.attempt_number + 1)::text,
        stripe_payment_id = v_payment.stripe_payment_id,
        refund_amount_cents = v_refund_amount,
        expected_mission_status = v_expected_status,
        resulting_payment_status = v_resulting_status,
        updated_at = now()
    where id = v_attempt.id
    returning * into v_attempt;
  end if;

  return query select v_attempt.id, v_attempt.status, v_attempt.attempt_number,
    v_attempt.payment_id, v_attempt.stripe_payment_id,
    v_attempt.refund_amount_cents, v_attempt.idempotency_key,
    v_attempt.resulting_payment_status, v_attempt.stripe_refund_id;
end
$$;

create trigger protect_mission_payment_fields
before update on public.missions
for each row execute function public.protect_mission_payment_fields();

create or replace function public.reserve_checkout_attempt(
  p_mission_id uuid,
  p_client_id uuid,
  p_ttl_seconds integer default 1800
)
returns table (
  attempt_id uuid,
  idempotency_key text,
  attempt_status text,
  stripe_session_id text,
  stripe_session_url text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_attempt public.checkout_attempts%rowtype;
  v_attempt_id uuid;
begin
  if p_ttl_seconds < 1800 or p_ttl_seconds > 86400 then
    raise exception 'Invalid checkout TTL' using errcode = '22023';
  end if;

  select * into v_mission
  from public.missions
  where id = p_mission_id
  for update;

  if not found then raise exception 'Mission not found' using errcode = 'P0002'; end if;
  if v_mission.client_id is distinct from p_client_id then
    raise exception 'Mission does not belong to client' using errcode = '42501';
  end if;
  if v_mission.status <> 'proposed' then
    raise exception 'Mission is not payable' using errcode = '23514';
  end if;
  if exists (select 1 from public.payments where mission_id = p_mission_id and status = 'paid') then
    raise exception 'Mission is already paid' using errcode = '23505';
  end if;

  select * into v_attempt
  from public.checkout_attempts
  where mission_id = p_mission_id
  for update;

  if found and v_attempt.status in ('reserved', 'open') and v_attempt.expires_at > now() then
    return query select v_attempt.id, v_attempt.idempotency_key, v_attempt.status,
      v_attempt.stripe_session_id, v_attempt.stripe_session_url, v_attempt.expires_at;
    return;
  end if;

  v_attempt_id := gen_random_uuid();
  insert into public.checkout_attempts (
    id, mission_id, client_id, idempotency_key, status, expires_at, created_at, updated_at
  ) values (
    v_attempt_id, p_mission_id, p_client_id, 'checkout:' || v_attempt_id::text,
    'reserved', now() + make_interval(secs => p_ttl_seconds), now(), now()
  )
  on conflict (mission_id) do update set
    id = excluded.id,
    client_id = excluded.client_id,
    idempotency_key = excluded.idempotency_key,
    stripe_session_id = null,
    stripe_session_url = null,
    status = 'reserved',
    expires_at = excluded.expires_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at
  returning * into v_attempt;

  return query select v_attempt.id, v_attempt.idempotency_key, v_attempt.status,
    v_attempt.stripe_session_id, v_attempt.stripe_session_url, v_attempt.expires_at;
end
$$;

create or replace function public.attach_checkout_session(
  p_attempt_id uuid,
  p_stripe_session_id text,
  p_stripe_session_url text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.checkout_attempts
  set stripe_session_id = p_stripe_session_id,
      stripe_session_url = p_stripe_session_url,
      status = 'open',
      expires_at = p_expires_at,
      updated_at = now()
  where id = p_attempt_id and status in ('reserved', 'open');

  if not found then raise exception 'Checkout attempt is no longer active' using errcode = '23514'; end if;
end
$$;

create or replace function public.process_stripe_checkout_completed(
  p_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz,
  p_livemode boolean,
  p_mission_id uuid,
  p_client_id uuid,
  p_pro_id uuid,
  p_stripe_payment_id text,
  p_stripe_session_id text,
  p_amount_total_cents bigint,
  p_application_fee_cents bigint,
  p_currency text
)
returns table (payment_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_payment_id uuid;
  v_expected_base_cents bigint;
  v_expected_fee_cents bigint;
begin
  insert into public.stripe_webhook_events(event_id, event_type, stripe_created_at, livemode)
  values (p_event_id, p_event_type, p_stripe_created_at, p_livemode)
  on conflict (event_id) do nothing;

  if not found then
    select swe.payment_id into v_payment_id
    from public.stripe_webhook_events swe where swe.event_id = p_event_id;
    return query select v_payment_id, true;
    return;
  end if;

  select * into v_mission from public.missions where id = p_mission_id for update;
  if not found then raise exception 'Mission not found' using errcode = 'P0002'; end if;
  if v_mission.client_id is distinct from p_client_id or v_mission.pro_id is distinct from p_pro_id then
    raise exception 'Stripe metadata does not match mission' using errcode = '23514';
  end if;

  v_expected_base_cents := round(v_mission.price * 100)::bigint;
  v_expected_fee_cents := round(v_expected_base_cents * 0.10)::bigint;
  if p_amount_total_cents <> v_expected_base_cents + v_expected_fee_cents
     or p_application_fee_cents <> v_expected_fee_cents then
    raise exception 'Stripe amount does not match mission' using errcode = '23514';
  end if;

  select id into v_payment_id from public.payments
  where stripe_payment_id = p_stripe_payment_id or stripe_session_id = p_stripe_session_id
  limit 1;

  if v_payment_id is null then
    if v_mission.status <> 'proposed' then
      raise exception 'Mission is not payable' using errcode = '23514';
    end if;

    insert into public.payments (
      mission_id, client_id, pro_id, amount_total_cents, currency,
      application_fee_cents, amount_net_cents, travel_fee_cents,
      pro_service_price_cents, pro_total_price_cents, stripe_payment_id,
      stripe_session_id, status, paid_at
    ) values (
      p_mission_id, p_client_id, p_pro_id, p_amount_total_cents, lower(p_currency),
      p_application_fee_cents, v_expected_base_cents,
      round(coalesce(v_mission.travel_fee, 0) * 100)::bigint,
      round(coalesce(v_mission.service_price, 0) * 100)::bigint,
      round(coalesce(v_mission.total_price, v_mission.price) * 100)::bigint,
      p_stripe_payment_id, p_stripe_session_id, 'paid', now()
    ) returning id into v_payment_id;
  end if;

  if v_mission.status = 'proposed' then
    update public.missions
    set status = 'confirmed', paid_at = now(), payment_intent_id = p_stripe_payment_id
    where id = p_mission_id;
  elsif v_mission.status <> 'confirmed' then
    raise exception 'Mission has incompatible payment status' using errcode = '23514';
  end if;

  update public.checkout_attempts
  set status = 'completed', updated_at = now()
  where mission_id = p_mission_id and stripe_session_id = p_stripe_session_id;

  update public.stripe_webhook_events
  set status = 'processed', payment_id = v_payment_id, processed_at = now()
  where event_id = p_event_id;

  return query select v_payment_id, false;
end
$$;

create or replace function public.fail_mission_refund(
  p_attempt_id uuid,
  p_attempt_number integer,
  p_failure_code text
)
returns table (
  attempt_status text,
  stripe_refund_id text,
  resulting_payment_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.refund_attempts%rowtype;
begin
  if p_attempt_number is null or p_attempt_number <= 0 then
    raise exception 'Invalid refund attempt number' using errcode = '22023';
  end if;
  if p_failure_code is null or char_length(p_failure_code) not between 1 and 100 then
    raise exception 'Invalid refund failure code' using errcode = '22023';
  end if;

  select * into v_attempt
  from public.refund_attempts where id = p_attempt_id for update;
  if not found then raise exception 'Refund attempt not found' using errcode = 'P0002'; end if;

  -- A late failure report must never overwrite a completed refund or a newer
  -- retry generation. Repeated failure reports are idempotent.
  if v_attempt.status = 'completed'
     or v_attempt.attempt_number <> p_attempt_number
     or v_attempt.status = 'failed' then
    return query select v_attempt.status, v_attempt.stripe_refund_id,
      v_attempt.resulting_payment_status;
    return;
  end if;

  update public.refund_attempts
  set status = 'failed', last_failure_code = p_failure_code,
      updated_at = now(), last_failed_at = now()
  where id = p_attempt_id
  returning * into v_attempt;

  return query select v_attempt.status, v_attempt.stripe_refund_id,
    v_attempt.resulting_payment_status;
end
$$;

create or replace function public.finalize_mission_refund(
  p_attempt_id uuid,
  p_attempt_number integer,
  p_stripe_refund_id text,
  p_refund_amount_cents bigint
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.refund_attempts%rowtype;
  v_mission_status text;
  v_payment_status text;
begin
  if p_attempt_number is null or p_attempt_number <= 0 then
    raise exception 'Invalid refund attempt number' using errcode = '22023';
  end if;
  select * into v_attempt
  from public.refund_attempts where id = p_attempt_id for update;
  if not found then raise exception 'Refund attempt not found' using errcode = 'P0002'; end if;

  if v_attempt.status = 'completed' then
    if v_attempt.stripe_refund_id = p_stripe_refund_id then return; end if;
    raise exception 'Refund attempt was completed with a different Stripe refund'
      using errcode = '23505';
  end if;
  if v_attempt.attempt_number <> p_attempt_number then
    raise exception 'Refund attempt generation changed concurrently' using errcode = '40001';
  end if;
  if p_refund_amount_cents <> v_attempt.refund_amount_cents then
    raise exception 'Stripe refund amount does not match reservation' using errcode = '23514';
  end if;

  select status into v_mission_status
  from public.missions where id = v_attempt.mission_id for update;
  if not found then raise exception 'Mission not found' using errcode = 'P0002'; end if;

  select status into v_payment_status
  from public.payments
  where id = v_attempt.payment_id and mission_id = v_attempt.mission_id
  for update;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;

  if v_mission_status <> v_attempt.expected_mission_status then
    raise exception 'Mission status changed concurrently' using errcode = '40001';
  end if;
  if v_payment_status <> 'paid' then
    raise exception 'Payment status changed concurrently' using errcode = '40001';
  end if;

  update public.payments
  set status = v_attempt.resulting_payment_status,
      stripe_refund_id = p_stripe_refund_id,
      refund_amount_cents = p_refund_amount_cents,
      refunded_at = now()
  where id = v_attempt.payment_id;

  update public.missions set status = 'cancelled' where id = v_attempt.mission_id;

  update public.refund_attempts
  set status = 'completed', stripe_refund_id = p_stripe_refund_id,
      updated_at = now(), completed_at = now()
  where id = p_attempt_id;
end
$$;

revoke all on function public.reserve_checkout_attempt(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.attach_checkout_session(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.process_stripe_checkout_completed(text, text, timestamptz, boolean, uuid, uuid, uuid, text, text, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.reserve_mission_refund(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fail_mission_refund(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.finalize_mission_refund(uuid, integer, text, bigint) from public, anon, authenticated;
grant execute on function public.reserve_checkout_attempt(uuid, uuid, integer) to service_role;
grant execute on function public.attach_checkout_session(uuid, text, text, timestamptz) to service_role;
grant execute on function public.process_stripe_checkout_completed(text, text, timestamptz, boolean, uuid, uuid, uuid, text, text, bigint, bigint, text) to service_role;
grant execute on function public.reserve_mission_refund(uuid, uuid, text) to service_role;
grant execute on function public.fail_mission_refund(uuid, integer, text) to service_role;
grant execute on function public.finalize_mission_refund(uuid, integer, text, bigint) to service_role;

commit;
