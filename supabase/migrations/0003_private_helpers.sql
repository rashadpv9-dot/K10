-- Move the role-check helpers out of the API-exposed "public" schema.
-- Policies keep working (they reference the functions directly), but the helpers can no
-- longer be called through /rest/v1/rpc.

create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.current_staff_role(uuid) set schema private;
alter function public.is_staff(uuid) set schema private;
alter function public.is_manager(uuid) set schema private;
alter function public.is_owner(uuid) set schema private;
alter function public.storage_outlet(text) set schema private;

-- The bodies named each other by schema, so point them at the new home.
create or replace function private.is_staff(p_outlet uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.current_staff_role(p_outlet) is not null $$;

create or replace function private.is_manager(p_outlet uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(private.current_staff_role(p_outlet) in ('owner', 'manager'), false) $$;

create or replace function private.is_owner(p_outlet uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(private.current_staff_role(p_outlet) = 'owner', false) $$;
