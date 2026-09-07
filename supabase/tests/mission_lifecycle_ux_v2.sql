\set ON_ERROR_STOP on

begin;

do $$
begin
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'missions'
        and column_name = 'duration') is not null then
    raise exception 'missions.duration still has an artificial default';
  end if;
  if has_table_privilege('authenticated', 'public.service_executions_v2', 'select')
     or has_table_privilege('authenticated', 'public.fund_releases_v2', 'select')
     or has_table_privilege('authenticated', 'public.provider_transfers_v2', 'select') then
    raise exception 'Mission lifecycle UX exposed a financial table to the browser';
  end if;
  if not has_function_privilege(
       'authenticated', 'public.get_my_mission_lifecycle_v2()', 'execute'
     ) then
    raise exception 'Authenticated participants cannot execute the lifecycle projection';
  end if;
  if has_function_privilege(
       'anon', 'public.get_my_mission_lifecycle_v2()', 'execute'
     ) then
    raise exception 'Anonymous callers can execute the lifecycle projection';
  end if;
end
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '74000000-0000-0000-0000-000000000010', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if exists (
    select 1 from public.get_my_mission_lifecycle_v2()
    where actor_role <> 'client'
  ) then
    raise exception 'Client projection contains another participant role';
  end if;
  if not exists (
    select 1 from public.get_my_mission_lifecycle_v2()
    where payment_id = '74000000-0000-0000-0000-000000000601'
      and execution_state = 'concluded'
      and release_state = 'released'
      and review_available
      and not reviewed_by_me
      and released_at is not null
  ) then
    raise exception 'Concluded client mission projection is incorrect';
  end if;
  if not exists (
    select 1 from public.get_my_mission_lifecycle_v2()
    where payment_id = '74000000-0000-0000-0000-000000000603'
      and execution_state = 'problem_reported'
      and release_state = 'blocked'
      and not can_client_confirm
      and not can_client_report_problem
  ) then
    raise exception 'Problem state or client action guards are incorrect';
  end if;
  if not exists (
    select 1 from public.get_my_mission_lifecycle_v2()
    where payment_id = '74000000-0000-0000-0000-000000000604'
      and execution_state = 'planned'
      and not can_client_confirm
      and not can_client_report_problem
  ) then
    raise exception 'Future completion threshold is not respected';
  end if;
end
$$;

select * from public.submit_review_v1(
  '74000000-0000-0000-0000-000000000801',
  '74000000-0000-0000-0000-000000000201',
  5::smallint,
  'Lifecycle v2 concluded review.'
);

do $$
begin
  if not exists (
    select 1 from public.get_my_mission_lifecycle_v2()
    where payment_id = '74000000-0000-0000-0000-000000000601'
      and reviewed_by_me
  ) then
    raise exception 'Submitted review is absent from the lifecycle projection';
  end if;
  begin
    perform * from public.submit_review_v1(
      '74000000-0000-0000-0000-000000000802',
      '74000000-0000-0000-0000-000000000203',
      1::smallint,
      'This unresolved mission must reject the review.'
    );
    raise exception 'A review was accepted before the v2 mission concluded';
  exception when check_violation then null;
  end;
end
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '74000000-0000-0000-0000-000000000020', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if exists (
    select 1 from public.get_my_mission_lifecycle_v2()
    where actor_role <> 'provider'
  ) then
    raise exception 'Provider projection contains another participant role';
  end if;
  if not exists (
    select 1 from public.get_my_mission_lifecycle_v2()
    where payment_id = '74000000-0000-0000-0000-000000000604'
      and execution_state = 'planned'
      and not can_provider_complete
  ) then
    raise exception 'Provider action became available before completion_not_before_at';
  end if;
  if exists (
    select 1 from public.get_my_mission_lifecycle_v2()
    where review_available
  ) then
    raise exception 'Provider received a public review action';
  end if;
end
$$;

reset role;

do $$
begin
  if (select count(*) from public.notifications
      where deduplication_key =
        'service-v2:74000000-0000-0000-0000-000000000602:provider-completed:provider') <> 1
     or (select count(*) from public.notifications
         where deduplication_key =
           'service-v2:74000000-0000-0000-0000-000000000602:confirmation-requested') <> 1
     or (select count(*) from public.notifications
         where deduplication_key =
           'service-v2:74000000-0000-0000-0000-000000000603:problem-reported:provider') <> 1
     or (select count(*) from public.notifications
         where deduplication_key =
           'service-v2:74000000-0000-0000-0000-000000000601:funds-released:client') <> 1 then
    raise exception 'Mission lifecycle notifications are missing or duplicated';
  end if;
end
$$;

select set_config('request.jwt.claim.role', 'service_role', true);
select public.enqueue_due_service_release_reminders_v2(25);

rollback;

select 'mission lifecycle UX v2 tests passed' as result;
