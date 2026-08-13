-- Provider eligibility and Stripe Connect Accounts v2 foundation.
--
-- This migration remains additive to the financial path: it does not create a
-- new financial_flow_versions row and does not change Checkout, transfers,
-- refunds or payouts. Existing legacy_v1 functions remain authoritative.

begin;

create table public.provider_eligibility_policy_versions (
  version text primary key,
  jurisdiction_code text not null,
  residence_country_code text,
  service_country_code text,
  provider_status_code text,
  service_category_code text,
  requirement_definitions jsonb not null default '[]'::jsonb,
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  constraint eligibility_policy_version_format check (
    version ~ '^[a-z][a-z0-9_.-]{2,99}$'
  ),
  constraint eligibility_policy_jurisdiction_format check (
    jurisdiction_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'
  ),
  constraint eligibility_policy_residence_country_format check (
    residence_country_code is null or residence_country_code ~ '^[A-Z]{2}$'
  ),
  constraint eligibility_policy_service_country_format check (
    service_country_code is null or service_country_code ~ '^[A-Z]{2}$'
  ),
  constraint eligibility_policy_status_code_format check (
    provider_status_code is null
    or provider_status_code ~ '^[a-z][a-z0-9_.-]{1,99}$'
  ),
  constraint eligibility_policy_service_category_format check (
    service_category_code is null
    or service_category_code ~ '^[a-z][a-z0-9_.-]{1,99}$'
  ),
  constraint eligibility_policy_requirements_array check (
    jsonb_typeof(requirement_definitions) = 'array'
  ),
  constraint eligibility_policy_effective_period check (
    effective_until is null or effective_until > effective_from
  ),
  constraint eligibility_policy_notes_length check (
    notes is null or length(notes) between 1 and 4000
  )
);

comment on table public.provider_eligibility_policy_versions is
  'Immutable jurisdiction-specific eligibility definitions. No national rule is seeded by this migration.';

create trigger provider_eligibility_policy_versions_immutable
before update or delete on public.provider_eligibility_policy_versions
for each row execute function public.reject_financial_definition_mutation();

