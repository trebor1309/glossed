-- Restrict browser storage access to owned media, private verification files,
-- and chat attachments belonging to a conversation participant.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'glossed-media',
    'glossed-media',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'chat_attachments',
    'chat_attachments',
    false,
    5242880,
    array['image/jpeg']::text[]
  ),
  (
    'verification-documents',
    'verification-documents',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Allow verified uploads (restricted)" on storage.objects;
drop policy if exists "Authenticated delete (all paths)" on storage.objects;
drop policy if exists "Authenticated insert (all paths)" on storage.objects;
drop policy if exists "Authenticated update (all paths)" on storage.objects;
drop policy if exists "Authenticated users can update 5wsy0w_0" on storage.objects;
drop policy if exists "Authenticated users can upload 5wsy0w_0" on storage.objects;
drop policy if exists "Public read 5wsy0w_0" on storage.objects;
drop policy if exists "Public read access" on storage.objects;
drop policy if exists "Users can upload chat attachments" on storage.objects;
drop policy if exists "Users upload chat attachments" on storage.objects;
drop policy if exists "uthenticated users can delete 5wsy0w_0" on storage.objects;

drop policy if exists "public_media_read" on storage.objects;
drop policy if exists "public_media_insert_own" on storage.objects;
drop policy if exists "public_media_update_own" on storage.objects;
drop policy if exists "public_media_delete_own" on storage.objects;
drop policy if exists "verification_documents_select_own" on storage.objects;
drop policy if exists "verification_documents_insert_own" on storage.objects;
drop policy if exists "verification_documents_delete_own" on storage.objects;
drop policy if exists "chat_attachments_select_participant" on storage.objects;
drop policy if exists "chat_attachments_insert_participant" on storage.objects;
drop policy if exists "chat_attachments_delete_own" on storage.objects;

create policy "public_media_read"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'glossed-media'
  and cardinality(storage.foldername(name)) = 1
  and (storage.foldername(name))[1] in ('profile', 'profiles', 'portfolio')
);

create policy "public_media_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'glossed-media'
  and owner_id = auth.uid()::text
  and cardinality(storage.foldername(name)) = 1
  and (storage.foldername(name))[1] in ('profile', 'profiles', 'portfolio')
  and starts_with(storage.filename(name), auth.uid()::text || '_')
);

create policy "public_media_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'glossed-media'
  and owner_id = auth.uid()::text
  and cardinality(storage.foldername(name)) = 1
  and (storage.foldername(name))[1] in ('profile', 'profiles', 'portfolio')
  and starts_with(storage.filename(name), auth.uid()::text || '_')
)
with check (
  bucket_id = 'glossed-media'
  and owner_id = auth.uid()::text
  and cardinality(storage.foldername(name)) = 1
  and (storage.foldername(name))[1] in ('profile', 'profiles', 'portfolio')
  and starts_with(storage.filename(name), auth.uid()::text || '_')
);

create policy "public_media_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'glossed-media'
  and owner_id = auth.uid()::text
  and cardinality(storage.foldername(name)) = 1
  and (storage.foldername(name))[1] in ('profile', 'profiles', 'portfolio')
  and starts_with(storage.filename(name), auth.uid()::text || '_')
);

create policy "verification_documents_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'verification-documents'
  and owner_id = auth.uid()::text
  and cardinality(storage.foldername(name)) = 2
  and (storage.foldername(name))[1] = 'verification'
  and (storage.foldername(name))[2] in ('id', 'certificate')
  and starts_with(storage.filename(name), auth.uid()::text || '_')
);

create policy "verification_documents_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'verification-documents'
  and owner_id = auth.uid()::text
  and cardinality(storage.foldername(name)) = 2
  and (storage.foldername(name))[1] = 'verification'
  and (storage.foldername(name))[2] in ('id', 'certificate')
  and starts_with(storage.filename(name), auth.uid()::text || '_')
);

create policy "verification_documents_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'verification-documents'
  and owner_id = auth.uid()::text
  and cardinality(storage.foldername(name)) = 2
  and (storage.foldername(name))[1] = 'verification'
  and (storage.foldername(name))[2] in ('id', 'certificate')
  and starts_with(storage.filename(name), auth.uid()::text || '_')
);

create policy "chat_attachments_select_participant"
on storage.objects for select
to authenticated
using (
  bucket_id = 'chat_attachments'
  and exists (
    select 1
    from public.chats c
    where c.id::text = split_part(name, '/', 1)
      and auth.uid() in (c.pro_id, c.client_id)
  )
);

create policy "chat_attachments_insert_participant"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'chat_attachments'
  and owner_id = auth.uid()::text
  and cardinality(storage.foldername(name)) = 1
  and starts_with(storage.filename(name), auth.uid()::text || '_')
  and exists (
    select 1
    from public.chats c
    where c.id::text = split_part(name, '/', 1)
      and auth.uid() in (c.pro_id, c.client_id)
  )
);

create policy "chat_attachments_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'chat_attachments'
  and owner_id = auth.uid()::text
  and exists (
    select 1
    from public.chats c
    where c.id::text = split_part(name, '/', 1)
      and auth.uid() in (c.pro_id, c.client_id)
  )
);

create or replace function public.protect_message_attachments()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' and new.attachment_url is not null and (
    new.sender_id is distinct from auth.uid()
    or not starts_with(
      new.attachment_url,
      new.chat_id::text || '/' || auth.uid()::text || '_'
    )
  ) then
    raise exception 'Invalid chat attachment path' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists protect_message_attachments on public.messages;
create trigger protect_message_attachments
before insert or update of attachment_url, chat_id, sender_id on public.messages
for each row execute function public.protect_message_attachments();

create or replace function public.protect_verification_document_references()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' and (
    (
      new.id_document is distinct from old.id_document
      and new.id_document is not null
      and not starts_with(
        new.id_document,
        'verification/id/' || auth.uid()::text || '_'
      )
    )
    or (
      new.certificate_document is distinct from old.certificate_document
      and new.certificate_document is not null
      and not starts_with(
        new.certificate_document,
        'verification/certificate/' || auth.uid()::text || '_'
      )
    )
  ) then
    raise exception 'Invalid verification document path' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists protect_verification_document_references on public.users;
create trigger protect_verification_document_references
before update of id_document, certificate_document on public.users
for each row execute function public.protect_verification_document_references();
