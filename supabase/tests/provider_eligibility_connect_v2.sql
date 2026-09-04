\set ON_ERROR_STOP on

select set_config('app.test_database_url', :'TEST_DATABASE_URL', false);

do $$
begin
  if exists (select 1 from public.provider_eligibility_policy_versions) then
    raise exception 'The migration must not invent or activate jurisdiction rules';
  end if;
  if exists (select 1 from public.financial_flow_versions
             where version not in ('legacy_v1', 'marketplace_v2'))
     or coalesce((select enabled from public.financial_feature_flags
                  where flag_code = 'checkout_v2'), false) then
    raise exception 'Provider eligibility tests found an active or unexpected financial engine';
  end if;
  if has_table_privilege('authenticated', 'public.provider_connect_accounts', 'insert')
     or has_table_privilege('authenticated', 'public.provider_connect_accounts', 'update')
     or has_table_privilege('authenticated', 'public.provider_eligibility_assessments', 'insert')
     or has_table_privilege('authenticated', 'public.stripe_connect_webhook_events', 'insert')
     or has_function_privilege(
       'authenticated', 'public.reserve_provider_connect_account_creation(uuid)', 'execute'
     ) then
    raise exception 'Browser roles can forge eligibility or Connect readiness';
  end if;
end
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  (
    '72000000-0000-0000-0000-000000000010',
    'eligibility-client@example.test',
    '{"requested_role":"client"}'::jsonb
  ),
  (
    '72000000-0000-0000-0000-000000000020',
    'eligibility-provider@example.test',
    '{"requested_role":"pro"}'::jsonb
  ),
  (
    '72000000-0000-0000-0000-000000000030',
    'eligibility-other-provider@example.test',
    '{"requested_role":"pro"}'::jsonb
  )
on conflict (id) do nothing;

update public.users
set role = 'pro', active_role = 'pro', verification_status = 'rejected'
where id in (
  '72000000-0000-0000-0000-000000000020',
  '72000000-0000-0000-0000-000000000030'
);

insert into public.bookings (
  id, client_id, pro_id, service, date, time_slot, address, notes, status
) values (
  '72000000-0000-0000-0000-000000000100',
  '72000000-0000-0000-0000-000000000010',
  '72000000-0000-0000-0000-000000000020',
  'Eligibility foundation test', current_date + 7, '10:00',
  'Test address', 'The full proposal must survive missing prerequisites.', 'pending'
) on conflict (id) do nothing;

insert into public.booking_notifications (booking_id, pro_id) values (
  '72000000-0000-0000-0000-000000000100',
  '72000000-0000-0000-0000-000000000030'
);

insert into public.provider_eligibility_policy_versions (
  version, jurisdiction_code, residence_country_code, service_country_code,
  provider_status_code, service_category_code, requirement_definitions,
  effective_from, notes
) values (
  'test.eu.launch.v1', 'EU', null, null, null, null,
  '[{"code":"test_only","kind":"manual_assessment"}]'::jsonb,
  now() - interval '1 day',
  'Test-only configurable policy; it does not encode a national legal rule.'
) on conflict (version) do nothing;

select set_config(
  'request.jwt.claims',
  '{"sub":"72000000-0000-0000-0000-000000000020","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub', '72000000-0000-0000-0000-000000000020', false
);
select set_config('request.jwt.claim.role', 'authenticated', false);

select public.submit_provider_eligibility_declaration(
  'be', array['be'], 'be', 'test_status', 'test_trader_classification',
  null, null, '{"test":true}'::jsonb, 'eligibility-test:declaration:1'
);
select public.submit_provider_eligibility_declaration(
  'be', array['be'], 'be', 'test_status', 'test_trader_classification',
  null, null, '{"test":true}'::jsonb, 'eligibility-test:declaration:1'
);

do $$
begin
  if (select count(*) from public.provider_eligibility_declarations
      where provider_id = '72000000-0000-0000-0000-000000000020') <> 1 then
    raise exception 'Provider declaration retry was not idempotent';
  end if;
  if (select tax_residence_country_codes
      from public.provider_eligibility_declarations
      where provider_id = '72000000-0000-0000-0000-000000000020')
      <> array['BE']::text[] then
    raise exception 'Eligibility country codes were not normalized';
  end if;
end
$$;