create table public.provider_eligibility_declarations (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.users(id) on delete restrict,
  revision integer not null check (revision > 0),
  residence_country_code text not null,
  tax_residence_country_codes text[] not null default '{}'::text[],
  service_country_code text not null,
  provider_status_code text not null,
  trader_classification text not null,
  business_registration_number text,
  vat_number text,
  declaration_data jsonb not null default '{}'::jsonb,
  actor_type text not null check (actor_type in ('provider', 'admin', 'system')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  deduplication_key text not null unique,
  created_at timestamptz not null default now(),
  unique (provider_id, revision),
  unique (id, provider_id),
  constraint eligibility_declaration_residence_country_format check (
    residence_country_code ~ '^[A-Z]{2}$'
  ),
  constraint eligibility_declaration_tax_residences_format check (
    public.financial_text_array_matches(
      tax_residence_country_codes,
      '^[A-Z]{2}$'
    )
    and public.financial_text_array_is_unique(tax_residence_country_codes)
  ),
  constraint eligibility_declaration_service_country_format check (
    service_country_code ~ '^[A-Z]{2}$'
  ),
  constraint eligibility_declaration_status_format check (
    provider_status_code ~ '^[a-z][a-z0-9_.-]{1,99}$'
  ),
  constraint eligibility_declaration_trader_length check (
    length(trader_classification) between 1 and 100
  ),
  constraint eligibility_declaration_business_number_length check (
    business_registration_number is null
    or length(business_registration_number) between 1 and 100
  ),
  constraint eligibility_declaration_vat_number_length check (
    vat_number is null or length(vat_number) between 1 and 100
  ),
  constraint eligibility_declaration_data_object check (
    jsonb_typeof(declaration_data) = 'object'
  ),
  constraint eligibility_declaration_actor_consistent check (
    (actor_type = 'system' and actor_user_id is null)
    or
    (actor_type in ('provider', 'admin') and actor_user_id is not null)
  ),
  constraint eligibility_declaration_dedup_length check (
    length(deduplication_key) between 1 and 255
  )
);

comment on table public.provider_eligibility_declarations is
  'Append-only provider declarations. Declared status never proves legal eligibility by itself.';

create trigger provider_eligibility_declarations_immutable
before update or delete on public.provider_eligibility_declarations
for each row execute function public.reject_financial_definition_mutation();

create table public.provider_eligibility_assessments (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.users(id) on delete restrict,
  policy_version text not null
    references public.provider_eligibility_policy_versions(version) on delete restrict,
  declaration_id uuid references public.provider_eligibility_declarations(id) on delete restrict,
  service_country_code text not null,
  service_category_code text not null default '*',
  revision integer not null check (revision > 0),
  status text not null
    check (status in ('pending', 'eligible', 'ineligible', 'review_required')),
  valid_until timestamptz,
  reason text not null check (length(trim(reason)) between 1 and 4000),
  evidence jsonb not null default '{}'::jsonb,
  actor_type text not null check (actor_type in ('admin', 'system')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  deduplication_key text not null unique,
  created_at timestamptz not null default now(),
  unique (id, provider_id),
  unique (
    provider_id,
    policy_version,
    service_country_code,
    service_category_code,
    revision
  ),
  constraint eligibility_assessment_country_format check (
    service_country_code ~ '^[A-Z]{2}$'
  ),
  constraint eligibility_assessment_category_format check (
    service_category_code = '*'
    or service_category_code ~ '^[a-z][a-z0-9_.-]{1,99}$'
  ),
  constraint eligibility_assessment_evidence_object check (
    jsonb_typeof(evidence) = 'object'
  ),
  constraint eligibility_assessment_actor_consistent check (
    (actor_type = 'system' and actor_user_id is null)
    or
    (actor_type = 'admin' and actor_user_id is not null)
  ),
  constraint eligibility_assessment_validity check (
    valid_until is null or valid_until > created_at
  ),
  constraint eligibility_assessment_dedup_length check (
    length(deduplication_key) between 1 and 255
  ),
  constraint eligibility_assessment_declaration_owner_fkey foreign key (
    declaration_id, provider_id
  ) references public.provider_eligibility_declarations(id, provider_id)
    on delete restrict
);

comment on table public.provider_eligibility_assessments is
  'Versioned decisions against an explicit policy. users.verification_status is evidence only, never the financial prerequisite.';

create trigger provider_eligibility_assessments_immutable
before update or delete on public.provider_eligibility_assessments
for each row execute function public.reject_financial_definition_mutation();

create table public.provider_connect_accounts (
  provider_id uuid primary key references public.users(id) on delete restrict,
  stripe_account_id text unique,
  account_api_version text not null default 'accounts_v2'
    check (account_api_version in ('accounts_v1_legacy', 'accounts_v2')),
  dashboard text not null default 'express' check (dashboard = 'express'),
  fees_collector text not null default 'application' check (fees_collector = 'application'),
  losses_collector text not null default 'application' check (losses_collector = 'application'),
  account_configuration text not null default 'recipient'
    check (account_configuration = 'recipient'),
  default_currency text not null default 'eur' check (default_currency = 'eur'),
  creation_state text not null default 'creating'
    check (creation_state in ('creating', 'created', 'closed', 'sync_failed')),
  creation_generation integer not null default 1 check (creation_generation > 0),
  creation_idempotency_key text not null unique,
  stripe_transfers_status text not null default 'unknown'
    check (stripe_transfers_status in ('unknown', 'pending', 'active', 'restricted', 'unsupported')),
  payouts_status text not null default 'unknown'
    check (payouts_status in ('unknown', 'pending', 'active', 'restricted', 'unsupported')),
  stripe_transfers_status_details jsonb not null default '[]'::jsonb,
  payouts_status_details jsonb not null default '[]'::jsonb,
  requirements jsonb not null default '{}'::jsonb,
  future_requirements jsonb not null default '{}'::jsonb,
  applied_configurations text[] not null default '{}'::text[],
  livemode boolean,
  closed boolean not null default false,
  connection_enabled boolean not null default true,
  last_stripe_event_id text,
  last_stripe_event_created_at timestamptz,
  last_synced_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_connect_account_id_format check (
    stripe_account_id is null or stripe_account_id ~ '^acct_[A-Za-z0-9]+$'
  ),
  constraint provider_connect_creation_key_length check (
    length(creation_idempotency_key) between 1 and 255
  ),
  constraint provider_connect_status_details_arrays check (
    jsonb_typeof(stripe_transfers_status_details) = 'array'
    and jsonb_typeof(payouts_status_details) = 'array'
  ),
  constraint provider_connect_requirements_objects check (
    jsonb_typeof(requirements) = 'object'
    and jsonb_typeof(future_requirements) = 'object'
  ),
  constraint provider_connect_configurations_unique check (
    public.financial_text_array_is_unique(applied_configurations)
  ),
  constraint provider_connect_creation_consistent check (
    (creation_state = 'creating' and stripe_account_id is null and closed = false)
    or
    (creation_state in ('created', 'sync_failed') and stripe_account_id is not null and closed = false)
    or
    (creation_state = 'closed' and stripe_account_id is not null and closed = true)
  )
);

comment on table public.provider_connect_accounts is
  'Canonical server-side Accounts v2 readiness. users Stripe booleans remain compatibility projections only.';

create table public.stripe_connect_webhook_events (
  event_id text primary key,
  event_type text not null,
  stripe_account_id text not null
    references public.provider_connect_accounts(stripe_account_id) on delete restrict,
  stripe_created_at timestamptz not null,
  livemode boolean not null,
  applied boolean not null,
  payload_summary jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  constraint stripe_connect_event_id_length check (length(event_id) between 1 and 255),
  constraint stripe_connect_event_type_format check (
    event_type ~ '^[a-z0-9_.\[\]]{3,200}$'
  ),
  constraint stripe_connect_event_account_format check (
    stripe_account_id ~ '^acct_[A-Za-z0-9]+$'
  ),
  constraint stripe_connect_event_summary_object check (
    jsonb_typeof(payload_summary) = 'object'
  )
);

create trigger stripe_connect_webhook_events_immutable
before update or delete on public.stripe_connect_webhook_events
for each row execute function public.reject_financial_definition_mutation();

create table public.paid_proposal_drafts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  provider_id uuid not null references public.users(id) on delete restrict,
  client_id uuid not null references public.users(id) on delete restrict,
  eligibility_policy_version text not null
    references public.provider_eligibility_policy_versions(version) on delete restrict,
  service_category_code text not null,
  service_country_code text not null,
  service_amount_cents bigint not null check (service_amount_cents > 0),
  travel_amount_cents bigint not null default 0 check (travel_amount_cents >= 0),
  currency text not null default 'eur' check (currency = 'eur'),
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz,
  description text,
  publication_state text not null default 'draft'
    check (publication_state in ('draft', 'blocked_requirements', 'ready_for_publication', 'published', 'withdrawn')),
  blocker_codes text[] not null default '{}'::text[],
  eligibility_assessment_id uuid,
  published_proposal_id uuid references public.missions(id) on delete restrict,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, provider_id),
  constraint paid_proposal_draft_category_format check (
    service_category_code ~ '^[a-z][a-z0-9_.-]{1,99}$'
  ),
  constraint paid_proposal_draft_country_format check (
    service_country_code ~ '^[A-Z]{2}$'
  ),
  constraint paid_proposal_draft_schedule check (
    scheduled_end_at is null or scheduled_end_at >= scheduled_start_at
  ),
  constraint paid_proposal_draft_description_length check (
    description is null or length(description) between 1 and 10000
  ),
  constraint paid_proposal_draft_blockers_format check (
    public.financial_text_array_is_unique(blocker_codes)
    and public.financial_text_array_matches(blocker_codes, '^[a-z][a-z0-9_.-]{2,99}$')
  ),
  constraint paid_proposal_draft_publication_consistent check (
    (publication_state = 'published' and published_proposal_id is not null)
    or
    (publication_state <> 'published' and published_proposal_id is null)
  ),
  constraint paid_proposal_draft_assessment_owner_fkey foreign key (
    eligibility_assessment_id, provider_id
  ) references public.provider_eligibility_assessments(id, provider_id)
    on delete restrict
);

