-- Versioned legal documents, attributable acceptance evidence and transaction
-- snapshots. Public copy is version-controlled in src/legal/legalDocuments.js;
-- content_sha256 binds each database version to that exact source revision.

begin;

create table public.legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_code text not null check (
    document_code in ('legal_notice', 'privacy_notice', 'client_terms', 'provider_terms')
  ),
  version text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  locale text not null default 'en' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  title text not null check (length(trim(title)) between 1 and 200),
  route text not null check (route ~ '^/'),
  audience text not null check (audience in ('public', 'all', 'pro')),
  acceptance_kind text not null check (
    acceptance_kind in ('none', 'notice_acknowledgement', 'contract_acceptance')
  ),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  effective_at timestamptz not null,
  published_at timestamptz not null,
  retired_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (document_code, locale, version),
  constraint legal_document_public_acceptance_consistent check (
    (document_code = 'legal_notice' and acceptance_kind = 'none')
    or (document_code <> 'legal_notice' and acceptance_kind <> 'none')
  ),
  constraint legal_document_retirement_consistent check (
    retired_at is null or retired_at >= published_at
  )
);

create unique index legal_document_versions_current_uidx
on public.legal_document_versions (document_code, locale)
where retired_at is null;

create table public.user_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subject_id uuid not null,
  document_version_id uuid not null
    references public.legal_document_versions(id) on delete restrict,
  document_code text not null,
  document_version text not null,
  document_title text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  acceptance_kind text not null check (
    acceptance_kind in ('notice_acknowledgement', 'contract_acceptance')
  ),
  acceptance_context text not null check (
    acceptance_context in ('signup', 'onboarding', 'upgrade', 'reauthorization', 'account')
  ),
  locale text not null,
  operation_id uuid not null,
  accepted_at timestamptz not null default clock_timestamp(),
  unique (subject_id, document_version_id),
  unique (subject_id, operation_id, document_version_id)
);

create index user_legal_acceptances_subject_idx
on public.user_legal_acceptances (subject_id, accepted_at desc);

create table public.legal_transaction_snapshots (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null check (
    transaction_type in ('legacy_checkout', 'checkout_v2', 'connect_onboarding')
  ),
  transaction_id text not null check (length(transaction_id) between 1 and 255),
  subject_id uuid not null,
  acceptance_id uuid not null
    references public.user_legal_acceptances(id) on delete restrict,
  document_version_id uuid not null
    references public.legal_document_versions(id) on delete restrict,
  document_code text not null,
  document_version text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  snapshotted_at timestamptz not null default clock_timestamp(),
  unique (transaction_type, transaction_id, document_version_id)
);

create index legal_transaction_snapshots_subject_idx
on public.legal_transaction_snapshots (subject_id, snapshotted_at desc);

insert into public.legal_document_versions (
  document_code, version, locale, title, route, audience, acceptance_kind,
  content_sha256, effective_at, published_at
) values
  (
    'legal_notice', '2026-10-12', 'en', 'Legal Notice', '/legal', 'public', 'none',
    '53c0e10197828cab990695048bd4d933a8b3ac46a61f9bf5947d2fc4125ed4d3',
    '2026-10-12 00:00:00+02', '2026-10-12 00:00:00+02'
  ),
  (
    'privacy_notice', '2026-10-12', 'en', 'Privacy Notice', '/privacy', 'all',
    'notice_acknowledgement',
    '98837283cea64be06082f3bde7d645c020c27b9f8f8f2208c852a77b1c461f5b',
    '2026-10-12 00:00:00+02', '2026-10-12 00:00:00+02'
  ),
  (
    'client_terms', '2026-10-12', 'en', 'Terms of Use and Booking', '/terms', 'all',
    'contract_acceptance',
    '79d2959e65769db75acc0378bff164faaad80808b8056a3646d04a84e3261963',
    '2026-10-12 00:00:00+02', '2026-10-12 00:00:00+02'
  ),
  (
    'provider_terms', '2026-10-12', 'en', 'Professional Terms',
    '/terms/professionals', 'pro', 'contract_acceptance',
    'd1c1316214afb0e2fef1ddd210dd68cbb3d9c6a90710b215dadbc687ff3c7cf1',
    '2026-10-12 00:00:00+02', '2026-10-12 00:00:00+02'
  );

