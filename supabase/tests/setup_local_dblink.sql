\set ON_ERROR_STOP on

-- Local test infrastructure only. Never run this helper against a linked DB.
create schema if not exists extensions;
create extension if not exists dblink with schema extensions;
grant execute on function extensions.dblink_connect_u(text, text) to postgres;
alter role glossed_local_sql_test bypassrls;
