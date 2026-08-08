-- Security-advisor hardening. Clears the SQL-fixable findings from 0001_init.sql:
--   * function_search_path_mutable (set_updated_at)
--   * anon_/authenticated_security_definer_function_executable (six functions)
-- Append-only: 0001/0002 are left untouched. A fresh install runs
-- 0001 -> 0002 -> 0004 and lands in the same hardened end-state as an existing DB.
--
-- The leaked-password protection finding (auth_leaked_password_protection) is a
-- dashboard toggle, not SQL; see supabase/README.md.

-- ---------------------------------------------------------------------------
-- 1. Private schema for the RLS helper functions.
--    PostgREST only exposes `public` (+ graphql_public), so functions living
--    here are no longer reachable via /rest/v1/rpc/... — which is exactly what
--    the security advisor asks for. `authenticated` still needs USAGE so the
--    RLS policies (which now call private.*) can resolve them.
-- ---------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Move the SECURITY DEFINER RLS helpers out of the API-exposed public schema.
--    Existing RLS policies reference these by OID, so SET SCHEMA does not break
--    them. Their bodies fully-qualify public.profiles / public.project_members,
--    so they keep resolving; their `set search_path = public` is preserved.
-- ---------------------------------------------------------------------------
alter function public.is_admin(uuid)                set schema private;
alter function public.is_active_user(uuid)          set schema private;
alter function public.is_project_member(uuid, uuid) set schema private;

-- Lock down EXECUTE: signed-in users only (needed for RLS), never anon/public.
revoke execute on function private.is_admin(uuid)                from public;
revoke execute on function private.is_active_user(uuid)          from public;
revoke execute on function private.is_project_member(uuid, uuid) from public;
grant  execute on function private.is_admin(uuid)                to authenticated;
grant  execute on function private.is_active_user(uuid)          to authenticated;
grant  execute on function private.is_project_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. prevent_profile_privilege_change is plpgsql and resolves function names at
--    runtime, so its is_admin() call must be repointed to the new schema.
--    Body is otherwise identical to 0001_init.sql.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if (new.role is distinct from old.role)
     or (new.is_active is distinct from old.is_active) then
    if not private.is_admin(auth.uid()) then
      raise exception 'Only admins may change role or active status';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Pin set_updated_at's search_path (fixes function_search_path_mutable).
-- ---------------------------------------------------------------------------
alter function public.set_updated_at() set search_path = public;

-- ---------------------------------------------------------------------------
-- 5. Trigger-only functions are never called directly; triggers fire without an
--    EXECUTE privilege check, so revoke it from all client roles. This clears
--    their SECURITY DEFINER executable warnings while leaving the triggers
--    fully functional.
-- ---------------------------------------------------------------------------
revoke execute on function public.handle_new_user()                  from public, anon, authenticated;
revoke execute on function public.prevent_profile_privilege_change() from public, anon, authenticated;
revoke execute on function public.set_updated_at()                   from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. rls_auto_enable exists in the live DB but not in this repo (added out of
--    band). Lock it down defensively if present. TODO: review this function's
--    source and either move it into a migration or drop it if unused.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
