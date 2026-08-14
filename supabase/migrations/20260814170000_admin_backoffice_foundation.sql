-- Secure, separately-routed administration foundation. Administrative
-- authorization is deliberately independent from public.users roles and all
-- browser-facing checks are repeated in security-definer database functions.

create table public.admin_permission_definitions (
  permission_code text primary key,
  description text not null,
  requires_recent_mfa boolean not null default false,
  created_at timestamptz not null default now(),
  constraint admin_permission_code_check
    check (permission_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

create table public.admin_role_definitions (
  role_code text primary key,
  display_name text not null,
  description text not null,
  created_at timestamptz not null default now(),
  constraint admin_role_code_check
    check (role_code in ('support', 'verification', 'disputes', 'finance', 'super_admin'))
);

create table public.admin_role_permissions (
  role_code text not null references public.admin_role_definitions(role_code) on delete restrict,
  permission_code text not null references public.admin_permission_definitions(permission_code) on delete restrict,
  primary key (role_code, permission_code)
);

create table public.admin_accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'disabled')),
  display_name text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_authenticated_at timestamptz,
  revision bigint not null default 1 check (revision > 0)
);

create table public.admin_account_roles (
  user_id uuid not null references public.admin_accounts(user_id) on delete cascade,
  role_code text not null references public.admin_role_definitions(role_code) on delete restrict,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_code)
);

create table public.admin_security_policy_versions (
  version text primary key,
  financial_reauthentication_max_age_seconds integer not null
    check (financial_reauthentication_max_age_seconds between 60 and 3600),
  effective_from timestamptz not null,
  effective_until timestamptz,
  notes text not null,
  created_at timestamptz not null default now(),
  constraint admin_security_policy_window_check
    check (effective_until is null or effective_until > effective_from)
);

create table public.admin_auth_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  admin_account_id uuid references public.admin_accounts(user_id) on delete restrict,
  event_type text not null check (event_type in (
    'access_granted', 'access_denied', 'mfa_required', 'logout'
  )),
  outcome text not null check (outcome in ('success', 'denied', 'challenge_required')),
  session_id text,
  aal text not null,
  mfa_authenticated_at timestamptz,
  client_context jsonb not null default '{}'::jsonb,
  deduplication_key text not null unique,
  occurred_at timestamptz not null default clock_timestamp(),
  constraint admin_auth_context_size_check
    check (octet_length(client_context::text) <= 8192)
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_account_id uuid references public.admin_accounts(user_id) on delete restrict,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  action text not null,
  outcome text not null check (outcome in ('success', 'denied', 'failed')),
  reason text,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  session_id text,
  mfa_authenticated_at timestamptz,
  occurred_at timestamptz not null default clock_timestamp(),
  deduplication_key text unique,
  constraint admin_audit_payload_size_check check (
    octet_length(before_state::text) <= 32768
    and octet_length(after_state::text) <= 32768
    and octet_length(evidence::text) <= 65536
  )
);

create index admin_auth_events_user_time_idx
  on public.admin_auth_events(user_id, occurred_at desc);
create index admin_audit_log_actor_time_idx
  on public.admin_audit_log(admin_account_id, occurred_at desc);
create index admin_audit_log_entity_idx
  on public.admin_audit_log(entity_type, entity_id, occurred_at desc);

insert into public.admin_permission_definitions (
  permission_code, description, requires_recent_mfa
) values
  ('admin.access', 'Access the dedicated administration application.', false),
  ('users.read', 'Read user support information.', false),
  ('verification.read', 'Read pending provider verification requests and private documents.', false),
  ('verification.review', 'Approve or reject provider verification requests.', false),
  ('missions.read', 'Read mission operational information.', false),
  ('disputes.read', 'Read service disputes.', false),
  ('disputes.decide', 'Prepare non-financial dispute decisions.', false),
  ('disputes.allocate', 'Commit a dispute financial allocation.', true),
  ('finance.read', 'Read financial operations and reconciliation information.', false),
  ('finance.execute', 'Execute a manual financial operation.', true),
  ('risk.read', 'Read chargeback and payment-risk information.', false),
  ('risk.manage', 'Submit chargeback or risk actions.', true),
  ('incidents.read', 'Read operational incidents.', false),
  ('incidents.manage', 'Manage operational incidents.', false),
  ('audit.read', 'Read the administration audit trail.', false),
  ('configuration.manage', 'Manage administration and compliance configuration.', true),
  ('administrators.manage', 'Manage administrator accounts and permissions.', true);

