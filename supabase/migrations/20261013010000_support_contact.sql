begin;

create table public.contact_requests (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  category text not null,
  name text not null,
  email text not null,
  subject text,
  message text not null,
  locale text not null default 'en',
  source_path text not null default '/contact',
  sender_fingerprint text not null,
  delivery_status text not null default 'received',
  provider_message_id text,
  delivery_error text,
  created_at timestamptz not null default clock_timestamp(),
  emailed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  constraint contact_requests_category_check check (
    category in (
      'general', 'booking', 'account', 'professional', 'safety',
      'privacy', 'partnership', 'press'
    )
  ),
  constraint contact_requests_name_check check (
    char_length(name) between 2 and 100 and name = btrim(name)
  ),
  constraint contact_requests_email_check check (
    char_length(email) between 3 and 254
    and email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint contact_requests_subject_check check (
    subject is null or (char_length(subject) between 2 and 160 and subject = btrim(subject))
  ),
  constraint contact_requests_message_check check (
    char_length(message) between 20 and 5000 and message = btrim(message)
  ),
  constraint contact_requests_locale_check check (
    char_length(locale) between 2 and 16
  ),
  constraint contact_requests_source_path_check check (
    char_length(source_path) between 1 and 300 and left(source_path, 1) = '/'
  ),
  constraint contact_requests_fingerprint_check check (
    sender_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint contact_requests_delivery_status_check check (
    delivery_status in ('received', 'email_sent', 'email_failed', 'closed')
  ),
  constraint contact_requests_delivery_consistency_check check (
    (delivery_status = 'email_sent' and provider_message_id is not null and emailed_at is not null)
    or delivery_status <> 'email_sent'
  )
);

create index contact_requests_fingerprint_created_idx
  on public.contact_requests (sender_fingerprint, created_at desc);
create index contact_requests_email_created_idx
  on public.contact_requests (email, created_at desc);
create index contact_requests_status_created_idx
  on public.contact_requests (delivery_status, created_at desc);
create unique index contact_requests_provider_message_unique_idx
  on public.contact_requests (provider_message_id)
  where provider_message_id is not null;

alter table public.contact_requests enable row level security;
revoke all on public.contact_requests from public, anon, authenticated;
grant all on public.contact_requests to service_role;

create or replace function public.accept_contact_request(
  p_id uuid,
  p_user_id uuid,
  p_category text,
  p_name text,
  p_email text,
  p_subject text,
  p_message text,
  p_locale text,
  p_source_path text,
  p_sender_fingerprint text
)
returns table (
  request_id uuid,
  delivery_status text,
  was_created boolean,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.contact_requests%rowtype;
  v_now timestamptz := clock_timestamp();
  v_fingerprint_lock bigint := hashtextextended('contact-fingerprint:' || p_sender_fingerprint, 0);
  v_email_lock bigint := hashtextextended('contact-email:' || lower(btrim(p_email)), 0);
begin
  perform pg_advisory_xact_lock(least(v_fingerprint_lock, v_email_lock));
  if v_fingerprint_lock <> v_email_lock then
    perform pg_advisory_xact_lock(greatest(v_fingerprint_lock, v_email_lock));
  end if;

  select * into v_existing
  from public.contact_requests
  where id = p_id;

  if found then
    if v_existing.email <> lower(btrim(p_email))
       or v_existing.sender_fingerprint <> p_sender_fingerprint
       or v_existing.category <> p_category
       or v_existing.name <> btrim(p_name)
       or coalesce(v_existing.subject, '') <> coalesce(nullif(btrim(p_subject), ''), '')
       or v_existing.message <> btrim(p_message)
       or v_existing.locale <> lower(btrim(p_locale))
       or v_existing.source_path <> p_source_path then
      raise exception using errcode = '22023', message = 'contact_request_id_conflict';
    end if;

    return query
    select v_existing.id, v_existing.delivery_status, false, v_existing.created_at;
    return;
  end if;

  if (
    select count(*)
    from public.contact_requests
    where created_at >= v_now - interval '15 minutes'
      and (
        sender_fingerprint = p_sender_fingerprint
        or email = lower(btrim(p_email))
      )
  ) >= 3 or (
    select count(*)
    from public.contact_requests
    where created_at >= v_now - interval '24 hours'
      and (
        sender_fingerprint = p_sender_fingerprint
        or email = lower(btrim(p_email))
      )
  ) >= 10 then
    raise exception using errcode = 'P0001', message = 'contact_rate_limited';
  end if;

  insert into public.contact_requests (
    id, user_id, category, name, email, subject, message, locale,
    source_path, sender_fingerprint
  ) values (
    p_id,
    p_user_id,
    p_category,
    btrim(p_name),
    lower(btrim(p_email)),
    nullif(btrim(p_subject), ''),
    btrim(p_message),
    lower(btrim(p_locale)),
    p_source_path,
    p_sender_fingerprint
  );

  return query select p_id, 'received'::text, true, v_now;
end
$$;

create or replace function public.mark_contact_request_delivery(
  p_id uuid,
  p_success boolean,
  p_provider_message_id text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_success and nullif(btrim(p_provider_message_id), '') is null then
    raise exception using errcode = '22023', message = 'provider_message_id_required';
  end if;

  update public.contact_requests
  set delivery_status = case
        when delivery_status = 'email_sent' then 'email_sent'
        when p_success then 'email_sent'
        else 'email_failed'
      end,
      provider_message_id = case
        when delivery_status = 'email_sent' then provider_message_id
        when p_success then nullif(btrim(p_provider_message_id), '')
        else null
      end,
      delivery_error = case
        when delivery_status = 'email_sent' or p_success then null
        else left(nullif(btrim(p_error), ''), 1000)
      end,
      emailed_at = case
        when delivery_status = 'email_sent' then emailed_at
        when p_success then clock_timestamp()
        else null
      end,
      updated_at = clock_timestamp()
  where id = p_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'contact_request_not_found';
  end if;
end
$$;

revoke all on function public.accept_contact_request(
  uuid, uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.accept_contact_request(
  uuid, uuid, text, text, text, text, text, text, text, text
) to service_role;

revoke all on function public.mark_contact_request_delivery(
  uuid, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.mark_contact_request_delivery(
  uuid, boolean, text, text
) to service_role;

commit;
