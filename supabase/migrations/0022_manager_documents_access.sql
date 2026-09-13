-- 0017 granted managers create/edit on clients and projects, but the documents
-- policies (select from 0002, insert from 0014) still gate them by project
-- membership — so a manager couldn't see all client folders on /documents or
-- upload into a project they just created. Align documents access with the
-- content-manager model: managers/admins read and upload everywhere, employees
-- keep membership-based access. DELETE stays admin-only (documents_delete_admin
-- is untouched).
--
-- Style matches 0014/0017: argument-less helpers wrapped in a scalar subselect
-- (initplan), policies dropped-if-exists so the file is idempotent.

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using (
    (select private.is_content_manager())
    or private.is_project_member(project_id)
  );

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    (select private.is_content_manager())
    or (
      (select private.is_active_user())
      and uploaded_by = (select auth.uid())
      and private.is_project_member(project_id)
    )
  );
