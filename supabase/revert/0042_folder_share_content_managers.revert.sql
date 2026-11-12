-- Hand-written revert for 0042 (NOT a migration; do not place in migrations/).
-- Restores the policies exactly as 0015_folder_shares.sql defined them.
-- WARNING: this reopens the hole (any member of one project of a client can
-- create/read client-wide folder links). Use only to roll back a broken deploy.

drop policy if exists folder_share_links_select on public.folder_share_links;
create policy folder_share_links_select on public.folder_share_links
  for select to authenticated
  using (
    (select private.is_admin())
    or created_by = (select auth.uid())
    or exists (
      select 1 from public.projects p
      where p.client_id = folder_share_links.client_id
        and private.is_project_member(p.id)
    )
  );

drop policy if exists folder_share_links_insert on public.folder_share_links;
create policy folder_share_links_insert on public.folder_share_links
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (select private.is_admin())
      or exists (
        select 1 from public.projects p
        where p.client_id = folder_share_links.client_id
          and private.is_project_member(p.id)
      )
    )
  );