create or replace function public.legal_required_document_codes(p_role text)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_role = 'pro'
    then array['privacy_notice', 'client_terms', 'provider_terms']::text[]
    else array['privacy_notice', 'client_terms']::text[]
  end
$$;

create or replace function public.require_user_current_legal_acceptances(
  p_user_id uuid,
  p_document_codes text[]
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_missing text[];
begin
  if p_user_id is null or coalesce(cardinality(p_document_codes), 0) = 0 then
    raise exception 'A user and at least one legal document are required'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(requested.document_code order by requested.document_code), '{}'::text[])
  into v_missing
  from unnest(p_document_codes) requested(document_code)
  left join public.legal_document_versions document
    on document.document_code = requested.document_code
   and document.locale = 'en'
   and document.retired_at is null
   and document.published_at <= clock_timestamp()
   and document.effective_at <= clock_timestamp()
  where document.id is null
     or not exists (
       select 1
       from public.user_legal_acceptances acceptance
       where acceptance.subject_id = p_user_id
         and acceptance.document_version_id = document.id
     );

  if cardinality(v_missing) > 0 then
    raise exception 'Current legal acceptance required: %', array_to_string(v_missing, ', ')
      using errcode = '42501',
        hint = 'Open /legal/accept and accept the current document versions.';
  end if;
end
$$;

