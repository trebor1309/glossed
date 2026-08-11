\set ON_ERROR_STOP on

begin;

insert into public.users (
  id, username, first_name, last_name, business_name, profile_photo
) values
  (
    '50000000-0000-0000-0000-000000000010',
    'chat-client', 'Chat', 'Client', null,
    'https://example.test/chat-client.jpg'
  ),
  (
    '50000000-0000-0000-0000-000000000020',
    'chat-pro', null, null, 'Chat Professional',
    'https://example.test/chat-pro.jpg'
  ),
  (
    '50000000-0000-0000-0000-000000000030',
    'chat-outsider', 'Chat', 'Outsider', null, null
  );

insert into public.missions (id, service) values (
  '50000000-0000-0000-0000-000000000100', 'Chat test service'
);

insert into public.chats (
  id, mission_id, pro_id, client_id, updated_at, created_at
) values (
  '50000000-0000-0000-0000-000000000200',
  '50000000-0000-0000-0000-000000000100',
  '50000000-0000-0000-0000-000000000020',
  '50000000-0000-0000-0000-000000000010',
  '2026-01-01 10:00:00+00',
  '2026-01-01 10:00:00+00'
);

insert into public.messages (
  id, chat_id, sender_id, content, created_at
) values (
  '50000000-0000-0000-0000-000000000300',
  '50000000-0000-0000-0000-000000000200',
  '50000000-0000-0000-0000-000000000020',
  'Chat reliability message',
  '2026-01-02 10:00:00+00'
);

do $$
begin
  if (select last_message from public.chats
      where id = '50000000-0000-0000-0000-000000000200')
      <> 'Chat reliability message' then
    raise exception 'Message insertion did not update the chat preview';
  end if;
  if (select updated_at from public.chats
      where id = '50000000-0000-0000-0000-000000000200')
      <> '2026-01-02 10:00:00+00'::timestamptz then
    raise exception 'Message insertion did not update the chat timestamp';
  end if;
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if (select count(*) from public.get_my_chat_summaries(null)) <> 1 then
    raise exception 'Client cannot read its chat summary';
  end if;
  if (select partner_business_name from public.get_my_chat_summaries(
        '50000000-0000-0000-0000-000000000200')) <> 'Chat Professional' then
    raise exception 'Client cannot read the professional display name';
  end if;
  if (select partner_profile_photo from public.get_my_chat_summaries(
        '50000000-0000-0000-0000-000000000200'))
      <> 'https://example.test/chat-pro.jpg' then
    raise exception 'Client cannot read the professional avatar';
  end if;
  if (select unread_count from public.get_my_chat_summaries(
        '50000000-0000-0000-0000-000000000200')) <> 1 then
    raise exception 'Client unread count is incorrect';
  end if;
  if (select service from public.get_my_chat_summaries(
        '50000000-0000-0000-0000-000000000200')) <> 'Chat test service' then
    raise exception 'Chat service is unavailable';
  end if;
end
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if (select partner_first_name from public.get_my_chat_summaries(
        '50000000-0000-0000-0000-000000000200')) <> 'Chat' then
    raise exception 'Professional cannot read the client display name';
  end if;
  if (select unread_count from public.get_my_chat_summaries(
        '50000000-0000-0000-0000-000000000200')) <> 0 then
    raise exception 'Sender has an unexpected unread count';
  end if;
end
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000030', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if (select count(*) from public.get_my_chat_summaries(null)) <> 0 then
    raise exception 'An unrelated user obtained chat metadata';
  end if;
end
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform public.get_my_chat_summaries(null);
    raise exception 'Anonymous callers can execute the private chat RPC';
  exception when insufficient_privilege then null;
  end;
end
$$;

rollback;
