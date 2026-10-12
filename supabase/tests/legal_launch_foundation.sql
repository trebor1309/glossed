\set ON_ERROR_STOP on

begin;

do $$
begin
  if (select count(*) from public.legal_document_versions
      where version = '2026-10-12' and retired_at is null) <> 4 then
    raise exception 'The complete current legal document set was not seeded';
  end if;
  if has_table_privilege('authenticated', 'public.user_legal_acceptances', 'insert')
     or has_table_privilege('authenticated', 'public.user_legal_acceptances', 'update')
     or has_table_privilege('authenticated', 'public.legal_transaction_snapshots', 'select')
     or has_function_privilege(
       'authenticated',
       'public.snapshot_user_legal_acceptances(uuid,text[],text,text,jsonb)',
       'execute'
     ) then
    raise exception 'Browser roles can forge or inspect legal evidence';
  end if;
end
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  (
    '99000000-0000-0000-0000-000000000010',
    'legal-client@example.test',
    '{"requested_role":"client","legal_acceptances":{"privacy_notice":"2026-10-12","client_terms":"2026-10-12"},"legal_acceptance_context":"signup","legal_acceptance_locale":"en","legal_acceptance_surface":"web_signup"}'::jsonb
  ),
  (
    '99000000-0000-0000-0000-000000000020',
    'legal-provider@example.test',
    '{"requested_role":"pro"}'::jsonb
  );

do $$
begin
  if (select count(*) from public.user_legal_acceptances
      where subject_id = '99000000-0000-0000-0000-000000000010') <> 2 then
    raise exception 'Valid signup acceptance metadata was not recorded';
  end if;
  if exists (
    select 1 from public.user_legal_acceptances
    where subject_id = '99000000-0000-0000-0000-000000000020'
  ) then
    raise exception 'Missing signup acceptance metadata created evidence';
  end if;
end
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"99000000-0000-0000-0000-000000000020","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '99000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if (select count(*) from public.get_my_legal_requirements()) <> 3
     or (select count(*) from public.get_my_legal_requirements()
         where accepted_at is null) <> 3 then
    raise exception 'Professional legal requirements are incomplete';
  end if;

  begin
    perform public.submit_provider_eligibility_declaration(
      'be', array['be'], 'be', 'test_status', 'trader', null, null,
      '{"test":true}'::jsonb, 'legal-test:blocked-declaration'
    );
    raise exception 'Professional action succeeded without current terms';
  exception when insufficient_privilege then null;
  end;
end
$$;

select public.record_my_legal_acceptances(
  '[
    {"code":"privacy_notice","version":"2026-10-12"},
    {"code":"client_terms","version":"2026-10-12"},
    {"code":"provider_terms","version":"2026-10-12"}
  ]'::jsonb,
  'onboarding', null, 'en', '99000000-0000-0000-0000-000000000099'
);

reset role;

do $$
begin
  if (select count(*) from public.user_legal_acceptances
      where subject_id = '99000000-0000-0000-0000-000000000020') <> 3 then
    raise exception 'Authenticated legal acceptance was not recorded atomically';
  end if;
  if exists (
    select 1 from public.get_my_legal_requirements() where accepted_at is null
  ) then
    raise exception 'Accepted current requirements still appear missing';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

select public.snapshot_user_legal_acceptances(
  '99000000-0000-0000-0000-000000000020',
  array['privacy_notice', 'client_terms', 'provider_terms'],
  'connect_onboarding',
  '99000000-0000-0000-0000-000000000020:1',
  '{"test":true}'::jsonb
);

do $$
begin
  if (select count(*) from public.legal_transaction_snapshots
      where subject_id = '99000000-0000-0000-0000-000000000020'
        and transaction_type = 'connect_onboarding') <> 3 then
    raise exception 'Transaction legal snapshot is incomplete';
  end if;

  begin
    update public.user_legal_acceptances
    set accepted_at = clock_timestamp()
    where subject_id = '99000000-0000-0000-0000-000000000020';
    raise exception 'Append-only acceptance evidence was mutable';
  exception when object_not_in_prerequisite_state then null;
  end;
end
$$;

reset role;
delete from auth.users
where id = '99000000-0000-0000-0000-000000000010';

do $$
begin
  if (select count(*) from public.user_legal_acceptances
      where subject_id = '99000000-0000-0000-0000-000000000010'
        and user_id is null) <> 2 then
    raise exception 'Account deletion did not preserve de-linked legal evidence';
  end if;
end
$$;

rollback;