do $$
declare v_latest public.provider_eligibility_declarations%rowtype;
begin
  select * into v_latest
  from public.get_my_latest_provider_eligibility_declaration();
  if v_latest.provider_id <> '72000000-0000-0000-0000-000000000020'
     or v_latest.revision <> 1
     or v_latest.residence_country_code <> 'BE' then
    raise exception 'Provider could not retrieve the latest own declaration';
  end if;
end
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"72000000-0000-0000-0000-000000000030","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub', '72000000-0000-0000-0000-000000000030', false
);
do $$
begin
  if exists (select 1 from public.get_my_latest_provider_eligibility_declaration()) then
    raise exception 'Provider declaration read model exposed another provider declaration';
  end if;
end
$$;
select set_config(
  'request.jwt.claims',
  '{"sub":"72000000-0000-0000-0000-000000000020","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub', '72000000-0000-0000-0000-000000000020', false
);

select set_config('request.jwt.claim.role', 'service_role', false);
select public.record_provider_eligibility_assessment(
  '72000000-0000-0000-0000-000000000020',
  'test.eu.launch.v1',
  (select id from public.provider_eligibility_declarations
   where provider_id = '72000000-0000-0000-0000-000000000020'),
  'BE', 'hair.custom', 'eligible', now() + interval '30 days',
  'Test-only explicit eligibility decision.', '{"source":"sql_test"}'::jsonb,
  'system', null, 'eligibility-test:assessment:1'
);

do $$
declare
  v_readiness record;
begin
  select * into v_readiness
  from public.get_provider_paid_proposal_readiness(
    '72000000-0000-0000-0000-000000000020',
    'test.eu.launch.v1', 'BE', 'hair.custom'
  );
  if v_readiness.ready
     or v_readiness.blocker_codes <> array['connect_account_missing']::text[] then
    raise exception 'Eligibility readiness did not isolate the missing Connect prerequisite: %',
      v_readiness.blocker_codes;
  end if;
end
$$;

select extensions.dblink_connect_u('connect_reserve_1', current_setting('app.test_database_url'));
select extensions.dblink_connect_u('connect_reserve_2', current_setting('app.test_database_url'));
select extensions.dblink_send_query('connect_reserve_1', $$
  with configured as materialized (
    select set_config('request.jwt.claim.role', 'service_role', false)
  )
  select reservation.*
  from configured
  cross join lateral public.reserve_provider_connect_account_creation(
    '72000000-0000-0000-0000-000000000020'
  ) reservation
$$);
select extensions.dblink_send_query('connect_reserve_2', $$
  with configured as materialized (
    select set_config('request.jwt.claim.role', 'service_role', false)
  )
  select reservation.*
  from configured
  cross join lateral public.reserve_provider_connect_account_creation(
    '72000000-0000-0000-0000-000000000020'
  ) reservation
$$);

create temporary table connect_reservations (
  stripe_account_id text,
  creation_idempotency_key text,
  creation_generation integer,
  should_create boolean
);
insert into connect_reservations
select * from extensions.dblink_get_result('connect_reserve_1') as result(
  stripe_account_id text,
  creation_idempotency_key text,
  creation_generation integer,
  should_create boolean
);
insert into connect_reservations
select * from extensions.dblink_get_result('connect_reserve_2') as result(
  stripe_account_id text,
  creation_idempotency_key text,
  creation_generation integer,
  should_create boolean
);
select extensions.dblink_disconnect('connect_reserve_1');
select extensions.dblink_disconnect('connect_reserve_2');

do $$
begin
  if (select count(*) from connect_reservations) <> 2
     or (select count(distinct creation_idempotency_key) from connect_reservations) <> 1
     or (select count(*) from public.provider_connect_accounts
         where provider_id = '72000000-0000-0000-0000-000000000020') <> 1 then
    raise exception 'Concurrent Accounts v2 reservation was not stable and unique';
  end if;
end
$$;

select set_config('request.jwt.claim.role', 'service_role', false);
select public.complete_provider_connect_account_creation(
  '72000000-0000-0000-0000-000000000020', 'acct_EligibilityTestV2', false
);
select public.sync_provider_connect_account(
  'evt_connect_pending_1',
  'v2.core.account[configuration.recipient].capability_status_updated',
  'acct_EligibilityTestV2', now(), false, 'express', 'pending', 'pending',
  '[]'::jsonb, '[]'::jsonb, '{"currently_due":["identity"]}'::jsonb,
  '{}'::jsonb, array['recipient'], false, '{"source":"sql_test"}'::jsonb
);

