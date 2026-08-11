-- Return chat metadata through a narrow JWT-scoped API and keep conversation
-- ordering server-managed whenever a message is inserted.

create or replace function public.get_my_chat_summaries(p_chat_id uuid default null)
returns table (
  id uuid,
  mission_id uuid,
  pro_id uuid,
  client_id uuid,
  updated_at timestamptz,
  service text,
  partner_id uuid,
  partner_username text,
  partner_first_name text,
  partner_last_name text,
  partner_business_name text,
  partner_profile_photo text,
  last_message_id uuid,
  last_message_content text,
  last_message_attachment_url text,
  last_message_created_at timestamptz,
  last_message_read_at timestamptz,
  last_message_sender_id uuid,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.mission_id,
    c.pro_id,
    c.client_id,
    c.updated_at,
    m.service,
    partner.id,
    partner.username,
    partner.first_name,
    partner.last_name,
    partner.business_name,
    partner.profile_photo,
    latest.id,
    latest.content,
    latest.attachment_url,
    latest.created_at,
    latest.read_at,
    latest.sender_id,
    (
      select count(*)
      from public.messages unread
      where unread.chat_id = c.id
        and unread.sender_id <> auth.uid()
        and unread.read_at is null
    )
  from public.chats c
  left join public.missions m on m.id = c.mission_id
  left join public.users partner on partner.id = case
    when c.client_id = auth.uid() then c.pro_id
    else c.client_id
  end
  left join lateral (
    select msg.id, msg.content, msg.attachment_url, msg.created_at,
      msg.read_at, msg.sender_id
    from public.messages msg
    where msg.chat_id = c.id
    order by msg.created_at desc, msg.id desc
    limit 1
  ) latest on true
  where auth.uid() is not null
    and auth.uid() in (c.client_id, c.pro_id)
    and (p_chat_id is null or c.id = p_chat_id)
    and case
      when auth.uid() = c.client_id then not coalesce(c.hidden_for_client, false)
      else not coalesce(c.hidden_for_pro, false)
    end
  order by coalesce(latest.created_at, c.updated_at, c.created_at) desc, c.id
$$;

revoke all on function public.get_my_chat_summaries(uuid) from public, anon;
grant execute on function public.get_my_chat_summaries(uuid) to authenticated;

create or replace function public.touch_chat_after_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.chats c
  set
    last_message = case
      when nullif(btrim(new.content), '') is not null then new.content
      when new.attachment_url is not null then '[Photo]'
      else c.last_message
    end,
    updated_at = case
      when c.updated_at is null or c.updated_at < coalesce(new.created_at, now())
        then coalesce(new.created_at, now())
      else c.updated_at
    end
  where c.id = new.chat_id
    and new.sender_id in (c.client_id, c.pro_id);

  return new;
end
$$;

revoke all on function public.touch_chat_after_message() from public, anon, authenticated;

drop trigger if exists trg_touch_chat_after_message on public.messages;
create trigger trg_touch_chat_after_message
after insert on public.messages
for each row execute function public.touch_chat_after_message();
