-- Professional verification is reviewed by explicitly appointed application
-- administrators. Browser clients never receive service_role credentials and
-- cannot write trust fields directly.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.app_admins is
  'Explicit allowlist for application administrators. Populate only through a trusted SQL session.';

alter table public.app_admins enable row level security;
revoke all on public.app_admins from public, anon, authenticated;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.app_admins a where a.user_id = auth.uid()
    )
$$;

revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

alter table public.users
  add column if not exists verification_submitted_at timestamptz,
  add column if not exists verification_rejection_reason text;

update public.users
set verification_status = 'unverified'
where verification_status is null;

update public.users
set verification_status = 'unverified',
    verification_submitted_at = null
where verification_status = 'pending'
  and id_document is null;

update public.users
set verification_submitted_at = coalesce(verification_submitted_at, updated_at, now())
where verification_status = 'pending';

do $$
begin
  if exists (
    select 1
    from public.users
    where verification_status not in ('unverified', 'pending', 'verified', 'rejected')
  ) then
    raise exception 'Unknown users.verification_status value; reconcile it before applying this migration';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from public.users u
    where u.verification_status = 'verified'
      and (
        u.id_document is null
        or not exists (
          select 1
          from storage.objects o
          where o.bucket_id = 'verification-documents'
            and o.name = u.id_document
            and o.owner_id = u.id::text
        )
      )
  ) then
    raise exception 'A verified professional has no valid private ID document; reconcile before applying this migration';
  end if;
end
$$;

alter table public.users alter column verification_status set default 'unverified';
alter table public.users alter column verification_status set not null;
alter table public.users drop constraint if exists users_verification_status_check;
alter table public.users add constraint users_verification_status_check
  check (verification_status in ('unverified', 'pending', 'verified', 'rejected'));
alter table public.users drop constraint if exists users_verification_rejection_reason_check;
alter table public.users add constraint users_verification_rejection_reason_check
  check (
    verification_rejection_reason is null
    or length(verification_rejection_reason) between 1 and 2000
  );

create table if not exists public.professional_verification_reviews (
  id bigint generated always as identity primary key,
  professional_id uuid not null references public.users(id) on delete restrict,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  previous_status text not null,
  decision text not null,
  reason text,
  id_document text,
  certificate_document text,
  reviewed_at timestamptz not null default now(),
  constraint professional_verification_reviews_previous_status_check
    check (previous_status in ('unverified', 'pending', 'verified', 'rejected')),
  constraint professional_verification_reviews_decision_check
    check (decision in ('verified', 'rejected')),
  constraint professional_verification_reviews_reason_check
    check (
      (decision = 'verified' and (reason is null or length(reason) between 1 and 2000))
      or (decision = 'rejected' and length(reason) between 1 and 2000)
    )
);

create index if not exists professional_verification_reviews_professional_idx
  on public.professional_verification_reviews (professional_id, reviewed_at desc);

alter table public.professional_verification_reviews enable row level security;
revoke all on public.professional_verification_reviews from public, anon, authenticated;
grant select on public.professional_verification_reviews to authenticated;

drop policy if exists "verification_reviews_select_admin"
on public.professional_verification_reviews;
create policy "verification_reviews_select_admin"
on public.professional_verification_reviews for select
to authenticated
using (public.is_app_admin());

-- Trust fields are derived from document changes or written by the review RPC.
-- They cannot be submitted directly in an authenticated users.update call.
create or replace function public.protect_user_stripe_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' and (
    new.id is distinct from old.id
    or (
      new.email is distinct from old.email
      and current_setting('app.trusted_user_email_sync', true) is distinct from 'on'
    )
    or new.stripe_account_id is distinct from old.stripe_account_id
    or new.stripe_account_ready is distinct from old.stripe_account_ready
    or new.payouts_enabled is distinct from old.payouts_enabled
    or (
      current_setting('app.trusted_verification_review', true) is distinct from 'on'
      and (
        new.verification_status is distinct from old.verification_status
        or new.verification_submitted_at is distinct from old.verification_submitted_at
        or new.verification_rejection_reason is distinct from old.verification_rejection_reason
        or new.verified_at is distinct from old.verified_at
        or new.verified_by is distinct from old.verified_by
      )
    )
    or (old.role = 'pro' and new.role <> 'pro')
    or new.role not in ('client', 'pro')
    or new.active_role not in ('client', 'pro')
    or (new.active_role = 'pro' and new.role <> 'pro')
  ) then
    raise exception 'Trusted account fields cannot be changed from the browser'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace function public.auto_verify_if_docs_present()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id_document is distinct from old.id_document
     or new.certificate_document is distinct from old.certificate_document then
    if new.id_document is null then
      new.verification_status := 'unverified';
      new.verification_submitted_at := null;
    else
      new.verification_status := 'pending';
      new.verification_submitted_at := now();
    end if;

    new.verification_rejection_reason := null;
    new.verified_at := null;
    new.verified_by := null;
  end if;
  return new;
end
$$;

drop trigger if exists trg_auto_verify_docs on public.users;
create trigger trg_auto_verify_docs
before update of id_document, certificate_document on public.users
for each row execute function public.auto_verify_if_docs_present();

