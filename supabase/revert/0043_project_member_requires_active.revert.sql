-- Hand-written revert for 0043 (NOT a migration; do not place in migrations/).
-- Restores the function body from 0001_init.sql (without the is_active check).

create or replace function private.is_project_member(pid uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = pid and m.user_id = uid
  );
$$;
