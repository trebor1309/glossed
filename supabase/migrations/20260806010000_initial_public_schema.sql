-- Reproducible baseline captured from the read-only schema dump made before the
-- first hardening migration on 2026-08-06.
--
-- This migration is for fresh/local reconstruction only. On the existing
-- linked project it must be registered as already applied with `migration
-- repair`, never executed. The guard below makes an accidental remote push fail
-- closed before changing privileges. Supabase-managed auth and storage schemas
-- are intentionally excluded.

do $$
begin
  if to_regclass('public.users') is not null then
    raise exception using
      errcode = '55000',
      message = 'Historical baseline must be marked applied on an existing project; do not execute it';
  end if;
end
$$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete set null,
  email text unique,
  city text,
  role text default 'client' check (role in ('client', 'pro')),
  active_role text default 'client' check (active_role in ('client', 'pro')),
  created_at timestamptz default now(),
  latitude double precision,
  longitude double precision,
  radius_km numeric(6,2) default 20,
  updated_at timestamptz default now(),
  first_name text,
  last_name text,
  business_name text,
  business_type text[],
  description text,
  company_number text,
  vat_number text,
  no_vat boolean default false,
  business_address text,
  professional_email text,
  phone_number text,
  iban text,
  accepting_clients boolean default true,
  profile_photo text,
  portfolio text[] default '{}'::text[],
  verification_status text default 'unverified',
  verified_at timestamptz,
  id_document text,
  certificate_document text,
  verified_by text,
  preferred_language text default 'en',
  notifications_enabled boolean default true,
  available_days text[] default array['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  available_from time default '09:00:00',
  available_to time default '18:00:00',
  base_rate numeric default 50,
  default_currency text default 'EUR',
  mobile_service boolean default true,
  private_service boolean default false,
  studio_service boolean default false,
  theme text default 'light',
  notifications_email boolean default true,
  notifications_push boolean default true,
  address text,
  stripe_account_id text,
  stripe_payouts_enabled boolean default false,
  stripe_account_ready boolean default false,
  payouts_enabled boolean default false,
  username text unique,
  street text,
  postal_code text,
  country text,
  onboarding_completed boolean default false,
  show_city boolean default true,
  show_country boolean default true,
  show_business_address boolean default true,
  show_working_radius boolean default true,
  show_portfolio boolean default true,
  notif_email boolean default true,
  notif_push boolean default true,
  notif_newsletter boolean default true,
  notif_job_alerts boolean default true,
  notif_booking_updates boolean default true,
  notif_new_messages boolean default true
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.users(id) on delete cascade,
  pro_id uuid references public.users(id) on delete set null,
  service text not null,
  date date not null,
  time_slot text not null,
  address text not null,
  notes text,
  client_lat double precision,
  client_lng double precision,
  status text default 'pending',
  price numeric,
  currency text default 'EUR',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.bookings replica identity full;

create table if not exists public.booking_notifications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  pro_id uuid references public.users(id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.booking_notifications replica identity full;

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.users(id) on delete set null,
  pro_id uuid references public.users(id) on delete set null,
  service text not null,
  description text,
  date timestamptz not null,
  duration integer default 60,
  price numeric(10,2) default 0,
  status text default 'pending' check (
    status in ('pending', 'proposed', 'confirmed', 'cancel_requested', 'completed', 'cancelled')
  ),
  created_at timestamptz default now(),
  time time,
  meta jsonb default '{}'::jsonb,
  booking_id uuid references public.bookings(id) on delete set null,
  paid_at timestamptz default now(),
  updated_at timestamptz default now(),
  cancel_requested_at timestamptz,
  cancel_reason text,
  payment_intent_id text,
  service_price numeric,
  travel_fee numeric,
  total_price numeric
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.missions(id) on delete cascade,
  pro_id uuid references public.users(id) on delete set null,
  client_id uuid references public.users(id) on delete set null,
  amount numeric(10,2) not null,
  status text default 'pending' check (
    status in ('pending', 'paid', 'failed', 'refunded', 'disputed', 'partially_refunded')
  ),
  created_at timestamptz default now(),
  stripe_session_id text,
  currency text default 'eur',
  amount_net numeric(10,2),
  stripe_payment_id text,
  refunded_at timestamptz,
  paid_at timestamptz,
  application_fee numeric(10,2),
  travel_fee numeric,
  pro_service_price numeric,
  pro_total_price numeric,
  refund_amount numeric(10,2),
  updated_at timestamptz
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.missions(id) on delete cascade,
  pro_id uuid not null references public.users(id),
  client_id uuid not null references public.users(id),
  last_message text,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  hidden_for_pro boolean default false,
  hidden_for_client boolean default false
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references public.chats(id) on delete cascade,
  sender_id uuid references public.users(id),
  content text,
  created_at timestamptz default now(),
  read_at timestamptz,
  attachment_url text
);

create index if not exists chats_client_idx on public.chats(client_id);
create index if not exists chats_mission_idx on public.chats(mission_id);
create index if not exists chats_pro_idx on public.chats(pro_id);
create index if not exists idx_bookings_client_id on public.bookings(client_id);
create index if not exists idx_bookings_pro_id on public.bookings(pro_id);
create index if not exists idx_bookings_status on public.bookings(status);
create index if not exists idx_payments_client_id on public.payments(client_id);
create index if not exists idx_payments_created_at on public.payments(created_at);
create index if not exists idx_payments_mission_id on public.payments(mission_id);
create index if not exists idx_payments_pro_id on public.payments(pro_id);
create index if not exists idx_payments_status on public.payments(status);
create index if not exists messages_chat_id_created_at_idx
  on public.messages(chat_id, created_at);
create index if not exists messages_sender_id_idx on public.messages(sender_id);
create index if not exists missions_updated_at_idx on public.missions(updated_at desc);
create unique index if not exists users_username_unique_idx
  on public.users(lower(username));

do $baseline$
begin
  if to_regprocedure('public.auto_verify_if_docs_present()') is null then
    execute $function$
      create function public.auto_verify_if_docs_present()
      returns trigger
      language plpgsql
      set search_path = public, pg_temp
      as $body$
      begin
        if new.id_document is not null and new.certificate_document is not null then
          new.verification_status := 'pending';
        end if;
        return new;
      end
      $body$
    $function$;
  end if;

  if to_regprocedure('public.handle_new_user()') is null then
    execute $function$
      create function public.handle_new_user()
      returns trigger
      language plpgsql
      security definer
      set search_path = public, pg_temp
      as $body$
      begin
        insert into public.users (id, email, role, active_role, theme)
        values (new.id, new.email, 'client', 'client', 'light');
        return new;
      end
      $body$
    $function$;
  end if;

  if to_regprocedure('public.update_missions_timestamp()') is null then
    execute $function$
      create function public.update_missions_timestamp()
      returns trigger language plpgsql set search_path = public, pg_temp
      as $body$ begin new.updated_at := now(); return new; end $body$
    $function$;
  end if;

  if to_regprocedure('public.update_payments_timestamp()') is null then
    execute $function$
      create function public.update_payments_timestamp()
      returns trigger language plpgsql set search_path = public, pg_temp
      as $body$ begin new.updated_at := now(); return new; end $body$
    $function$;
  end if;

  if to_regprocedure('public.update_updated_at_column()') is null then
    execute $function$
      create function public.update_updated_at_column()
      returns trigger language plpgsql set search_path = public, pg_temp
      as $body$ begin new.updated_at := now(); return new; end $body$
    $function$;
  end if;

  if to_regprocedure('public.update_users_updated_at()') is null then
    execute $function$
      create function public.update_users_updated_at()
      returns trigger language plpgsql set search_path = public, pg_temp
      as $body$ begin new.updated_at := now(); return new; end $body$
    $function$;
  end if;

  if to_regprocedure(
    'public.match_pros_for_multiple_services(text[],double precision,double precision)'
  ) is null then
    execute $function$
      create function public.match_pros_for_multiple_services(
        services text[], client_lat double precision, client_lng double precision
      ) returns table (
        id uuid, business_name text, business_type text[], profile_photo text,
        description text, latitude double precision, longitude double precision,
        distance_km double precision, verification_status text, radius_km double precision
      ) language sql stable set search_path = public, pg_temp
      as $body$
        select u.id, u.business_name, u.business_type, u.profile_photo,
          u.description, u.latitude, u.longitude, null::double precision,
          u.verification_status, u.radius_km::double precision
        from public.users u where false
      $body$
    $function$;
  end if;

  if to_regprocedure(
    'public.match_pros_for_request(text,double precision,double precision)'
  ) is null then
    execute $function$
      create function public.match_pros_for_request(
        service text, client_lat double precision, client_lng double precision
      ) returns table (
        id uuid, business_name text, business_type text[], profile_photo text,
        description text, latitude double precision, longitude double precision,
        distance_km double precision, verification_status text, radius_km integer
      ) language sql stable set search_path = public, pg_temp
      as $body$
        select u.id, u.business_name, u.business_type, u.profile_photo,
          u.description, u.latitude, u.longitude, null::double precision,
          u.verification_status, u.radius_km::integer
        from public.users u where false
      $body$
    $function$;
  end if;
end
$baseline$;

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

  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_timestamp' and tgrelid = 'public.missions'::regclass
  ) then
    create trigger set_timestamp before update on public.missions
    for each row execute function public.update_missions_timestamp();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_timestamp' and tgrelid = 'public.payments'::regclass
  ) then
    create trigger set_timestamp before update on public.payments
    for each row execute function public.update_payments_timestamp();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_auto_verify_docs' and tgrelid = 'public.users'::regclass
  ) then
    create trigger trg_auto_verify_docs
    before update on public.users
    for each row
    when (
      old.id_document is distinct from new.id_document
      or old.certificate_document is distinct from new.certificate_document
    ) execute function public.auto_verify_if_docs_present();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_update_users_timestamp' and tgrelid = 'public.users'::regclass
  ) then
    create trigger trg_update_users_timestamp before update on public.users
    for each row execute function public.update_users_updated_at();
  end if;