select set_config(
  'request.jwt.claims',
  '{"sub":"72000000-0000-0000-0000-000000000020","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub', '72000000-0000-0000-0000-000000000020', false
);
select set_config('request.jwt.claim.role', 'authenticated', false);

select public.save_paid_proposal_draft(
  null,
  '72000000-0000-0000-0000-000000000100',
  'test.eu.launch.v1', 'hair.custom', 'BE', 8000, 1000,
  now() + interval '7 days', null,
  'A complete custom proposal preserved while onboarding is incomplete.',
  'eligibility-test:draft:create:1'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"72000000-0000-0000-0000-000000000030","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub', '72000000-0000-0000-0000-000000000030', false
);
do $$
begin
  begin
    perform public.save_paid_proposal_draft(
      null,
      '72000000-0000-0000-0000-000000000100',
      'test.eu.launch.v1', 'hair.custom', 'BE', 12000, 0,
      now() + interval '7 days', null,
      'A foreign provider must never recover the original draft.',
      'eligibility-test:draft:create:1'
    );
    raise exception 'A foreign deduplication key exposed another provider draft';
  exception when unique_violation then null;
  end;
end
$$;
select set_config(
  'request.jwt.claims',
  '{"sub":"72000000-0000-0000-0000-000000000020","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub', '72000000-0000-0000-0000-000000000020', false
);

select public.refresh_paid_proposal_draft_readiness(
  (select id from public.paid_proposal_drafts
   where provider_id = '72000000-0000-0000-0000-000000000020'),
  'eligibility-test:draft:refresh:blocked'
);

do $$
begin
  if (select publication_state from public.paid_proposal_drafts
      where provider_id = '72000000-0000-0000-0000-000000000020')
       <> 'blocked_requirements' then
    raise exception 'Proposal draft was not blocked while Connect was pending';
  end if;
  if (select service_amount_cents from public.paid_proposal_drafts
      where provider_id = '72000000-0000-0000-0000-000000000020') <> 8000
     or (select travel_amount_cents from public.paid_proposal_drafts
         where provider_id = '72000000-0000-0000-0000-000000000020') <> 1000 then
    raise exception 'Blocked proposal lost its monetary draft fields';
  end if;
  if (select blocker_codes from public.paid_proposal_drafts
      where provider_id = '72000000-0000-0000-0000-000000000020')
       <> array['stripe_transfers_not_active']::text[] then
    raise exception 'Recipient readiness incorrectly depends on a merchant payout capability';
  end if;
end
$$;

select set_config('request.jwt.claim.role', 'service_role', false);
select public.sync_provider_connect_account(
  'evt_connect_active_1',
  'v2.core.account[configuration.recipient].capability_status_updated',
  'acct_EligibilityTestV2', now() + interval '1 second', false, 'express',
  'active', 'active', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
  array['recipient'], false, '{"source":"sql_test"}'::jsonb
);

create temporary table connect_revision_after_active as
select revision from public.provider_connect_accounts
where provider_id = '72000000-0000-0000-0000-000000000020';

do $$
declare
  v_duplicate boolean;
  v_old boolean;
begin
  select public.sync_provider_connect_account(
    'evt_connect_active_1',
    'v2.core.account[configuration.recipient].capability_status_updated',
    'acct_EligibilityTestV2', now() + interval '1 second', false, 'express',
    'active', 'active', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
    array['recipient'], false, '{"source":"duplicate"}'::jsonb
  ) into v_duplicate;
  select public.sync_provider_connect_account(
    'evt_connect_old_1', 'v2.core.account.updated', 'acct_EligibilityTestV2',
    now() - interval '1 hour', false, 'express', 'restricted', 'restricted',
    '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
    array['recipient'], false, '{"source":"old_event"}'::jsonb
  ) into v_old;

  if v_duplicate or not v_old then
    raise exception 'Connect webhook event claim semantics are invalid';
  end if;
  if (select applied from public.stripe_connect_webhook_events
      where event_id = 'evt_connect_old_1') then
    raise exception 'An older Connect event was applied';
  end if;
  if (select stripe_transfers_status from public.provider_connect_accounts
      where provider_id = '72000000-0000-0000-0000-000000000020') <> 'active'
     or (select revision from public.provider_connect_accounts
         where provider_id = '72000000-0000-0000-0000-000000000020')
        <> (select revision from connect_revision_after_active) then
    raise exception 'Duplicate or older Connect event changed canonical state';
  end if;