comment on table public.paid_proposal_drafts is
  'Inactive v2 proposal-draft foundation. Missing prerequisites preserve the full draft instead of publishing it.';

create table public.paid_proposal_draft_events (
  id bigint generated always as identity primary key,
  draft_id uuid not null references public.paid_proposal_drafts(id) on delete restrict,
  event_type text not null,
  from_state text,
  to_state text not null,
  blocker_codes text[] not null default '{}'::text[],
  actor_type text not null check (actor_type in ('provider', 'admin', 'system')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  revision bigint not null check (revision > 0),
  deduplication_key text not null unique,
  created_at timestamptz not null default now(),
  constraint paid_proposal_event_type_format check (
    event_type ~ '^[a-z][a-z0-9_.]{2,100}$'
  ),
  constraint paid_proposal_event_actor_consistent check (
    (actor_type = 'system' and actor_user_id is null)
    or
    (actor_type in ('provider', 'admin') and actor_user_id is not null)
  ),
  constraint paid_proposal_event_dedup_length check (
    length(deduplication_key) between 1 and 255
  )
);

create trigger paid_proposal_draft_events_immutable
before update or delete on public.paid_proposal_draft_events
for each row execute function public.reject_financial_definition_mutation();

create or replace function public.protect_provider_connect_account()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Provider Connect account state cannot be deleted'
      using errcode = '55000';
  end if;
  if current_setting('app.trusted_connect_sync', true) is distinct from 'on' then
    raise exception 'Provider Connect account state is server-managed'
      using errcode = '42501';
  end if;
  if new.provider_id is distinct from old.provider_id
     or new.created_at is distinct from old.created_at
     or new.creation_generation is distinct from old.creation_generation
     or new.creation_idempotency_key is distinct from old.creation_idempotency_key
     or new.revision <> old.revision + 1
     or new.updated_at <= old.updated_at then
    raise exception 'Invalid Provider Connect account update'
      using errcode = '55000';
  end if;
  return new;
end
$$;

create trigger protect_provider_connect_account
before update or delete on public.provider_connect_accounts
for each row execute function public.protect_provider_connect_account();

create or replace function public.protect_paid_proposal_draft()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Paid proposal drafts cannot be deleted' using errcode = '55000';
  end if;
  if current_setting('app.trusted_paid_proposal_draft', true) is distinct from 'on' then
    raise exception 'Paid proposal drafts can only change through trusted functions'
      using errcode = '42501';
  end if;
  if new.id is distinct from old.id
     or new.booking_id is distinct from old.booking_id
     or new.provider_id is distinct from old.provider_id
     or new.client_id is distinct from old.client_id
     or new.created_at is distinct from old.created_at
     or new.revision <> old.revision + 1
     or new.updated_at <= old.updated_at then
    raise exception 'Invalid paid proposal draft update' using errcode = '55000';
  end if;
  return new;
end
$$;

create trigger protect_paid_proposal_draft
before update or delete on public.paid_proposal_drafts
for each row execute function public.protect_paid_proposal_draft();

-- Existing accounts are recorded without trusting deprecated readiness flags.
insert into public.provider_connect_accounts (
  provider_id,
  stripe_account_id,
  account_api_version,
  creation_state,
  creation_idempotency_key,
  stripe_transfers_status,
  payouts_status
)
select
  u.id,
  u.stripe_account_id,
  'accounts_v1_legacy',
  'created',
  'connect-account-existing:' || u.id::text,
  'unknown',
  'unknown'
from public.users u
where u.role = 'pro' and u.stripe_account_id is not null
on conflict (provider_id) do nothing;

create or replace function public.submit_provider_eligibility_declaration(
  p_residence_country_code text,
  p_tax_residence_country_codes text[],
  p_service_country_code text,
  p_provider_status_code text,
  p_trader_classification text,
  p_business_registration_number text,
  p_vat_number text,
  p_declaration_data jsonb,
  p_deduplication_key text
)
returns public.provider_eligibility_declarations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider_id uuid := auth.uid();
  v_revision integer;
  v_result public.provider_eligibility_declarations%rowtype;
  v_tax_residence_country_codes text[];
begin
  if v_provider_id is null or auth.role() <> 'authenticated' then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.users where id = v_provider_id and role = 'pro'
  ) then
    raise exception 'Provider profile required' using errcode = '42501';
  end if;

  select * into v_result
  from public.provider_eligibility_declarations
  where deduplication_key = p_deduplication_key;
  if found then
    if v_result.provider_id <> v_provider_id then
      raise exception 'Declaration operation identity belongs to another provider'
        using errcode = '23505';
    end if;
    return v_result;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('eligibility:' || v_provider_id::text, 0));
  select coalesce(max(revision), 0) + 1 into v_revision
  from public.provider_eligibility_declarations
  where provider_id = v_provider_id;

  select coalesce(array_agg(upper(code) order by ordinal), '{}'::text[])
  into v_tax_residence_country_codes
  from unnest(coalesce(p_tax_residence_country_codes, '{}'::text[]))
       with ordinality as residence(code, ordinal);

  insert into public.provider_eligibility_declarations (
    provider_id, revision, residence_country_code,
    tax_residence_country_codes, service_country_code,
    provider_status_code, trader_classification,
    business_registration_number, vat_number, declaration_data,
    actor_type, actor_user_id, deduplication_key
  ) values (
    v_provider_id, v_revision, upper(p_residence_country_code),
    v_tax_residence_country_codes,
    upper(p_service_country_code), lower(p_provider_status_code),
    p_trader_classification, nullif(trim(p_business_registration_number), ''),
    nullif(trim(p_vat_number), ''), coalesce(p_declaration_data, '{}'::jsonb),
    'provider', v_provider_id, p_deduplication_key
  )
  returning * into v_result;
  return v_result;