end
$$;

alter table public.users enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_notifications enable row level security;
alter table public.missions enable row level security;
alter table public.payments enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;

-- Policies that remained part of the live schema after later hardening
-- migrations must also exist in a clean rebuild. Each creation is conditional
-- so this historical baseline stays inert on an already-initialised project.
do $policies$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users' and policyname = 'Insert own row'
  ) then
    execute $policy$
      create policy "Insert own row" on public.users for insert
      with check (auth.uid() = id)
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users' and policyname = 'User can update own row'
  ) then
    execute $policy$
      create policy "User can update own row" on public.users for update
      using (auth.uid() = id) with check (auth.uid() = id)
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users' and policyname = 'User can view own row'
  ) then
    execute $policy$
      create policy "User can view own row" on public.users for select
      using (auth.uid() = id)
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'missions'
      and policyname = 'Users can view their own missions'
  ) then
    execute $policy$
      create policy "Users can view their own missions" on public.missions for select
      using (auth.uid() = client_id or auth.uid() = pro_id)
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'missions'
      and policyname = 'Allow update for pro'
  ) then
    execute $policy$
      create policy "Allow update for pro" on public.missions for update
      using (auth.uid() = pro_id) with check (auth.uid() = pro_id)
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'payments'
      and policyname = 'Users can view their own payments'
  ) then
    execute $policy$
      create policy "Users can view their own payments" on public.payments for select
      using (auth.uid() = client_id or auth.uid() = pro_id)
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'booking_notifications'
      and policyname = 'Allow select for related users'
  ) then
    execute $policy$
      create policy "Allow select for related users"
      on public.booking_notifications for select using (pro_id = auth.uid())
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chats' and policyname = 'chats_select_own'
  ) then
    execute $policy$
      create policy chats_select_own on public.chats for select
      using (pro_id = auth.uid() or client_id = auth.uid())
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_delete_own'
  ) then
    execute $policy$
      create policy messages_delete_own on public.messages for delete
      using (sender_id = auth.uid())
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'messages'
      and policyname = 'messages_insert_own_chats'
  ) then
    execute $policy$
      create policy messages_insert_own_chats on public.messages for insert
      with check (
        sender_id = auth.uid()
        and chat_id in (
          select id from public.chats
          where pro_id = auth.uid() or client_id = auth.uid()
        )
      )
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'messages'
      and policyname = 'messages_select_visible_chats'
  ) then
    execute $policy$
      create policy messages_select_visible_chats on public.messages for select
      using (
        chat_id in (
          select id from public.chats
          where pro_id = auth.uid() or client_id = auth.uid()
        )
      )
    $policy$;
  end if;
end
$policies$;

grant all on public.users to anon, authenticated, service_role;
grant all on public.bookings to anon, authenticated, service_role;
grant all on public.booking_notifications to anon, authenticated, service_role;
grant all on public.missions to anon, authenticated, service_role;
grant all on public.payments to anon, authenticated, service_role;
grant all on public.chats to anon, authenticated, service_role;
grant all on public.messages to anon, authenticated, service_role;