end
$$;

select set_config('request.jwt.claim.role', 'service_role', false);
select public.sync_provider_connect_account(
  'evt_connect_changed_during_poll_1', 'v2.core.account.updated',
  'acct_EligibilityTestV2', now() + interval '2 seconds', false, 'express',
  'restricted', 'restricted', '[]'::jsonb, '[]'::jsonb,
  '{}'::jsonb, '{}'::jsonb, array['recipient'], false,
  '{"source":"webhook_during_poll"}'::jsonb
);
select public.sync_provider_connect_account(
  'account-check:stale-after-webhook', 'v2.core.account.polled',
  'acct_EligibilityTestV2', now() + interval '1 day', false, 'express',
  'active', 'active', '[]'::jsonb, '[]'::jsonb,
  '{}'::jsonb, '{}'::jsonb, array['recipient'], false,
  '{"source":"stale_poll"}'::jsonb,
  (select revision from connect_revision_after_active)
);
do $$
begin
  if (select stripe_transfers_status from public.provider_connect_accounts
      where provider_id = '72000000-0000-0000-0000-000000000020') <> 'restricted'
     or (select applied from public.stripe_connect_webhook_events
         where event_id = 'account-check:stale-after-webhook') then
    raise exception 'A stale account poll superseded an intervening Stripe webhook';
  end if;
end
$$;
select public.sync_provider_connect_account(
  'evt_connect_active_after_poll_1',
  'v2.core.account[configuration.recipient].capability_status_updated',
  'acct_EligibilityTestV2', now() + interval '3 seconds', false, 'express',
  'active', 'active', '[]'::jsonb, '[]'::jsonb,
  '{}'::jsonb, '{}'::jsonb, array['recipient'], false,
  '{"source":"webhook_after_stale_poll"}'::jsonb
);

select set_config(
  'request.jwt.claims',
  '{"sub":"72000000-0000-0000-0000-000000000020","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub', '72000000-0000-0000-0000-000000000020', false
);
select set_config('request.jwt.claim.role', 'authenticated', false);
select public.refresh_paid_proposal_draft_readiness(
  (select id from public.paid_proposal_drafts
   where provider_id = '72000000-0000-0000-0000-000000000020'),
  'eligibility-test:draft:refresh:ready'
);

do $$
begin
  if (select publication_state from public.paid_proposal_drafts
      where provider_id = '72000000-0000-0000-0000-000000000020')
       <> 'ready_for_publication' then
    raise exception 'Explicit eligibility and active Connect capabilities did not unblock the draft';
  end if;
  if (select verification_status from public.users
      where id = '72000000-0000-0000-0000-000000000020') <> 'rejected' then
    raise exception 'Legacy professional verification was unexpectedly repurposed';
  end if;
  if not (select stripe_account_ready
          from public.users
          where id = '72000000-0000-0000-0000-000000000020') then
    raise exception 'Legacy Connect projections disagree with canonical Accounts v2 state';
  end if;
end
$$;

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"72000000-0000-0000-0000-000000000020","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub', '72000000-0000-0000-0000-000000000020', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    update public.provider_connect_accounts set stripe_transfers_status = 'active'
    where provider_id = '72000000-0000-0000-0000-000000000020';
    raise exception 'Provider could mutate canonical Connect state';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.provider_eligibility_assessments (
      provider_id, policy_version, service_country_code, revision, status,
      reason, actor_type, deduplication_key
    ) values (
      '72000000-0000-0000-0000-000000000020', 'test.eu.launch.v1', 'BE', 99,
      'eligible', 'Forged browser decision.', 'system', 'eligibility-test:forged'
    );
    raise exception 'Provider could forge an eligibility assessment';
  exception when insufficient_privilege then null;
  end;
end
$$;
rollback;

do $$
begin
  begin
    update public.provider_eligibility_policy_versions
    set notes = 'tampered' where version = 'test.eu.launch.v1';
    raise exception 'Eligibility policy versions were mutable';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.stripe_connect_webhook_events
    set applied = false where event_id = 'evt_connect_active_1';
    raise exception 'Connect event journal was mutable';
  exception when sqlstate '55000' then null;
  end;
  if coalesce((select enabled from public.financial_feature_flags
               where flag_code = 'checkout_v2'), false) then
    raise exception 'Tests found Checkout v2 unexpectedly active';
  end if;