end
$$;

create or replace function public.record_provider_eligibility_assessment(
  p_provider_id uuid,
  p_policy_version text,
  p_declaration_id uuid,
  p_service_country_code text,
  p_service_category_code text,
  p_status text,
  p_valid_until timestamptz,
  p_reason text,
  p_evidence jsonb,
  p_actor_type text,
  p_actor_user_id uuid,
  p_deduplication_key text
)
returns public.provider_eligibility_assessments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revision integer;
  v_result public.provider_eligibility_assessments%rowtype;
  v_policy public.provider_eligibility_policy_versions%rowtype;
  v_declaration public.provider_eligibility_declarations%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_actor_type is null or p_actor_type not in ('admin', 'system')
     or (p_actor_type = 'system' and p_actor_user_id is not null)
     or (p_actor_type = 'admin' and p_actor_user_id is null) then
    raise exception 'Invalid eligibility decision actor' using errcode = '22023';
  end if;
  if p_actor_type = 'admin' and not exists (
    select 1 from public.app_admins where user_id = p_actor_user_id
  ) then
    raise exception 'Eligibility decision actor is not an administrator'
      using errcode = '42501';
  end if;

  select * into v_policy
  from public.provider_eligibility_policy_versions
  where version = p_policy_version;
  if not found then
    raise exception 'Eligibility policy version not found' using errcode = 'P0002';
  end if;

  if p_declaration_id is not null then
    select * into v_declaration
    from public.provider_eligibility_declarations
    where id = p_declaration_id and provider_id = p_provider_id;
    if not found then
      raise exception 'Eligibility declaration does not belong to provider'
        using errcode = '23503';
    end if;
  end if;

  if (v_policy.service_country_code is not null
      and v_policy.service_country_code <> upper(p_service_country_code))
     or (v_policy.service_category_code is not null
         and v_policy.service_category_code <> p_service_category_code)
     or (v_policy.residence_country_code is not null
         and (p_declaration_id is null
              or v_policy.residence_country_code <> v_declaration.residence_country_code))
     or (v_policy.provider_status_code is not null
         and (p_declaration_id is null
              or v_policy.provider_status_code <> v_declaration.provider_status_code)) then
    raise exception 'Eligibility policy is not applicable to this assessment context'
      using errcode = '23514';
  end if;

  select * into v_result
  from public.provider_eligibility_assessments
  where deduplication_key = p_deduplication_key;
  if found then return v_result; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'eligibility-assessment:' || p_provider_id::text || ':' || p_policy_version
      || ':' || upper(p_service_country_code) || ':' || p_service_category_code,
    0
  ));
  select coalesce(max(revision), 0) + 1 into v_revision
  from public.provider_eligibility_assessments
  where provider_id = p_provider_id
    and policy_version = p_policy_version
    and service_country_code = upper(p_service_country_code)
    and service_category_code = p_service_category_code;

  insert into public.provider_eligibility_assessments (
    provider_id, policy_version, declaration_id, service_country_code,
    service_category_code, revision, status, valid_until, reason, evidence,
    actor_type, actor_user_id, deduplication_key
  ) values (
    p_provider_id, p_policy_version, p_declaration_id,
    upper(p_service_country_code), p_service_category_code, v_revision,
    p_status, p_valid_until, p_reason, coalesce(p_evidence, '{}'::jsonb),
    p_actor_type, p_actor_user_id, p_deduplication_key
  ) returning * into v_result;
  return v_result;