create or replace function public.list_pending_professional_verifications()
returns table (
  professional_id uuid,
  first_name text,
  last_name text,
  business_name text,
  email text,
  professional_email text,
  verification_status text,
  verification_submitted_at timestamptz,
  id_document text,
  certificate_document text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.first_name,
    u.last_name,
    u.business_name,
    u.email,
    u.professional_email,
    u.verification_status,
    u.verification_submitted_at,
    u.id_document,
    u.certificate_document
  from public.users u
  where u.role = 'pro'
    and u.verification_status = 'pending'
  order by u.verification_submitted_at asc nulls first, u.id;
end
$$;

revoke all on function public.list_pending_professional_verifications() from public, anon;
grant execute on function public.list_pending_professional_verifications() to authenticated;

create or replace function public.review_professional_verification(
  p_professional_id uuid,
  p_decision text,
  p_reason text default null
)
returns table (
  professional_id uuid,
  verification_status text,
  verified_at timestamptz,
  verification_rejection_reason text
)
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_professional public.users%rowtype;
  v_reason text := nullif(trim(p_reason), '');
begin
  if not public.is_app_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_professional_id = auth.uid() then
    raise exception 'Administrators cannot review their own verification'
      using errcode = '42501';
  end if;
  if p_decision not in ('verified', 'rejected') then
    raise exception 'Decision must be verified or rejected' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and v_reason is null then
    raise exception 'A rejection reason is required' using errcode = '22023';
  end if;
  if v_reason is not null and length(v_reason) > 2000 then
    raise exception 'Review reason is too long' using errcode = '22023';
  end if;

  select u.* into v_professional
  from public.users u
  where u.id = p_professional_id
  for update;

  if not found or v_professional.role <> 'pro' then
    raise exception 'Professional profile not found' using errcode = 'P0002';
  end if;
  if v_professional.verification_status <> 'pending' then
    raise exception 'This verification request is no longer pending'
      using errcode = '55000';
  end if;
  if p_decision = 'verified' and (
    v_professional.id_document is null or not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'verification-documents'
        and o.name = v_professional.id_document
        and o.owner_id = p_professional_id::text
    )
  ) then
    raise exception 'A valid ID document is required before review'
      using errcode = '55000';
  end if;

  perform set_config('app.trusted_verification_review', 'on', true);

  update public.users u
  set verification_status = p_decision,
      verified_at = case when p_decision = 'verified' then now() else null end,
      verified_by = case when p_decision = 'verified' then auth.uid()::text else null end,
      verification_rejection_reason = case
        when p_decision = 'rejected' then v_reason else null
      end,
      updated_at = now()
  where u.id = p_professional_id;

  perform set_config('app.trusted_verification_review', 'off', true);

  insert into public.professional_verification_reviews (
    professional_id,
    reviewer_id,
    previous_status,
    decision,
    reason,
    id_document,
    certificate_document
  ) values (
    p_professional_id,
    auth.uid(),
    v_professional.verification_status,
    p_decision,
    v_reason,
    v_professional.id_document,
    v_professional.certificate_document
  );

  return query
  select u.id, u.verification_status, u.verified_at, u.verification_rejection_reason
  from public.users u
  where u.id = p_professional_id;
end
$$;

revoke all on function public.review_professional_verification(uuid, text, text)
from public, anon;
grant execute on function public.review_professional_verification(uuid, text, text)
to authenticated;

-- Administrators can generate short-lived signed URLs, while professionals keep
-- access to their own files through the existing owner policy.
drop policy if exists "verification_documents_select_admin" on storage.objects;
create policy "verification_documents_select_admin"
on storage.objects for select
to authenticated
using (
  bucket_id = 'verification-documents'
  and public.is_app_admin()
);

-- A referenced file must first be detached from users. The users trigger then
-- invalidates any prior approval before the object can be deleted.
drop policy if exists "verification_documents_delete_own" on storage.objects;
create policy "verification_documents_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'verification-documents'
  and owner_id = auth.uid()::text
  and cardinality(storage.foldername(name)) = 2
  and (storage.foldername(name))[1] = 'verification'
  and (storage.foldername(name))[2] in ('id', 'certificate')
  and starts_with(storage.filename(name), auth.uid()::text || '_')
  and not exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and name in (u.id_document, u.certificate_document)
  )
);

-- Publish only the final verified status; pending and rejection details remain
-- private to the professional and administrators.
drop function if exists public.get_public_profile(uuid);
create function public.get_public_profile(p_user_id uuid)
returns table (
  id uuid,
  username text,
  first_name text,
  last_name text,
  role text,
  business_name text,
  description text,
  profile_photo text,
  portfolio text[],
  business_type text[],
  latitude double precision,
  longitude double precision,
  radius_km numeric,
  city text,
  country text,
  verification_status text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    u.id,
    u.username,
    u.first_name,
    u.last_name,
    u.role,
    u.business_name,
    u.description,
    u.profile_photo,
    u.portfolio,
    u.business_type,
    case when u.role = 'pro' and u.show_working_radius then u.latitude end,
    case when u.role = 'pro' and u.show_working_radius then u.longitude end,
    case when u.role = 'pro' and u.show_working_radius then u.radius_km end,
    case when u.show_city then u.city end,
    case when u.show_country then u.country end,
    case when u.role = 'pro' and u.verification_status = 'verified'
      then 'verified' else 'unverified' end
  from public.users u
  where u.id = p_user_id and u.onboarding_completed = true
$$;

revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;