create or replace function public.get_my_legal_requirements(
  p_intended_role text default null
)
returns table (
  document_code text,
  version text,
  title text,
  route text,
  acceptance_kind text,
  content_sha256 text,
  required boolean,
  acceptance_id uuid,
  accepted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_role text;
  v_target_role text;
begin
  if v_user_id is null or auth.role() <> 'authenticated' then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select role into v_current_role from public.users where id = v_user_id;
  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;
  if p_intended_role is not null and p_intended_role <> 'pro' then
    raise exception 'Invalid intended role' using errcode = '22023';
  end if;
  v_target_role := coalesce(p_intended_role, v_current_role);

  return query
  select document.document_code, document.version, document.title,
    document.route, document.acceptance_kind, document.content_sha256,
    true, acceptance.id, acceptance.accepted_at
  from public.legal_document_versions document
  left join public.user_legal_acceptances acceptance
    on acceptance.subject_id = v_user_id
   and acceptance.document_version_id = document.id
  where document.locale = 'en'
    and document.document_code = any(public.legal_required_document_codes(v_target_role))
    and document.retired_at is null
    and document.published_at <= clock_timestamp()
    and document.effective_at <= clock_timestamp()
  order by array_position(
    public.legal_required_document_codes(v_target_role), document.document_code
  );
end
$$;

create or replace function public.record_my_legal_acceptances(
  p_documents jsonb,
  p_context text,
  p_intended_role text,
  p_locale text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_role text;
  v_target_role text;
  v_required_codes text[];
  v_submitted_count integer;
  v_inserted_count integer := 0;
  v_item jsonb;
  v_document public.legal_document_versions%rowtype;
  v_missing text[];
begin
  if v_user_id is null or auth.role() <> 'authenticated' then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_context not in ('onboarding', 'upgrade', 'reauthorization', 'account') then
    raise exception 'Invalid legal acceptance context' using errcode = '22023';
  end if;
  if p_locale <> 'en' then
    raise exception 'Unsupported legal document locale' using errcode = '22023';
  end if;
  if p_operation_id is null then
    raise exception 'Legal acceptance operation id is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_documents) <> 'array' then
    raise exception 'Legal documents must be a JSON array' using errcode = '22023';
  end if;

  select role into v_current_role from public.users where id = v_user_id for update;
  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;
  if p_intended_role is not null and p_intended_role <> 'pro' then
    raise exception 'Invalid intended role' using errcode = '22023';
  end if;
  if p_intended_role = 'pro' and p_context <> 'upgrade' then
    raise exception 'An intended professional role is only valid during upgrade'
      using errcode = '22023';
  end if;

  v_target_role := coalesce(p_intended_role, v_current_role);
  v_required_codes := public.legal_required_document_codes(v_target_role);
  select count(*) into v_submitted_count from jsonb_array_elements(p_documents);
  if v_submitted_count < 1 or v_submitted_count > cardinality(v_required_codes) then
    raise exception 'Invalid legal document count' using errcode = '22023';
  end if;
  if (
    select count(distinct item ->> 'code') from jsonb_array_elements(p_documents) item
  ) <> v_submitted_count then
    raise exception 'Duplicate legal document submission' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_documents)
  loop
    select * into v_document
    from public.legal_document_versions document
    where document.document_code = v_item ->> 'code'
      and document.version = v_item ->> 'version'
      and document.locale = p_locale
      and document.document_code = any(v_required_codes)
      and document.acceptance_kind <> 'none'
      and document.retired_at is null
      and document.published_at <= clock_timestamp()
      and document.effective_at <= clock_timestamp();

    if not found then
      raise exception 'Legal document is not a current requirement: %', v_item ->> 'code'
        using errcode = '22023';
    end if;

    insert into public.user_legal_acceptances (
      user_id, subject_id, document_version_id, document_code,
      document_version, document_title, content_sha256, acceptance_kind,
      acceptance_context, locale, operation_id
    ) values (
      v_user_id, v_user_id, v_document.id, v_document.document_code,
      v_document.version, v_document.title, v_document.content_sha256,
      v_document.acceptance_kind, p_context, p_locale, p_operation_id
    ) on conflict (subject_id, document_version_id) do nothing;
    v_inserted_count := v_inserted_count + 1;
  end loop;

  select coalesce(array_agg(document.document_code order by document.document_code), '{}'::text[])
  into v_missing
  from public.legal_document_versions document
  where document.document_code = any(v_required_codes)
    and document.locale = p_locale
    and document.retired_at is null
    and document.published_at <= clock_timestamp()
    and document.effective_at <= clock_timestamp()
    and not exists (
      select 1 from public.user_legal_acceptances acceptance
      where acceptance.subject_id = v_user_id
        and acceptance.document_version_id = document.id
    );

  if cardinality(v_missing) > 0 then
    raise exception 'All current legal documents must be accepted together: %',
      array_to_string(v_missing, ', ') using errcode = '42501';
  end if;

  return jsonb_build_object(
    'accepted', v_inserted_count,
    'role', v_target_role,
    'operation_id', p_operation_id,
    'versions', (
      select jsonb_object_agg(document.document_code, document.version)
      from public.legal_document_versions document
      where document.document_code = any(v_required_codes)
        and document.locale = p_locale and document.retired_at is null
    )
  );
end
$$;

create or replace function public.record_signup_legal_acceptances(
  p_user_id uuid,
  p_role text,
  p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_required_codes text[] := public.legal_required_document_codes(p_role);
  v_acceptances jsonb := coalesce(p_metadata -> 'legal_acceptances', '{}'::jsonb);
  v_operation_id uuid := gen_random_uuid();
  v_document public.legal_document_versions%rowtype;
  v_code text;
begin
  if jsonb_typeof(v_acceptances) <> 'object'
     or p_metadata ->> 'legal_acceptance_context' <> 'signup'
     or p_metadata ->> 'legal_acceptance_locale' <> 'en'
     or p_metadata ->> 'legal_acceptance_surface' <> 'web_signup' then
    return;
  end if;

  foreach v_code in array v_required_codes loop
    select * into v_document
    from public.legal_document_versions document
    where document.document_code = v_code
      and document.locale = 'en'
      and document.retired_at is null
      and document.published_at <= clock_timestamp()
      and document.effective_at <= clock_timestamp();
    if not found or v_acceptances ->> v_code is distinct from v_document.version then
      return;
    end if;
  end loop;

  foreach v_code in array v_required_codes loop
    select * into v_document
    from public.legal_document_versions document
    where document.document_code = v_code
      and document.locale = 'en'
      and document.retired_at is null;

    insert into public.user_legal_acceptances (
      user_id, subject_id, document_version_id, document_code,
      document_version, document_title, content_sha256, acceptance_kind,
      acceptance_context, locale, operation_id
    ) values (
      p_user_id, p_user_id, v_document.id, v_document.document_code,
      v_document.version, v_document.title, v_document.content_sha256,
      v_document.acceptance_kind, 'signup', 'en', v_operation_id
    ) on conflict (subject_id, document_version_id) do nothing;
  end loop;
end
$$;

create or replace function public.assert_user_current_legal_acceptances(
  p_user_id uuid,
  p_document_codes text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_versions jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform public.require_user_current_legal_acceptances(p_user_id, p_document_codes);
  select jsonb_object_agg(document.document_code, document.version)
  into v_versions
  from public.legal_document_versions document
  where document.document_code = any(p_document_codes)
    and document.locale = 'en' and document.retired_at is null
    and document.published_at <= clock_timestamp()
    and document.effective_at <= clock_timestamp();
  return coalesce(v_versions, '{}'::jsonb);
end
$$;

create or replace function public.snapshot_user_legal_acceptances(
  p_user_id uuid,
  p_document_codes text[],
  p_transaction_type text,
  p_transaction_id text,
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_versions jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_transaction_type not in ('legacy_checkout', 'checkout_v2', 'connect_onboarding')
     or length(coalesce(p_transaction_id, '')) not between 1 and 255
     or jsonb_typeof(coalesce(p_evidence, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid legal transaction snapshot' using errcode = '22023';
  end if;

  v_versions := public.assert_user_current_legal_acceptances(p_user_id, p_document_codes);

  insert into public.legal_transaction_snapshots (
    transaction_type, transaction_id, subject_id, acceptance_id,
    document_version_id, document_code, document_version, content_sha256, evidence
  )
  select p_transaction_type, p_transaction_id, p_user_id, acceptance.id,
    document.id, document.document_code, document.version, document.content_sha256,
    coalesce(p_evidence, '{}'::jsonb)
  from public.legal_document_versions document
  join public.user_legal_acceptances acceptance
    on acceptance.subject_id = p_user_id
   and acceptance.document_version_id = document.id
  where document.document_code = any(p_document_codes)
    and document.locale = 'en' and document.retired_at is null
    and document.published_at <= clock_timestamp()
    and document.effective_at <= clock_timestamp()
  on conflict (transaction_type, transaction_id, document_version_id) do nothing;

  return v_versions;
end
$$;

create or replace function public.reject_legal_evidence_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Account deletion removes only the live auth link. The immutable subject id
  -- and every contractual evidence field remain intact for legal retention.
  if tg_table_name = 'user_legal_acceptances' and tg_op = 'UPDATE' then
    if old.user_id is not null
       and new.user_id is null
       and (to_jsonb(new) - 'user_id') = (to_jsonb(old) - 'user_id') then
      return new;
    end if;
  end if;
  raise exception 'Legal acceptance evidence is append-only' using errcode = '55000';
end
$$;

create trigger user_legal_acceptances_immutable
before update or delete on public.user_legal_acceptances
for each row execute function public.reject_legal_evidence_mutation();

create trigger legal_transaction_snapshots_immutable
before update or delete on public.legal_transaction_snapshots
for each row execute function public.reject_legal_evidence_mutation();

create or replace function public.enforce_professional_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' and auth.uid() is not null then
    perform public.require_user_current_legal_acceptances(
      auth.uid(), array['privacy_notice', 'client_terms', 'provider_terms']
    );
  end if;
  return new;
end
$$;

create trigger provider_eligibility_requires_legal_acceptance
before insert on public.provider_eligibility_declarations
for each row execute function public.enforce_professional_legal_acceptance();

create trigger paid_proposal_requires_legal_acceptance
before insert or update on public.paid_proposal_drafts
for each row execute function public.enforce_professional_legal_acceptance();

create trigger mission_proposal_requires_legal_acceptance
before insert on public.missions
for each row
when (new.pro_id is not null)
execute function public.enforce_professional_legal_acceptance();

create or replace function public.enforce_professional_role_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.role <> 'pro' and new.role = 'pro'
     and auth.role() = 'authenticated' and auth.uid() = new.id then
    perform public.require_user_current_legal_acceptances(
      new.id, array['privacy_notice', 'client_terms', 'provider_terms']
    );
  end if;
  return new;
end
$$;

create trigger user_professional_role_requires_legal_acceptance
before update of role on public.users
for each row execute function public.enforce_professional_role_acceptance();

-- Preserve the existing admin-account exception while recording valid signup
-- acceptances only after the public profile has been created successfully.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := case when new.raw_user_meta_data ->> 'requested_role' = 'pro'
    then 'pro' else 'client' end;
begin
  if new.raw_app_meta_data ->> 'account_type' = 'admin' then return new; end if;
  insert into public.users (
    id, email, role, active_role, theme, username, business_name
  ) values (
    new.id, new.email, v_role, v_role, 'light',
    nullif(lower(trim(new.raw_user_meta_data ->> 'username')), ''),
    nullif(trim(new.raw_user_meta_data ->> 'business_name'), '')
  );
  perform public.record_signup_legal_acceptances(new.id, v_role, new.raw_user_meta_data);
  return new;
end
$$;

alter table public.legal_document_versions enable row level security;
alter table public.user_legal_acceptances enable row level security;
alter table public.legal_transaction_snapshots enable row level security;

create policy legal_document_versions_public_read
on public.legal_document_versions
for select
to anon, authenticated
using (published_at <= clock_timestamp());

revoke all on public.legal_document_versions from public, anon, authenticated;
revoke all on public.user_legal_acceptances from public, anon, authenticated;
revoke all on public.legal_transaction_snapshots from public, anon, authenticated;
grant select on public.legal_document_versions to anon, authenticated;
grant all on public.legal_document_versions to service_role;
grant all on public.user_legal_acceptances to service_role;
grant all on public.legal_transaction_snapshots to service_role;

revoke all on function public.legal_required_document_codes(text)
from public, anon, authenticated;
revoke all on function public.require_user_current_legal_acceptances(uuid, text[])
from public, anon, authenticated;
revoke all on function public.record_signup_legal_acceptances(uuid, text, jsonb)
from public, anon, authenticated;
revoke all on function public.reject_legal_evidence_mutation()
from public, anon, authenticated;
revoke all on function public.enforce_professional_legal_acceptance()
from public, anon, authenticated;
revoke all on function public.enforce_professional_role_acceptance()
from public, anon, authenticated;

revoke all on function public.get_my_legal_requirements(text)
from public, anon;
grant execute on function public.get_my_legal_requirements(text) to authenticated;

revoke all on function public.record_my_legal_acceptances(jsonb, text, text, text, uuid)
from public, anon;
grant execute on function public.record_my_legal_acceptances(jsonb, text, text, text, uuid)
to authenticated;

revoke all on function public.assert_user_current_legal_acceptances(uuid, text[])
from public, anon, authenticated;
grant execute on function public.assert_user_current_legal_acceptances(uuid, text[])
to service_role;

revoke all on function public.snapshot_user_legal_acceptances(uuid, text[], text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.snapshot_user_legal_acceptances(uuid, text[], text, text, jsonb)
to service_role;

commit;