insert into public.admin_role_definitions (role_code, display_name, description) values
  ('support', 'Support', 'User, mission and incident support access.'),
  ('verification', 'Verification', 'Provider eligibility document review.'),
  ('disputes', 'Disputes', 'Service dispute investigation and decision preparation.'),
  ('finance', 'Finance', 'Financial operations, chargebacks and reconciliation.'),
  ('super_admin', 'Super administrator', 'All administration permissions.');

insert into public.admin_role_permissions (role_code, permission_code) values
  ('support', 'admin.access'), ('support', 'users.read'),
  ('support', 'missions.read'), ('support', 'incidents.read'),
  ('support', 'incidents.manage'),
  ('verification', 'admin.access'), ('verification', 'users.read'),
  ('verification', 'verification.read'), ('verification', 'verification.review'),
  ('disputes', 'admin.access'), ('disputes', 'missions.read'),
  ('disputes', 'disputes.read'), ('disputes', 'disputes.decide'),
  ('finance', 'admin.access'), ('finance', 'finance.read'),
  ('finance', 'finance.execute'), ('finance', 'risk.read'),
  ('finance', 'risk.manage'), ('finance', 'audit.read');

insert into public.admin_role_permissions (role_code, permission_code)
select 'super_admin', permission_code from public.admin_permission_definitions;

insert into public.admin_security_policy_versions (
  version, financial_reauthentication_max_age_seconds, effective_from, notes
) values (
  'admin_security_v1', 300, '2026-01-01 00:00:00+00',
  'All admin access requires AAL2. Financial mutations require MFA within five minutes.'
);

-- Migrate the explicit historical allowlist without deriving any privilege
-- from public.users.role or public.users.active_role.
insert into public.admin_accounts (user_id, created_by, created_at)
select user_id, granted_by, created_at from public.app_admins
on conflict (user_id) do nothing;

insert into public.admin_account_roles (user_id, role_code, granted_by, granted_at)
select user_id, 'super_admin', granted_by, created_at from public.app_admins
on conflict (user_id, role_code) do nothing;

alter table public.admin_permission_definitions enable row level security;
alter table public.admin_role_definitions enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_accounts enable row level security;
alter table public.admin_account_roles enable row level security;
alter table public.admin_security_policy_versions enable row level security;
alter table public.admin_auth_events enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on public.admin_permission_definitions from public, anon, authenticated;
revoke all on public.admin_role_definitions from public, anon, authenticated;
revoke all on public.admin_role_permissions from public, anon, authenticated;
revoke all on public.admin_accounts from public, anon, authenticated;
revoke all on public.admin_account_roles from public, anon, authenticated;
revoke all on public.admin_security_policy_versions from public, anon, authenticated;
revoke all on public.admin_auth_events from public, anon, authenticated;
revoke all on public.admin_audit_log from public, anon, authenticated;

grant all on public.admin_permission_definitions to service_role;
grant all on public.admin_role_definitions to service_role;
grant all on public.admin_role_permissions to service_role;
grant all on public.admin_accounts to service_role;
grant all on public.admin_account_roles to service_role;
grant all on public.admin_security_policy_versions to service_role;
grant all on public.admin_auth_events to service_role;
grant all on public.admin_audit_log to service_role;
grant usage, select on sequence public.admin_auth_events_id_seq to service_role;

create or replace function public.reject_admin_audit_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'Administration audit records are immutable' using errcode = '42501';
end
$$;

create trigger admin_auth_events_immutable
before update or delete on public.admin_auth_events
for each row execute function public.reject_admin_audit_mutation();
create trigger admin_audit_log_immutable
before update or delete on public.admin_audit_log
for each row execute function public.reject_admin_audit_mutation();
create trigger admin_security_policy_versions_immutable
before update or delete on public.admin_security_policy_versions
for each row execute function public.reject_admin_audit_mutation();

create or replace function public.admin_current_aal()
returns text language sql stable set search_path = public, pg_temp as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1')
$$;

create or replace function public.admin_current_mfa_authenticated_at()
returns timestamptz language sql stable set search_path = public, pg_temp as $$
  select to_timestamp(max((entry ->> 'timestamp')::double precision))
  from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) entry
  where entry ->> 'method' in ('totp', 'webauthn', 'phone')
    and entry ->> 'timestamp' ~ '^[0-9]+([.][0-9]+)?$'
