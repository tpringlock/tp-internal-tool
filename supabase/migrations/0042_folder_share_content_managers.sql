-- Folder (client) share links expose EVERY document of EVERY project of the
-- client to anyone holding the token (lib/documents/folder-share.ts reads with
-- the service role, filtered only by client_id). 0015 let any member of a
-- single project under the client create such a link, and read all links of
-- the client (tokens included), so an employee could hand out documents of
-- projects they are not a member of.
--
-- Fix: only content managers (admin/manager, who can already read every
-- project: see 0022) may create folder links, and only they, or the link's
-- creator, may read them. Revoking stays admin or creator (unchanged).
--
-- Policy-only change: no table, column, or data is touched. Existing links are
-- NOT revoked here; review them with supabase/revert/list-employee-folder-shares.sql
-- first. Rollback: supabase/revert/0042_folder_share_content_managers.revert.sql

drop policy if exists folder_share_links_select on public.folder_share_links;
create policy folder_share_links_select on public.folder_share_links
  for select to authenticated
  using (
    (select private.is_content_manager())
    or created_by = (select auth.uid())
  );

drop policy if exists folder_share_links_insert on public.folder_share_links;
create policy folder_share_links_insert on public.folder_share_links
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.is_content_manager())
  );
