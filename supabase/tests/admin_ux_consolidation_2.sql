\set ON_ERROR_STOP on

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '89200000-%' or entity_id like '89200000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
alter table public.admin_auth_events disable trigger admin_auth_events_immutable;
delete from public.admin_auth_events where user_id::text like '89200000-%';
alter table public.admin_auth_events enable trigger admin_auth_events_immutable;
delete from public.professional_verification_reviews where professional_id::text like '89200000-%' or reviewer_id::text like '89200000-%';
delete from public.missions where id::text like '89200000-%';
delete from public.admin_account_roles where user_id::text like '89200000-%';
delete from public.admin_accounts where user_id::text like '89200000-%';
delete from public.users where id::text like '89200000-%';
delete from auth.users where id::text like '89200000-%';

insert into auth.users (id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
  ('89200000-0000-0000-0000-000000000001','ux2-admin@example.test',clock_timestamp(),' {"account_type":"admin"}','{}'),
  ('89200000-0000-0000-0000-000000000002','ux2-client@example.test',clock_timestamp(),'{}','{}'),
  ('89200000-0000-0000-0000-000000000003','ux2-provider@example.test',clock_timestamp(),'{}','{"requested_role":"pro"}'),
  ('89200000-0000-0000-0000-000000000004','ux2-outsider@example.test',clock_timestamp(),'{}','{}');

update public.users set role='pro',active_role='pro' where id='89200000-0000-0000-0000-000000000003';
insert into public.admin_accounts(user_id,display_name) values ('89200000-0000-0000-0000-000000000001','UX2 administrator');
insert into public.admin_account_roles(user_id,role_code) values ('89200000-0000-0000-0000-000000000001','super_admin');
insert into public.admin_auth_events(user_id,admin_account_id,event_type,outcome,session_id,aal,deduplication_key) values
  ('89200000-0000-0000-0000-000000000001','89200000-0000-0000-0000-000000000001','access_denied','denied','ux2-denied','aal1','ux2-auth-denied'),
  ('89200000-0000-0000-0000-000000000001','89200000-0000-0000-0000-000000000001','mfa_required','challenge_required','ux2-challenge','aal1','ux2-auth-challenge');
insert into public.missions(id,client_id,pro_id,service,date,status,financial_flow_version) values
  ('89200000-0000-0000-0000-000000000101','89200000-0000-0000-0000-000000000002','89200000-0000-0000-0000-000000000003','Legacy UX mission',clock_timestamp()+interval '2 days','confirmed','legacy_v1'),
  ('89200000-0000-0000-0000-000000000102','89200000-0000-0000-0000-000000000002','89200000-0000-0000-0000-000000000003','Marketplace UX mission',clock_timestamp()+interval '3 days','proposed','marketplace_v2');
insert into public.professional_verification_reviews(professional_id,reviewer_id,previous_status,decision,reason)
values ('89200000-0000-0000-0000-000000000003','89200000-0000-0000-0000-000000000001','pending','rejected','Test history reason');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','89200000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','89200000-0000-0000-0000-000000000001','role','authenticated','aal','aal2','session_id','ux2-session','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from clock_timestamp())::bigint)))::text,true);
do $$
declare v_result jsonb; v_counts jsonb;
begin
  v_result:=public.admin_list_missions_ux_v2(null,'all','legacy_v1',null,null,null,false,25,0);
  if (v_result->>'total')::integer<>1 or v_result->'items'->0->>'financial_flow_version'<>'legacy_v1' then raise exception 'Legacy mission filtering failed'; end if;
  v_result:=public.admin_list_missions_ux_v2('Marketplace UX','proposed','marketplace_v2','provider@example.test',null,null,false,25,0);
  if (v_result->>'total')::integer<>1 or v_result->'items'->0->>'operational_state'<>'proposed'
     or (v_result->'items'->0->>'attention_required')::boolean then raise exception 'Marketplace operational mission filtering failed'; end if;
  v_result:=public.admin_list_professional_verifications_ux_v2('history',50,0);
  if (v_result->>'total')::integer<>1 or v_result->'items'->0->>'reviewer_email'<>'ux2-admin@example.test' then raise exception 'Verification history projection failed'; end if;
  v_counts:=public.admin_get_dispute_queue_counts_ux_v2();
  if not (v_counts ?& array['disputes_open','disputes_history','cancellations_open','cancellations_history']) then raise exception 'Dispute counters incomplete'; end if;
  v_counts:=public.admin_get_payment_dispute_counts_ux_v2();
  if not (v_counts ?& array['open','won','lost_review','resolved','all']) then raise exception 'Payment dispute counters incomplete'; end if;
  v_counts:=public.admin_get_incident_counts_ux_v2();
  if not (v_counts ?& array['open','all','blocking','critical']) then raise exception 'Incident counters incomplete'; end if;
  v_result:=public.admin_search_audit_ux_v2(null,'all','success','ux2-admin@example.test',null,null,50,0);
  if (v_result->>'total')::integer<1 or v_result->'items'->0->>'actor_email'<>'ux2-admin@example.test' then raise exception 'Filtered audit actor projection failed'; end if;
  v_result:=public.admin_search_audit_ux_v2(null,'authentication','failed','ux2-admin@example.test',null,null,50,0);
  if (v_result->>'total')::integer<>2
     or not (v_result->'items' @> '[{"outcome":"denied"}]'::jsonb)
     or not (v_result->'items' @> '[{"outcome":"challenge_required"}]'::jsonb)
  then raise exception 'Failure filter omitted non-success audit outcomes'; end if;
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','89200000-0000-0000-0000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','89200000-0000-0000-0000-000000000004','role','authenticated','aal','aal2')::text,true);
do $$ begin
  begin perform public.admin_list_missions_ux_v2(); raise exception 'Outsider listed missions'; exception when insufficient_privilege then null; end;
  begin perform public.admin_list_professional_verifications_ux_v2(); raise exception 'Outsider listed verifications'; exception when insufficient_privilege then null; end;
  begin perform public.admin_search_audit_ux_v2(); raise exception 'Outsider searched audit'; exception when insufficient_privilege then null; end;
end $$;
commit;

alter table public.admin_audit_log disable trigger admin_audit_log_immutable;
delete from public.admin_audit_log where admin_account_id::text like '89200000-%' or entity_id like '89200000-%';
alter table public.admin_audit_log enable trigger admin_audit_log_immutable;
alter table public.admin_auth_events disable trigger admin_auth_events_immutable;
delete from public.admin_auth_events where user_id::text like '89200000-%';
alter table public.admin_auth_events enable trigger admin_auth_events_immutable;
delete from public.professional_verification_reviews where professional_id::text like '89200000-%' or reviewer_id::text like '89200000-%';
delete from public.missions where id::text like '89200000-%';
delete from public.admin_account_roles where user_id::text like '89200000-%';
delete from public.admin_accounts where user_id::text like '89200000-%';
delete from public.users where id::text like '89200000-%';
delete from auth.users where id::text like '89200000-%';

select 'admin UX consolidation tranche 2 tests passed' as result;
