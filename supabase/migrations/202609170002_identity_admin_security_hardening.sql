create schema if not exists private;

alter function public.current_app_role() set schema private;
alter function public.handle_new_user() set schema private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

revoke all on function private.current_app_role() from public, anon;
grant execute on function private.current_app_role() to authenticated;

revoke all on function private.handle_new_user() from public, anon, authenticated;
