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
