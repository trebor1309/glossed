\set ON_ERROR_STOP on

delete from public.bookings where id = '4a000000-0000-4000-8000-000000000100';
delete from public.users where id in (
  '4a000000-0000-4000-8000-000000000010',
  '4a000000-0000-4000-8000-000000000020'
);
delete from auth.users where id in (
  '4a000000-0000-4000-8000-000000000010',
  '4a000000-0000-4000-8000-000000000020'
);

update public.platform_feature_flags
set enabled = false,
    reason = 'SQL contract verifies that the public account launch starts closed.',
    updated_by = null
where flag_code = 'bookings';
do $$
declare
  v_capabilities jsonb := public.get_public_platform_capabilities();
begin
  if coalesce((v_capabilities ->> 'bookings_enabled')::boolean, true) then
    raise exception 'Bookings must be disabled by default for the public account launch';
  end if;
  if nullif(v_capabilities ->> 'bookings_message', '') is null then
    raise exception 'The public booking gate must expose a user-facing message';
  end if;
  if not exists (
    select 1 from public.platform_feature_flag_events
    where flag_code = 'bookings' and enabled = false
  ) then
    raise exception 'Platform feature flag changes must be audited';
  end if;
end
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  (
    '4a000000-0000-4000-8000-000000000010',
    'launch-client@example.test',
    '{"requested_role":"client","legal_acceptances":{"privacy_notice":"2026-10-12","client_terms":"2026-10-12"},"legal_acceptance_context":"signup","legal_acceptance_locale":"en","legal_acceptance_surface":"web_signup"}'::jsonb
  ),
  (
    '4a000000-0000-4000-8000-000000000020',
    'launch-pro@example.test',
    '{"requested_role":"pro","business_name":"Launch Pro","legal_acceptances":{"privacy_notice":"2026-10-12","client_terms":"2026-10-12","provider_terms":"2026-10-12"},"legal_acceptance_context":"signup","legal_acceptance_locale":"en","legal_acceptance_surface":"web_signup"}'::jsonb
  );

update public.users
set onboarding_completed = true
where id in (
  '4a000000-0000-4000-8000-000000000010',
  '4a000000-0000-4000-8000-000000000020'
);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '4a000000-0000-4000-8000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  begin
    insert into public.bookings (
      id, client_id, service, date, time_slot, address, status
    ) values (
      '4a000000-0000-4000-8000-000000000100',
      '4a000000-0000-4000-8000-000000000010',
      'Launch gate test', current_date + 1, 'Morning', 'Malmedy', 'pending'
    );
    raise exception 'Disabled bookings unexpectedly accepted a new request';
  exception
    when sqlstate '55000' then
      if position('Bookings are not open yet' in sqlerrm) = 0 then
        raise exception 'Booking gate returned an unexpected message: %', sqlerrm;
      end if;
  end;
end
$$;
commit;

begin;
set local role service_role;
do $$
begin
  begin
    perform public.assert_platform_feature_enabled('bookings');
    raise exception 'Disabled bookings unexpectedly passed the service-role gate';
  exception
    when sqlstate '55000' then null;
  end;
end
$$;
commit;

-- The remaining historical SQL suites exercise the fully enabled booking
-- workflows. Leave the disposable local database enabled after proving that
-- the production seed is fail-closed.
update public.platform_feature_flags
set enabled = true,
    reason = 'Local SQL suites enable bookings after the fail-closed launch gate contract passes.',
    updated_by = null
where flag_code = 'bookings';
