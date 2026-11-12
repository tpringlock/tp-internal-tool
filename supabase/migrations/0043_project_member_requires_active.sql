-- private.is_project_member (0001, moved to `private` by 0004) did not look at
-- profiles.is_active, unlike is_admin / is_content_manager / is_active_user.
-- A deactivated employee whose access token was still valid could therefore
-- keep reading documents of their projects through RLS until the token expired.
--
-- Make the membership check require an active profile. Same signature, so
-- every policy that references it picks the change up; CREATE OR REPLACE keeps
-- the existing owner and the EXECUTE grants from 0004.
--
-- Function-body change only: no table, column, or data is touched.
-- Rollback: supabase/revert/0043_project_member_requires_active.revert.sql

create or replace function private.is_project_member(pid uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members m
    join public.profiles p on p.id = m.user_id
    where m.project_id = pid
      and m.user_id = uid
      and p.is_active
  );
$$;
