\set ON_ERROR_STOP on

select set_config('storage.allow_delete_query', 'true', false);

delete from storage.objects where owner_id like '30000000-%';
delete from public.messages where sender_id::text like '30000000-%';
delete from public.chats where client_id::text like '30000000-%' or pro_id::text like '30000000-%';
delete from public.users where id::text like '30000000-%';
delete from auth.users where id::text like '30000000-%';

insert into auth.users (id, email, raw_user_meta_data) values
  ('30000000-0000-0000-0000-000000000010', 'storage-client@example.test',
   '{"requested_role":"client"}'::jsonb),
  ('30000000-0000-0000-0000-000000000020', 'storage-pro@example.test',
   '{"requested_role":"pro","username":"storage-pro","business_name":"Storage Pro"}'::jsonb),
  ('30000000-0000-0000-0000-000000000030', 'storage-outsider@example.test',
   '{"requested_role":"client"}'::jsonb);

create temporary table storage_test_chat (id uuid);
grant all on storage_test_chat to authenticated;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into storage_test_chat values (
  public.get_or_create_chat(null, '30000000-0000-0000-0000-000000000020')
);
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into storage.objects (bucket_id, name, owner_id) values
  ('glossed-media',
   'profiles/30000000-0000-0000-0000-000000000010_profile.jpg',
   '30000000-0000-0000-0000-000000000010'),
  ('verification-documents',
   'verification/id/30000000-0000-0000-0000-000000000010_identity.jpg',
   '30000000-0000-0000-0000-000000000010'),
  ('chat_attachments',
   (select id::text from storage_test_chat) ||
     '/30000000-0000-0000-0000-000000000010_attachment.jpg',
   '30000000-0000-0000-0000-000000000010');

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner_id) values (
      'glossed-media',
      'profiles/30000000-0000-0000-0000-000000000020_forged.jpg',
      '30000000-0000-0000-0000-000000000010'
    );
    raise exception 'A user uploaded media into another user path';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name, owner_id) values (
      'verification-documents',
      'verification/id/30000000-0000-0000-0000-000000000020_forged.jpg',
      '30000000-0000-0000-0000-000000000010'
    );
    raise exception 'A user uploaded a verification document into another user path';
  exception when insufficient_privilege then null;
  end;
end
$$;

insert into public.messages (chat_id, sender_id, attachment_url)
select
  id,
  '30000000-0000-0000-0000-000000000010',
  id::text || '/30000000-0000-0000-0000-000000000010_attachment.jpg'
from storage_test_chat;

do $$
begin
  begin
    insert into public.messages (chat_id, sender_id, attachment_url)
    select
      id,
      '30000000-0000-0000-0000-000000000010',
      'https://example.test/tracking.png'
    from storage_test_chat;
    raise exception 'An external chat attachment URL was accepted';
  exception when insufficient_privilege then null;
  end;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000030', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if exists (
    select 1 from storage.objects
    where bucket_id in ('verification-documents', 'chat_attachments')
      and owner_id = '30000000-0000-0000-0000-000000000010'
  ) then
    raise exception 'An unrelated user can read private storage objects';
  end if;

  begin
    insert into storage.objects (bucket_id, name, owner_id)
    select
      'chat_attachments',
      id::text || '/30000000-0000-0000-0000-000000000030_forged.jpg',
      '30000000-0000-0000-0000-000000000030'
    from storage_test_chat;
    raise exception 'An unrelated user uploaded into a chat';
  exception when insufficient_privilege then null;
  end;
end
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  if (select count(*) from storage.objects
      where bucket_id = 'chat_attachments'
        and owner_id = '30000000-0000-0000-0000-000000000010') <> 1 then
    raise exception 'The other chat participant cannot read the attachment';
  end if;
end
$$;
commit;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'Allow verified uploads (restricted)',
        'Authenticated delete (all paths)',
        'Authenticated insert (all paths)',
        'Authenticated update (all paths)',
        'Authenticated users can update 5wsy0w_0',
        'Authenticated users can upload 5wsy0w_0',
        'Public read 5wsy0w_0',
        'Public read access',
        'Users can upload chat attachments',
        'Users upload chat attachments',
        'uthenticated users can delete 5wsy0w_0'
      )
  ) then
    raise exception 'A permissive historical storage policy remains active';
  end if;

  if (select public from storage.buckets where id = 'chat_attachments') then
    raise exception 'Chat attachments bucket is still public';
  end if;
  if (select public from storage.buckets where id = 'verification-documents') then
    raise exception 'Verification documents bucket is public';
  end if;
end
$$;

delete from storage.objects where owner_id like '30000000-%';
delete from public.messages where sender_id::text like '30000000-%';
delete from public.chats where client_id::text like '30000000-%' or pro_id::text like '30000000-%';
delete from public.users where id::text like '30000000-%';
delete from auth.users where id::text like '30000000-%';

select set_config('storage.allow_delete_query', 'false', false);

select 'storage security tests passed' as result;