$$;

create or replace function public.admin_account_has_permission(
  p_user_id uuid,
  p_permission_code text
)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.admin_accounts account
    join public.admin_account_roles account_role on account_role.user_id = account.user_id
    join public.admin_role_permissions role_permission
      on role_permission.role_code = account_role.role_code
    where account.user_id = p_user_id
      and account.status = 'active'
      and role_permission.permission_code = p_permission_code
  )
$$;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
    and public.admin_current_aal() = 'aal2'
    and public.admin_account_has_permission(auth.uid(), 'admin.access')
$$;

create or replace function public.has_admin_permission(
  p_permission_code text,
  p_force_recent_mfa boolean default false
)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_requires_recent boolean;
  v_mfa_at timestamptz;
  v_max_age integer;
begin
  if auth.uid() is null or public.admin_current_aal() <> 'aal2'
     or not public.admin_account_has_permission(auth.uid(), p_permission_code) then
    return false;
  end if;

  select permission.requires_recent_mfa into v_requires_recent
  from public.admin_permission_definitions permission
  where permission.permission_code = p_permission_code;
  if not found then return false; end if;

  if p_force_recent_mfa or v_requires_recent then
    select policy.financial_reauthentication_max_age_seconds into v_max_age
    from public.admin_security_policy_versions policy
    where policy.effective_from <= clock_timestamp()
      and (policy.effective_until is null or policy.effective_until > clock_timestamp())
    order by policy.effective_from desc limit 1;
    v_mfa_at := public.admin_current_mfa_authenticated_at();
    if v_max_age is null or v_mfa_at is null
       or v_mfa_at > clock_timestamp() + interval '5 seconds'
       or v_mfa_at < clock_timestamp() - make_interval(secs => v_max_age) then
      return false;
    end if;
  end if;
  return true;
end
$$;

create or replace function public.assert_admin_permission(
  p_permission_code text,
  p_force_recent_mfa boolean default false
)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_admin_permission(p_permission_code, p_force_recent_mfa) then
    raise exception 'Administrator permission or recent MFA required' using errcode = '42501';
  end if;
end
$$;

