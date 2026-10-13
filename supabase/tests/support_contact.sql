\set ON_ERROR_STOP on

begin;

do $$
begin
  if has_table_privilege('anon', 'public.contact_requests', 'select')
     or has_table_privilege('anon', 'public.contact_requests', 'insert')
     or has_table_privilege('authenticated', 'public.contact_requests', 'select')
     or has_table_privilege('authenticated', 'public.contact_requests', 'insert')
     or has_function_privilege(
       'anon',
       'public.accept_contact_request(uuid,uuid,text,text,text,text,text,text,text,text)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.mark_contact_request_delivery(uuid,boolean,text,text)',
       'execute'
     ) then
    raise exception 'Browser roles can access or forge contact requests';
  end if;
end
$$;

set local role service_role;

select * from public.accept_contact_request(
  'a1000000-0000-0000-0000-000000000001',
  null,
  'general',
  'Contact Tester',
  'contact@example.test',
  'A real support request',
  'This is a sufficiently long support request for the database test.',
  'en',
  '/contact',
  repeat('a', 64)
);

do $$
declare
  v_created boolean;
begin
  select was_created into v_created
  from public.accept_contact_request(
    'a1000000-0000-0000-0000-000000000001',
    null,
    'general',
    'Contact Tester',
    'contact@example.test',
    'A real support request',
    'This is a sufficiently long support request for the database test.',
    'en',
    '/contact',
    repeat('a', 64)
  );

  if v_created then
    raise exception 'Idempotent contact retry created a second request';
  end if;

  if (select count(*) from public.contact_requests
      where id = 'a1000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'Contact request was not persisted exactly once';
  end if;

  begin
    perform public.accept_contact_request(
      'a1000000-0000-0000-0000-000000000001',
      null,
      'general',
      'Contact Tester',
      'contact@example.test',
      'A real support request',
      'A changed payload must not reuse an existing contact request identifier.',
      'en',
      '/contact',
      repeat('a', 64)
    );
    raise exception 'Changed payload reused an existing contact request identifier';
  exception when invalid_parameter_value then
    if sqlerrm <> 'contact_request_id_conflict' then raise; end if;
  end;
end
$$;

select public.mark_contact_request_delivery(
  'a1000000-0000-0000-0000-000000000001',
  true,
  'resend-message-test-1',
  null
);

do $$
begin
  if not exists (
    select 1 from public.contact_requests
    where id = 'a1000000-0000-0000-0000-000000000001'
      and delivery_status = 'email_sent'
      and provider_message_id = 'resend-message-test-1'
      and emailed_at is not null
  ) then
    raise exception 'Successful contact delivery was not recorded';
  end if;

  perform public.accept_contact_request(
    'a1000000-0000-0000-0000-000000000002', null, 'booking', 'Contact Tester',
    'second@example.test', null,
    'This is the second sufficiently long support request for rate testing.',
    'en', '/contact', repeat('a', 64)
  );
  perform public.accept_contact_request(
    'a1000000-0000-0000-0000-000000000003', null, 'account', 'Contact Tester',
    'third@example.test', null,
    'This is the third sufficiently long support request for rate testing.',
    'en', '/contact', repeat('a', 64)
  );

  begin
    perform public.accept_contact_request(
      'a1000000-0000-0000-0000-000000000004', null, 'privacy', 'Contact Tester',
      'fourth@example.test', null,
      'This fourth request must be rejected by the short-window rate limit.',
      'en', '/contact', repeat('a', 64)
    );
    raise exception 'Rate-limited contact request was accepted';
  exception when raise_exception then
    if sqlerrm <> 'contact_rate_limited' then raise; end if;
  end;
end
$$;

rollback;