end
$$;

select set_config('request.jwt.claim.role', 'service_role', false);
select public.set_provider_connect_connection_enabled(
  '72000000-0000-0000-0000-000000000020', false
);
do $$
declare
  v_readiness record;
begin
  select * into v_readiness
  from public.get_provider_paid_proposal_readiness(
    '72000000-0000-0000-0000-000000000020',
    'test.eu.launch.v1', 'BE', 'hair.custom'
  );
  if v_readiness.ready or not ('connect_account_missing' = any(v_readiness.blocker_codes)) then
    raise exception 'A disconnected account remained financially eligible';
  end if;
end
$$;
select * from public.reserve_provider_connect_account_creation(
  '72000000-0000-0000-0000-000000000020'
);
do $$
begin
  if not (select connection_enabled from public.provider_connect_accounts
          where provider_id = '72000000-0000-0000-0000-000000000020')
     or (select stripe_account_id from public.users
         where id = '72000000-0000-0000-0000-000000000020')
        <> 'acct_EligibilityTestV2' then
    raise exception 'Reconnecting did not restore the canonical account projection';
  end if;
end
$$;

select public.sync_provider_connect_account(
  'evt_connect_closed_1', 'v2.core.account.closed', 'acct_EligibilityTestV2',
  now() + interval '4 seconds', false, 'express', 'restricted', 'restricted',
  '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
  array['recipient'], true, '{"source":"closed_account"}'::jsonb
);

create temporary table replacement_reservation as
select * from public.reserve_provider_connect_account_creation(
  '72000000-0000-0000-0000-000000000020'
);

do $$
begin
  if not (select should_create from replacement_reservation)
     or (select stripe_account_id from replacement_reservation) is not null
     or (select creation_generation from replacement_reservation) <> 2
     or (select creation_idempotency_key from replacement_reservation)
        <> 'connect-account-v2:72000000-0000-0000-0000-000000000020:2' then
    raise exception 'Closed Connect account did not reserve a replacement generation';
  end if;
  if (select count(*) from public.provider_connect_account_identities
      where provider_id = '72000000-0000-0000-0000-000000000020') <> 1 then
    raise exception 'Closed Connect account identity was not retained for reconciliation';
  end if;
end
$$;

select public.complete_provider_connect_account_creation(
  '72000000-0000-0000-0000-000000000020', 'acct_EligibilityTestV2Replacement', false
);
-- Completion itself is retry-safe after a network interruption.
select public.complete_provider_connect_account_creation(
  '72000000-0000-0000-0000-000000000020', 'acct_EligibilityTestV2Replacement', false
);
select public.sync_provider_connect_account(
  'evt_connect_replacement_active_1',
  'v2.core.account[configuration.recipient].capability_status_updated',
  'acct_EligibilityTestV2Replacement', now() + interval '5 seconds', false,
  'express', 'active', 'unknown', '[]'::jsonb, '[]'::jsonb,
  '{}'::jsonb, '{}'::jsonb, array['recipient'], false,
  '{"source":"replacement_account"}'::jsonb
);
-- A late event for the retired identity is journaled but cannot overwrite the replacement.
select public.sync_provider_connect_account(
  'evt_connect_old_identity_late_1', 'v2.core.account.updated',
  'acct_EligibilityTestV2', now() + interval '6 seconds', false,
  'express', 'active', 'active', '[]'::jsonb, '[]'::jsonb,
  '{}'::jsonb, '{}'::jsonb, array['recipient'], false,
  '{"source":"late_old_identity"}'::jsonb
);

do $$
begin
  if (select stripe_account_id from public.provider_connect_accounts
      where provider_id = '72000000-0000-0000-0000-000000000020')
       <> 'acct_EligibilityTestV2Replacement'
     or (select creation_generation from public.provider_connect_accounts
         where provider_id = '72000000-0000-0000-0000-000000000020') <> 2
     or (select count(*) from public.provider_connect_account_identities
         where provider_id = '72000000-0000-0000-0000-000000000020') <> 2
     or (select applied from public.stripe_connect_webhook_events
         where event_id = 'evt_connect_old_identity_late_1') then
    raise exception 'Connect replacement generation or late-event isolation failed';
  end if;
end
$$;

select set_config('request.jwt.claim.role', '', false);
