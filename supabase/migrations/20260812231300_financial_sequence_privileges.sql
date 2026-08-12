-- Identity sequences for server-only financial tables must not inherit the
-- broad Supabase default privileges granted to browser roles.

begin;

revoke all on sequence public.financial_audit_log_id_seq
  from public, anon, authenticated;
revoke all on sequence public.financial_ledger_entries_id_seq
  from public, anon, authenticated;
revoke all on sequence public.financial_runtime_control_events_id_seq
  from public, anon, authenticated;

grant all on sequence public.financial_audit_log_id_seq to service_role;
grant all on sequence public.financial_ledger_entries_id_seq to service_role;
grant all on sequence public.financial_runtime_control_events_id_seq to service_role;

commit;
