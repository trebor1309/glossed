-- Provider-facing read model for the latest eligibility declaration.
-- A declaration is self-reported input only; it never grants eligibility.

create or replace function public.get_my_latest_provider_eligibility_declaration()
returns setof public.provider_eligibility_declarations
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider_id uuid := auth.uid();
begin
  if v_provider_id is null or auth.role() <> 'authenticated' then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.users where id = v_provider_id and role = 'pro'
  ) then
    raise exception 'Provider profile required' using errcode = '42501';
  end if;

  return query
  select declaration.*
  from public.provider_eligibility_declarations declaration
  where declaration.provider_id = v_provider_id
  order by declaration.revision desc
  limit 1;
end
$$;

comment on function public.get_my_latest_provider_eligibility_declaration() is
  'Returns only the authenticated provider latest self-declaration. It does not expose or imply an eligibility assessment.';

revoke all on function public.get_my_latest_provider_eligibility_declaration()
  from public, anon;
grant execute on function public.get_my_latest_provider_eligibility_declaration()
  to authenticated, service_role;

-- An eligibility decision is evidence about one immutable declaration revision.
-- A later self-declaration must therefore be assessed explicitly before it can
-- authorize a paid proposal.
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
  v_declaration public.provider_eligibility_declarations%rowtype;
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

  select * into v_declaration
  from public.provider_eligibility_declarations
  where provider_id = p_provider_id
  order by revision desc
  limit 1;

  select * into v_assessment
  from public.provider_eligibility_assessments
  where provider_id = p_provider_id
    and policy_version = p_policy_version
    and service_country_code = upper(p_service_country_code)
    and service_category_code in (p_service_category_code, '*')
  order by (service_category_code = p_service_category_code) desc,
           revision desc
  limit 1;

  if v_declaration.id is null then
    v_blockers := array_append(v_blockers, 'eligibility_declaration_missing');
  end if;
  if v_assessment.id is null then
    v_blockers := array_append(v_blockers, 'eligibility_assessment_missing');
  elsif v_assessment.declaration_id is distinct from v_declaration.id then
    v_blockers := array_append(v_blockers, 'eligibility_assessment_stale');
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
  elsif v_connect.stripe_transfers_status <> 'active' then
    v_blockers := array_append(v_blockers, 'stripe_transfers_not_active');
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
