-- Folder (client) share links: a single public token that grants anonymous
-- read/download access to every document across all of a client's projects.
-- Mirrors public.share_links, but keyed to a client instead of one document.
-- RLS follows the hardened form from 0014 (private.* helpers, (select …) wraps).

create table public.folder_share_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz default now()
);

create index folder_share_links_client_id_idx
  on public.folder_share_links (client_id);

alter table public.folder_share_links enable row level security;

-- Read: admins; the link creator; or a member of any project under the client.
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

-- Create: must record self, and be an admin or a member of one of the client's
-- projects (mirrors the document-level share access check).
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

-- Revoke (update): admins, or the link creator.
create policy folder_share_links_update on public.folder_share_links
  for update to authenticated
  using ((select private.is_admin()) or created_by = (select auth.uid()))
  with check ((select private.is_admin()) or created_by = (select auth.uid()));
