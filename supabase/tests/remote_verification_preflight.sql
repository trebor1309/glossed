\set ON_ERROR_STOP on

begin transaction read only;

select version
from supabase_migrations.schema_migrations
order by version;

select
  coalesce(verification_status, '<null>') as verification_status,
  count(*) as profiles
from public.users
group by coalesce(verification_status, '<null>')
order by verification_status;

select
  count(*) filter (where verification_status = 'pending') as pending_profiles,
  count(*) filter (
    where verification_status = 'pending' and id_document is null
  ) as pending_without_id_reference,
  count(*) filter (where verification_status = 'verified') as verified_profiles,
  count(*) filter (
    where verification_status = 'verified' and id_document is null
  ) as verified_without_id_reference,
  count(*) filter (
    where verification_status not in ('unverified', 'pending', 'verified', 'rejected')
       or verification_status is null
  ) as unsupported_statuses
from public.users;

select
  count(*) filter (
    where u.verification_status = 'pending'
      and u.id_document is not null
      and o.id is null
  ) as pending_with_missing_private_object,
  count(*) filter (
    where u.verification_status = 'verified'
      and u.id_document is not null
      and o.id is null
  ) as verified_with_missing_private_object,
  count(*) filter (
    where u.verification_status = 'verified'
      and o.id is not null
      and o.owner_id is distinct from u.id::text
  ) as verified_with_wrong_object_owner
from public.users u
left join storage.objects o
  on o.bucket_id = 'verification-documents'
 and o.name = u.id_document;

select
  count(*) filter (where verification_status = 'verified' and verified_at is null)
    as verified_without_timestamp,
  count(*) filter (where verification_status = 'verified' and verified_by is null)
    as verified_without_reviewer,
  count(*) filter (
    where verified_by is not null
      and verified_by !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) as non_uuid_reviewer_values
from public.users;

select
  to_regclass('public.app_admins') as app_admins_table,
  to_regclass('public.professional_verification_reviews') as verification_reviews_table,
  to_regprocedure('public.review_professional_verification(uuid,text,text)')
    as review_rpc;

select
  id,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'verification-documents';

rollback;