end
$$;

create or replace function public.reserve_provider_connect_account_creation(
  p_provider_id uuid
)
returns table (
  stripe_account_id text,
  creation_idempotency_key text,
  creation_generation integer,
  should_create boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.provider_connect_accounts%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform 1 from public.users
  where id = p_provider_id and role = 'pro'
  for update;
  if not found then
    raise exception 'Provider profile not found' using errcode = 'P0002';
  end if;

  select * into v_account
  from public.provider_connect_accounts
  where provider_id = p_provider_id
  for update;

  if not found then
    insert into public.provider_connect_accounts (
      provider_id, creation_idempotency_key
    ) values (
      p_provider_id,
      'connect-account-v2:' || p_provider_id::text || ':1'
    ) returning * into v_account;
  else
    if not v_account.connection_enabled then
      perform set_config('app.trusted_connect_sync', 'on', true);
      update public.provider_connect_accounts
      set connection_enabled = true,
          revision = revision + 1,
          updated_at = clock_timestamp()
      where provider_id = p_provider_id
      returning * into v_account;
      perform set_config('app.trusted_connect_sync', 'off', true);
    end if;

    if v_account.stripe_account_id is not null then
      update public.users
      set stripe_account_id = v_account.stripe_account_id,
          stripe_account_ready = not v_account.closed
            and v_account.stripe_transfers_status = 'active',
          payouts_enabled = not v_account.closed
            and v_account.payouts_status = 'active',
          updated_at = now()
      where id = p_provider_id;
    end if;
  end if;

  return query select
    v_account.stripe_account_id,
    v_account.creation_idempotency_key,
    v_account.creation_generation,
    v_account.stripe_account_id is null;
end
$$;

create or replace function public.complete_provider_connect_account_creation(
  p_provider_id uuid,
  p_stripe_account_id text,
  p_livemode boolean
)
returns public.provider_connect_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.provider_connect_accounts%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform set_config('app.trusted_connect_sync', 'on', true);
  update public.provider_connect_accounts
  set stripe_account_id = p_stripe_account_id,
      account_api_version = 'accounts_v2',
      creation_state = 'created',
      livemode = p_livemode,
      revision = revision + 1,
      updated_at = clock_timestamp()
  where provider_id = p_provider_id
    and (stripe_account_id is null or stripe_account_id = p_stripe_account_id)
  returning * into v_account;
  perform set_config('app.trusted_connect_sync', 'off', true);
  if not found then
    raise exception 'Connect account reservation does not match provider'
      using errcode = '55000';
  end if;

  update public.users
  set stripe_account_id = p_stripe_account_id,
      stripe_account_ready = false,
      payouts_enabled = false,
      updated_at = now()
  where id = p_provider_id;
  return v_account;
end
$$;

create or replace function public.set_provider_connect_connection_enabled(
  p_provider_id uuid,
  p_enabled boolean
)
returns public.provider_connect_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.provider_connect_accounts%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  perform set_config('app.trusted_connect_sync', 'on', true);
  update public.provider_connect_accounts
  set connection_enabled = p_enabled,
      revision = revision + 1,
      updated_at = clock_timestamp()
  where provider_id = p_provider_id
  returning * into v_account;
  perform set_config('app.trusted_connect_sync', 'off', true);
  if not found then
    raise exception 'Connect account not found' using errcode = 'P0002';
  end if;

  update public.users
  set stripe_account_id = case when p_enabled then v_account.stripe_account_id else null end,
      stripe_account_ready = p_enabled and not v_account.closed
        and v_account.stripe_transfers_status = 'active',
      payouts_enabled = p_enabled and not v_account.closed
        and v_account.payouts_status = 'active',
      updated_at = now()
  where id = p_provider_id;
  return v_account;
end
$$;

create or replace function public.sync_provider_connect_account(
  p_event_id text,
  p_event_type text,
  p_stripe_account_id text,
  p_stripe_created_at timestamptz,
  p_livemode boolean,
  p_dashboard text,
  p_stripe_transfers_status text,
  p_payouts_status text,
  p_stripe_transfers_status_details jsonb,
  p_payouts_status_details jsonb,
  p_requirements jsonb,
  p_future_requirements jsonb,
  p_applied_configurations text[],
  p_closed boolean,
  p_payload_summary jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider_id uuid;
  v_claimed text;
  v_apply boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select provider_id into v_provider_id
  from public.provider_connect_accounts
  where stripe_account_id = p_stripe_account_id
  for update;
  if not found then
    raise exception 'Stripe account is not linked to a provider'
      using errcode = 'P0002';
  end if;

  select last_stripe_event_created_at is null
      or p_stripe_created_at > last_stripe_event_created_at
      or (
        p_stripe_created_at = last_stripe_event_created_at
        and p_event_id > coalesce(last_stripe_event_id, '')
      )
  into v_apply
  from public.provider_connect_accounts
  where provider_id = v_provider_id;

  insert into public.stripe_connect_webhook_events (
    event_id, event_type, stripe_account_id, stripe_created_at,
    livemode, applied, payload_summary
  ) values (
    p_event_id, p_event_type, p_stripe_account_id, p_stripe_created_at,
    p_livemode, v_apply, coalesce(p_payload_summary, '{}'::jsonb)
  )
  on conflict (event_id) do nothing
  returning event_id into v_claimed;
  if v_claimed is null then return false; end if;

  if v_apply then
    perform set_config('app.trusted_connect_sync', 'on', true);
    update public.provider_connect_accounts
    set account_api_version = 'accounts_v2',
        dashboard = p_dashboard,
        creation_state = case when p_closed then 'closed' else 'created' end,
        stripe_transfers_status = p_stripe_transfers_status,
        payouts_status = p_payouts_status,
        stripe_transfers_status_details = coalesce(p_stripe_transfers_status_details, '[]'::jsonb),
        payouts_status_details = coalesce(p_payouts_status_details, '[]'::jsonb),
        requirements = coalesce(p_requirements, '{}'::jsonb),
        future_requirements = coalesce(p_future_requirements, '{}'::jsonb),
        applied_configurations = coalesce(p_applied_configurations, '{}'::text[]),
        livemode = p_livemode,
        closed = p_closed,
        last_stripe_event_id = p_event_id,
        last_stripe_event_created_at = p_stripe_created_at,
        last_synced_at = clock_timestamp(),
        revision = revision + 1,
        updated_at = clock_timestamp()
    where provider_id = v_provider_id;
    perform set_config('app.trusted_connect_sync', 'off', true);

    update public.users
    set stripe_account_ready = not p_closed and p_stripe_transfers_status = 'active'
          and (select connection_enabled from public.provider_connect_accounts where provider_id = v_provider_id),
        payouts_enabled = not p_closed and p_payouts_status = 'active'
          and (select connection_enabled from public.provider_connect_accounts where provider_id = v_provider_id),
        updated_at = now()
    where id = v_provider_id;
  end if;

  return true;
end
$$;

create or replace function public.get_provider_paid_proposal_readiness(
  p_provider_id uuid,
  p_policy_version text,
  p_service_country_code text,
  p_service_category_code text
)
returns table (
  ready boolean,
  blocker_codes text[],
  eligibility_assessment_id uuid,
  eligibility_status text,
  stripe_account_id text,
  stripe_transfers_status text,
  payouts_status text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_policy public.provider_eligibility_policy_versions%rowtype;
  v_assessment public.provider_eligibility_assessments%rowtype;
  v_connect public.provider_connect_accounts%rowtype;
  v_blockers text[] := '{}'::text[];
begin
  if auth.role() <> 'service_role'
     and (auth.role() <> 'authenticated' or auth.uid() <> p_provider_id) then
    raise exception 'Provider or service role required' using errcode = '42501';
  end if;
  select * into v_policy
  from public.provider_eligibility_policy_versions
  where version = p_policy_version;
  if not found then
    raise exception 'Eligibility policy version not found' using errcode = 'P0002';
  end if;

  if v_policy.effective_from > now()
     or (v_policy.effective_until is not null and v_policy.effective_until <= now()) then
    v_blockers := array_append(v_blockers, 'eligibility_policy_inactive');
  end if;
  if (v_policy.service_country_code is not null
      and v_policy.service_country_code <> upper(p_service_country_code))
     or (v_policy.service_category_code is not null
         and v_policy.service_category_code <> p_service_category_code) then
    v_blockers := array_append(v_blockers, 'eligibility_policy_not_applicable');
  end if;

  select * into v_assessment
  from public.provider_eligibility_assessments
  where provider_id = p_provider_id
    and policy_version = p_policy_version
    and service_country_code = upper(p_service_country_code)
    and service_category_code in (p_service_category_code, '*')
  order by (service_category_code = p_service_category_code) desc,
           revision desc
  limit 1;

  if not found then
    v_blockers := array_append(v_blockers, 'eligibility_assessment_missing');
  elsif v_assessment.status <> 'eligible'
        or (v_assessment.valid_until is not null and v_assessment.valid_until <= now()) then
    v_blockers := array_append(v_blockers, 'provider_not_eligible');
  end if;

  select * into v_connect
  from public.provider_connect_accounts
  where provider_id = p_provider_id;
  if not found or v_connect.stripe_account_id is null or v_connect.closed
     or not v_connect.connection_enabled then
    v_blockers := array_append(v_blockers, 'connect_account_missing');
  else
    if v_connect.stripe_transfers_status <> 'active' then
      v_blockers := array_append(v_blockers, 'stripe_transfers_not_active');
    end if;
  end if;

  return query select
    cardinality(v_blockers) = 0,
    v_blockers,
    v_assessment.id,
    v_assessment.status,
    v_connect.stripe_account_id,
    coalesce(v_connect.stripe_transfers_status, 'unknown'),
    coalesce(v_connect.payouts_status, 'unknown');
end
$$;

create or replace function public.save_paid_proposal_draft(
  p_draft_id uuid,
  p_booking_id uuid,
  p_eligibility_policy_version text,
  p_service_category_code text,
  p_service_country_code text,
  p_service_amount_cents bigint,
  p_travel_amount_cents bigint,
  p_scheduled_start_at timestamptz,
  p_scheduled_end_at timestamptz,
  p_description text,
  p_deduplication_key text
)
returns public.paid_proposal_drafts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_draft public.paid_proposal_drafts%rowtype;
begin
  if auth.role() <> 'authenticated' or v_provider_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.users where id = v_provider_id and role = 'pro'
  ) then
    raise exception 'Provider profile required' using errcode = '42501';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if v_booking.pro_id is distinct from v_provider_id
     and not exists (
       select 1 from public.booking_notifications
       where booking_id = p_booking_id and pro_id = v_provider_id
     ) then
    raise exception 'Booking is not available to this provider' using errcode = '42501';
  end if;

  select d.* into v_draft
  from public.paid_proposal_drafts d
  join public.paid_proposal_draft_events e on e.draft_id = d.id
  where e.deduplication_key = p_deduplication_key;
  if found then return v_draft; end if;

  if p_draft_id is null then
    insert into public.paid_proposal_drafts (
      booking_id, provider_id, client_id, eligibility_policy_version,
      service_category_code, service_country_code, service_amount_cents,
      travel_amount_cents, scheduled_start_at, scheduled_end_at, description
    ) values (
      p_booking_id, v_provider_id, v_booking.client_id,
      p_eligibility_policy_version, p_service_category_code,
      upper(p_service_country_code), p_service_amount_cents,
      p_travel_amount_cents, p_scheduled_start_at, p_scheduled_end_at,
      nullif(trim(p_description), '')
    ) returning * into v_draft;
    insert into public.paid_proposal_draft_events (
      draft_id, event_type, from_state, to_state, actor_type,
      actor_user_id, revision, deduplication_key
    ) values (
      v_draft.id, 'proposal_draft.created', null, 'draft', 'provider',
      v_provider_id, v_draft.revision, p_deduplication_key
    );
  else
    perform set_config('app.trusted_paid_proposal_draft', 'on', true);
    update public.paid_proposal_drafts
    set eligibility_policy_version = p_eligibility_policy_version,
        service_category_code = p_service_category_code,
        service_country_code = upper(p_service_country_code),
        service_amount_cents = p_service_amount_cents,
        travel_amount_cents = p_travel_amount_cents,
        scheduled_start_at = p_scheduled_start_at,
        scheduled_end_at = p_scheduled_end_at,
        description = nullif(trim(p_description), ''),
        publication_state = 'draft',
        blocker_codes = '{}'::text[],
        eligibility_assessment_id = null,
        revision = revision + 1,
        updated_at = clock_timestamp()
    where id = p_draft_id and provider_id = v_provider_id
      and publication_state in ('draft', 'blocked_requirements', 'ready_for_publication')
    returning * into v_draft;
    perform set_config('app.trusted_paid_proposal_draft', 'off', true);
    if not found then
      raise exception 'Editable paid proposal draft not found' using errcode = 'P0002';
    end if;
    insert into public.paid_proposal_draft_events (
      draft_id, event_type, from_state, to_state, actor_type,
      actor_user_id, revision, deduplication_key
    ) values (
      v_draft.id, 'proposal_draft.saved', null, 'draft', 'provider',
      v_provider_id, v_draft.revision, p_deduplication_key
    );
  end if;
  return v_draft;
end
$$;

create or replace function public.refresh_paid_proposal_draft_readiness(
  p_draft_id uuid,
  p_deduplication_key text
)
returns public.paid_proposal_drafts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_draft public.paid_proposal_drafts%rowtype;
  v_readiness record;
  v_state text;
begin
  select * into v_draft from public.paid_proposal_drafts
  where id = p_draft_id for update;
  if not found then raise exception 'Paid proposal draft not found' using errcode = 'P0002'; end if;
  if auth.role() <> 'service_role'
     and (auth.role() <> 'authenticated' or auth.uid() <> v_draft.provider_id) then
    raise exception 'Provider or service role required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.paid_proposal_draft_events
    where deduplication_key = p_deduplication_key and draft_id = p_draft_id
  ) then return v_draft; end if;

  select * into v_readiness
  from public.get_provider_paid_proposal_readiness(
    v_draft.provider_id, v_draft.eligibility_policy_version,
    v_draft.service_country_code, v_draft.service_category_code
  );
  v_state := case when v_readiness.ready
    then 'ready_for_publication' else 'blocked_requirements' end;

  perform set_config('app.trusted_paid_proposal_draft', 'on', true);
  update public.paid_proposal_drafts
  set publication_state = v_state,
      blocker_codes = v_readiness.blocker_codes,
      eligibility_assessment_id = v_readiness.eligibility_assessment_id,
      revision = revision + 1,
      updated_at = clock_timestamp()
  where id = p_draft_id
  returning * into v_draft;
  perform set_config('app.trusted_paid_proposal_draft', 'off', true);

  insert into public.paid_proposal_draft_events (
    draft_id, event_type, from_state, to_state, blocker_codes,
    actor_type, actor_user_id, revision, deduplication_key
  ) values (
    v_draft.id, 'proposal_draft.readiness_evaluated', null,
    v_draft.publication_state, v_draft.blocker_codes,
    case when auth.role() = 'service_role' then 'system' else 'provider' end,
    case when auth.role() = 'service_role' then null else auth.uid() end,
    v_draft.revision, p_deduplication_key
  );
  return v_draft;
end
$$;

alter table public.provider_eligibility_policy_versions enable row level security;
alter table public.provider_eligibility_declarations enable row level security;
alter table public.provider_eligibility_assessments enable row level security;
alter table public.provider_connect_accounts enable row level security;
alter table public.stripe_connect_webhook_events enable row level security;
alter table public.paid_proposal_drafts enable row level security;
alter table public.paid_proposal_draft_events enable row level security;

revoke all on public.provider_eligibility_policy_versions from public, anon, authenticated;
revoke all on public.provider_eligibility_declarations from public, anon, authenticated;
revoke all on public.provider_eligibility_assessments from public, anon, authenticated;
revoke all on public.provider_connect_accounts from public, anon, authenticated;
revoke all on public.stripe_connect_webhook_events from public, anon, authenticated;
revoke all on public.paid_proposal_drafts from public, anon, authenticated;
revoke all on public.paid_proposal_draft_events from public, anon, authenticated;

grant all on public.provider_eligibility_policy_versions to service_role;
grant all on public.provider_eligibility_declarations to service_role;
grant all on public.provider_eligibility_assessments to service_role;
grant all on public.provider_connect_accounts to service_role;
grant all on public.stripe_connect_webhook_events to service_role;
grant all on public.paid_proposal_drafts to service_role;
grant all on public.paid_proposal_draft_events to service_role;

grant select on public.provider_connect_accounts to authenticated;
grant select on public.paid_proposal_drafts to authenticated;
grant select on public.paid_proposal_draft_events to authenticated;

create policy provider_connect_account_select_own
on public.provider_connect_accounts for select to authenticated
using (provider_id = auth.uid());

create policy paid_proposal_draft_select_own
on public.paid_proposal_drafts for select to authenticated
using (provider_id = auth.uid());

create policy paid_proposal_draft_events_select_own
on public.paid_proposal_draft_events for select to authenticated
using (exists (
  select 1 from public.paid_proposal_drafts d
  where d.id = draft_id and d.provider_id = auth.uid()
));

revoke all on sequence public.paid_proposal_draft_events_id_seq
from public, anon, authenticated;
grant all on sequence public.paid_proposal_draft_events_id_seq to service_role;

revoke all on function public.submit_provider_eligibility_declaration(
  text, text[], text, text, text, text, text, jsonb, text
) from public, anon;
grant execute on function public.submit_provider_eligibility_declaration(
  text, text[], text, text, text, text, text, jsonb, text
) to authenticated;

revoke all on function public.record_provider_eligibility_assessment(
  uuid, text, uuid, text, text, text, timestamptz, text, jsonb, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.record_provider_eligibility_assessment(
  uuid, text, uuid, text, text, text, timestamptz, text, jsonb, text, uuid, text
) to service_role;

revoke all on function public.reserve_provider_connect_account_creation(uuid)
from public, anon, authenticated;
grant execute on function public.reserve_provider_connect_account_creation(uuid)
to service_role;

revoke all on function public.complete_provider_connect_account_creation(uuid, text, boolean)
from public, anon, authenticated;
grant execute on function public.complete_provider_connect_account_creation(uuid, text, boolean)
to service_role;

revoke all on function public.set_provider_connect_connection_enabled(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.set_provider_connect_connection_enabled(uuid, boolean)
to service_role;

revoke all on function public.sync_provider_connect_account(
  text, text, text, timestamptz, boolean, text, text, text, jsonb, jsonb,
  jsonb, jsonb, text[], boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.sync_provider_connect_account(
  text, text, text, timestamptz, boolean, text, text, text, jsonb, jsonb,
  jsonb, jsonb, text[], boolean, jsonb
) to service_role;

revoke all on function public.get_provider_paid_proposal_readiness(uuid, text, text, text)
from public, anon;
grant execute on function public.get_provider_paid_proposal_readiness(uuid, text, text, text)
to authenticated, service_role;

revoke all on function public.save_paid_proposal_draft(
  uuid, uuid, text, text, text, bigint, bigint, timestamptz, timestamptz, text, text
) from public, anon;
grant execute on function public.save_paid_proposal_draft(
  uuid, uuid, text, text, text, bigint, bigint, timestamptz, timestamptz, text, text
) to authenticated;

revoke all on function public.refresh_paid_proposal_draft_readiness(uuid, text)
from public, anon;
grant execute on function public.refresh_paid_proposal_draft_readiness(uuid, text)
to authenticated, service_role;

commit;
