-- Row-Level Security policies.
-- Access model:
--   * Admins (profiles.role = 'admin', active) have full control everywhere.
--   * Employees may read/act only on projects they are a member of.
--   * Only admins may edit/delete documents; employees upload + read only.
--   * Employees may only insert documents they themselves upload
--     (uploaded_by = auth.uid()) into projects they belong to.
-- The service role (used by admin server actions) bypasses RLS entirely.

alter table public.profiles        enable row level security;
alter table public.clients         enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.documents       enable row level security;
alter table public.share_links     enable row level security;
alter table public.activity_log    enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Any authenticated user can read profiles (needed to show uploader names,
-- assign members, etc.). Column-level privilege changes are blocked by the
-- prevent_profile_privilege_change trigger.
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (true);

-- A user may update their own profile row (e.g. full_name).
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admins may update any profile row.
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- clients: everyone reads; admins write
-- ---------------------------------------------------------------------------
create policy clients_select_authenticated on public.clients
  for select to authenticated
  using (true);

create policy clients_admin_write on public.clients
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- projects: admins see all; employees see only projects they belong to
-- ---------------------------------------------------------------------------
create policy projects_select_member on public.projects
  for select to authenticated
  using (public.is_admin() or public.is_project_member(id));

create policy projects_admin_write on public.projects
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- project_members: admins manage; employees can see their own memberships
-- ---------------------------------------------------------------------------
create policy project_members_select on public.project_members
  for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

create policy project_members_admin_write on public.project_members
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
-- Read: admins see all; employees see documents in their projects.
create policy documents_select on public.documents
  for select to authenticated
  using (public.is_admin() or public.is_project_member(project_id));

-- Insert: admins anywhere; employees only into their projects, only as
-- themselves, and only while active.
create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.is_active_user()
      and uploaded_by = auth.uid()
      and public.is_project_member(project_id)
    )
  );

-- Update + delete: admins only.
create policy documents_update_admin on public.documents
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy documents_delete_admin on public.documents
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- share_links
-- ---------------------------------------------------------------------------
-- Read: admins all; others see links for documents they can access.
create policy share_links_select on public.share_links
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.documents d
      where d.id = share_links.document_id
        and public.is_project_member(d.project_id)
    )
  );

-- Create: must be able to access the underlying document, and record self.
create policy share_links_insert on public.share_links
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.documents d
        where d.id = share_links.document_id
          and public.is_project_member(d.project_id)
      )
    )
  );

-- Revoke (update): admins, or the link creator.
create policy share_links_update on public.share_links
  for update to authenticated
  using (public.is_admin() or created_by = auth.uid())
  with check (public.is_admin() or created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- activity_log: admins read all; users read their own. Insert own rows only.
-- No update/delete (append-only). Anonymous share opens are logged by the
-- service role, which bypasses RLS.
-- ---------------------------------------------------------------------------
create policy activity_log_select on public.activity_log
  for select to authenticated
  using (public.is_admin() or actor_user_id = auth.uid());

create policy activity_log_insert_self on public.activity_log
  for insert to authenticated
  with check (actor_user_id = auth.uid());