create or replace function public.get_my_admin_access(
  p_client_context jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_account public.admin_accounts%rowtype;
  v_roles text[] := array[]::text[];
  v_permissions text[] := array[]::text[];
  v_account_exists boolean := false;
  v_aal text := public.admin_current_aal();
  v_mfa_at timestamptz := public.admin_current_mfa_authenticated_at();
  v_session_id text := nullif(auth.jwt() ->> 'session_id', '');
  v_event_type text;
  v_outcome text;
  v_deduplication_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if octet_length(coalesce(p_client_context, '{}'::jsonb)::text) > 8192 then
    raise exception 'Client context is too large' using errcode = '22023';
  end if;

  select * into v_account from public.admin_accounts where user_id = auth.uid();
  v_account_exists := found;
  if not v_account_exists or v_account.status <> 'active' then
    v_event_type := 'access_denied'; v_outcome := 'denied';
  elsif v_aal <> 'aal2' then
    v_event_type := 'mfa_required'; v_outcome := 'challenge_required';
  else
    v_event_type := 'access_granted'; v_outcome := 'success';
    select coalesce(array_agg(role.role_code order by role.role_code), array[]::text[]) into v_roles
    from public.admin_account_roles role where role.user_id = auth.uid();
    select coalesce(array_agg(distinct permission.permission_code
      order by permission.permission_code), array[]::text[]) into v_permissions
    from public.admin_account_roles account_role
    join public.admin_role_permissions permission
      on permission.role_code = account_role.role_code
    where account_role.user_id = auth.uid();
    update public.admin_accounts set last_authenticated_at = clock_timestamp(),
      updated_at = clock_timestamp(), revision = revision + 1
    where user_id = auth.uid();
  end if;

  v_deduplication_key := concat_ws(':', 'admin-auth', auth.uid()::text,
    coalesce(v_session_id, 'no-session'), v_event_type, v_aal);
  insert into public.admin_auth_events (
    user_id, admin_account_id, event_type, outcome, session_id, aal,
    mfa_authenticated_at, client_context, deduplication_key
  ) values (
    auth.uid(), case when v_account_exists then auth.uid() else null end,
    v_event_type, v_outcome, v_session_id, v_aal, v_mfa_at,
    coalesce(p_client_context, '{}'::jsonb), v_deduplication_key
  ) on conflict (deduplication_key) do nothing;

  return jsonb_build_object(
    'account_exists', v_account_exists,
    'authorized', v_account_exists and v_account.status = 'active' and v_aal = 'aal2',
    'status', coalesce(v_account.status, 'unavailable'),
    'display_name', v_account.display_name,
    'roles', to_jsonb(v_roles),
    'permissions', to_jsonb(v_permissions),
    'aal', v_aal,
    'mfa_authenticated_at', v_mfa_at,
    'financial_reauthentication_required',
      not public.has_admin_permission('finance.execute', false)
  );
end
$$;

create or replace function public.record_admin_logout()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session_id text := nullif(auth.jwt() ->> 'session_id', '');
  v_key text;
begin
  if auth.uid() is null or not public.is_app_admin() then return; end if;
  v_key := concat_ws(':', 'admin-auth', auth.uid()::text,
    coalesce(v_session_id, 'no-session'), 'logout');
  insert into public.admin_auth_events (
    user_id, admin_account_id, event_type, outcome, session_id, aal,
    mfa_authenticated_at, deduplication_key
  ) values (
    auth.uid(), auth.uid(), 'logout', 'success', v_session_id,
    public.admin_current_aal(), public.admin_current_mfa_authenticated_at(), v_key
  ) on conflict (deduplication_key) do nothing;
end
$$;

-- Trusted inserts in the historical allowlist remain compatible while new
-- code authorizes exclusively through the role/permission model.
create or replace function public.sync_legacy_app_admin_account()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.admin_accounts (user_id, created_by, created_at)
  values (new.user_id, new.granted_by, new.created_at)
  on conflict (user_id) do update set status = 'active', updated_at = clock_timestamp();
  insert into public.admin_account_roles (user_id, role_code, granted_by, granted_at)
  values (new.user_id, 'super_admin', new.granted_by, new.created_at)
  on conflict (user_id, role_code) do nothing;
  return new;
end
$$;

create trigger app_admins_sync_admin_account
after insert on public.app_admins
for each row execute function public.sync_legacy_app_admin_account();

-- Future trusted Auth provisioning can set app_metadata.account_type=admin so
-- no client/provider profile is created for the administration identity.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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
  return new;
end
$$;

-- Provider verification is now an administration permission, not a generic
-- application-admin boolean.
create or replace function public.list_pending_professional_verifications()
returns table (
  professional_id uuid, first_name text, last_name text, business_name text,
  email text, professional_email text, verification_status text,
  verification_submitted_at timestamptz, id_document text,
  certificate_document text
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.assert_admin_permission('verification.read');
  return query
  select u.id, u.first_name, u.last_name, u.business_name, u.email,
    u.professional_email, u.verification_status, u.verification_submitted_at,
    u.id_document, u.certificate_document
  from public.users u
  where u.role = 'pro' and u.verification_status = 'pending'
  order by u.verification_submitted_at asc nulls first, u.id;
end
$$;

create or replace function public.review_professional_verification(
  p_professional_id uuid,
  p_decision text,
  p_reason text default null
)
returns table (
  professional_id uuid, verification_status text, verified_at timestamptz,
  verification_rejection_reason text
)
language plpgsql security definer set search_path = public, storage, pg_temp as $$
declare
  v_professional public.users%rowtype;
  v_reason text := nullif(trim(p_reason), '');
  v_review_id bigint;
begin
  perform public.assert_admin_permission('verification.review');
  if p_professional_id = auth.uid() then
    raise exception 'Administrators cannot review their own verification' using errcode = '42501';
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

  select u.* into v_professional from public.users u
  where u.id = p_professional_id for update;
  if not found or v_professional.role <> 'pro' then
    raise exception 'Professional profile not found' using errcode = 'P0002';
  end if;
  if v_professional.verification_status <> 'pending' then
    raise exception 'This verification request is no longer pending' using errcode = '55000';
  end if;
  if p_decision = 'verified' and (
    v_professional.id_document is null or not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'verification-documents'
        and object.name = v_professional.id_document
        and object.owner_id = p_professional_id::text
    )
  ) then
    raise exception 'A valid ID document is required before review' using errcode = '55000';
  end if;

  perform set_config('app.trusted_verification_review', 'on', true);
  update public.users u set verification_status = p_decision,
    verified_at = case when p_decision = 'verified' then clock_timestamp() else null end,
    verified_by = case when p_decision = 'verified' then auth.uid()::text else null end,
    verification_rejection_reason = case when p_decision = 'rejected' then v_reason else null end,
    updated_at = clock_timestamp()
  where u.id = p_professional_id;
  perform set_config('app.trusted_verification_review', 'off', true);

  insert into public.professional_verification_reviews (
    professional_id, reviewer_id, previous_status, decision, reason,
    id_document, certificate_document
  ) values (
    p_professional_id, auth.uid(), v_professional.verification_status,
    p_decision, v_reason, v_professional.id_document, v_professional.certificate_document
  ) returning id into v_review_id;

  insert into public.admin_audit_log (
    admin_account_id, event_type, entity_type, entity_id, action, outcome,
    reason, before_state, after_state, evidence, session_id,
    mfa_authenticated_at, deduplication_key
  ) values (
    auth.uid(), 'provider_verification_reviewed', 'provider_verification',
    p_professional_id::text, p_decision, 'success', v_reason,
    jsonb_build_object('status', v_professional.verification_status,
      'id_document', v_professional.id_document,
      'certificate_document', v_professional.certificate_document),
    jsonb_build_object('status', p_decision),
    jsonb_build_object('professional_verification_review_id', v_review_id),
    auth.jwt() ->> 'session_id', public.admin_current_mfa_authenticated_at(),
    'provider-verification-review:' || v_review_id::text
  );

  return query select u.id, u.verification_status, u.verified_at,
    u.verification_rejection_reason from public.users u
  where u.id = p_professional_id;
end
$$;

drop policy if exists "verification_documents_select_admin" on storage.objects;
create policy "verification_documents_select_admin"
on storage.objects for select to authenticated
using (
  bucket_id = 'verification-documents'
  and public.has_admin_permission('verification.read')
);

-- Existing service-role financial workflows now require an explicit finance
-- permission in addition to their already-versioned recent-MFA timestamp.
create or replace function public.assert_recent_financial_admin_mfa_v2(
  p_admin_id uuid,
  p_mfa_authenticated_at timestamptz,
  p_security_policy_version text
)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_policy public.financial_security_policy_versions%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if not public.admin_account_has_permission(p_admin_id, 'finance.execute') then
    raise exception 'Financial administrator permission required' using errcode = '42501';
  end if;
  select * into v_policy from public.financial_security_policy_versions
  where version = p_security_policy_version
    and effective_from <= clock_timestamp()
    and (effective_until is null or effective_until > clock_timestamp());
  if not found or p_mfa_authenticated_at is null
     or p_mfa_authenticated_at > clock_timestamp() + interval '5 seconds'
     or p_mfa_authenticated_at < clock_timestamp()
       - make_interval(secs => v_policy.admin_mfa_max_age_seconds) then
    raise exception 'Recent MFA authentication required' using errcode = '42501';
  end if;
end
$$;

revoke all on function public.reject_admin_audit_mutation() from public, anon, authenticated;
revoke all on function public.admin_current_aal() from public, anon;
revoke all on function public.admin_current_mfa_authenticated_at() from public, anon;
revoke all on function public.admin_account_has_permission(uuid,text) from public, anon, authenticated;
revoke all on function public.is_app_admin() from public, anon;
revoke all on function public.has_admin_permission(text,boolean) from public, anon;
revoke all on function public.assert_admin_permission(text,boolean) from public, anon;
revoke all on function public.get_my_admin_access(jsonb) from public, anon;
revoke all on function public.record_admin_logout() from public, anon;
revoke all on function public.sync_legacy_app_admin_account() from public, anon, authenticated;

grant execute on function public.admin_current_aal() to authenticated;
grant execute on function public.admin_current_mfa_authenticated_at() to authenticated;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.has_admin_permission(text,boolean) to authenticated;
grant execute on function public.assert_admin_permission(text,boolean) to authenticated;
grant execute on function public.get_my_admin_access(jsonb) to authenticated;
grant execute on function public.record_admin_logout() to authenticated;
grant execute on function public.admin_account_has_permission(uuid,text) to service_role;
