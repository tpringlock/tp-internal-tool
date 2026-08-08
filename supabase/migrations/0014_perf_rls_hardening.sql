-- Performance-advisor hardening for RLS (all WARN-level findings).
-- Two mechanical, semantics-preserving rewrites:
--
--   1. auth_rls_initplan — wrap per-row `auth.uid()` (and the argument-less
--      `private.is_admin()/is_active_user()` helpers) in a scalar subselect so
--      Postgres evaluates them ONCE per statement (initplan) instead of per row.
--      `private.is_project_member(<column>)` is left as-is: it depends on the row.
--
--   2. multiple_permissive_policies — the `*_admin_write FOR ALL` policies also
--      cover SELECT, overlapping each table's `*_select` policy (two permissive
--      SELECT policies = both evaluated per row). Split admin writes into
--      INSERT/UPDATE/DELETE so exactly one SELECT policy remains. Every
--      `*_select` already includes `private.is_admin()`, so admin read access
--      (incl. drafts) is unchanged.
--
-- Access semantics are identical to 0002/0006/0009/0011/0013; only evaluation
-- cost changes. Helpers live in `private` since 0004, so all references use it.
-- Idempotent: every policy is dropped-if-exists before being recreated.

-- ===========================================================================
-- Part 1 — auth_rls_initplan: wrap auth.uid()/helpers in (select …)
-- ===========================================================================

-- --- profiles: fold the two UPDATE policies into one (also clears the
--     multiple_permissive finding on profiles UPDATE). self OR admin.
drop policy if exists profiles_update_self  on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- --- project_members (SELECT)
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select to authenticated
  using ((select private.is_admin()) or user_id = (select auth.uid()));

-- --- documents (INSERT)
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    (select private.is_admin())
    or (
      (select private.is_active_user())
      and uploaded_by = (select auth.uid())
      and private.is_project_member(project_id)
    )
  );

-- --- share_links (INSERT, UPDATE)
drop policy if exists share_links_insert on public.share_links;
create policy share_links_insert on public.share_links
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (select private.is_admin())
      or exists (
        select 1 from public.documents d
        where d.id = share_links.document_id
          and private.is_project_member(d.project_id)
      )
    )
  );

drop policy if exists share_links_update on public.share_links;
create policy share_links_update on public.share_links
  for update to authenticated
  using ((select private.is_admin()) or created_by = (select auth.uid()))
  with check ((select private.is_admin()) or created_by = (select auth.uid()));

-- --- activity_log (SELECT, INSERT)
drop policy if exists activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log
  for select to authenticated
  using ((select private.is_admin()) or actor_user_id = (select auth.uid()));

drop policy if exists activity_log_insert_self on public.activity_log;
create policy activity_log_insert_self on public.activity_log
  for insert to authenticated
  with check (actor_user_id = (select auth.uid()));

-- --- course_enrollments (SELECT, INSERT, UPDATE, DELETE)
drop policy if exists course_enrollments_select on public.course_enrollments;
create policy course_enrollments_select on public.course_enrollments
  for select to authenticated
  using ((select private.is_admin()) or user_id = (select auth.uid()));

drop policy if exists course_enrollments_insert on public.course_enrollments;
create policy course_enrollments_insert on public.course_enrollments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.courses c
      where c.id = course_enrollments.course_id and c.status = 'published'
    )
  );

drop policy if exists course_enrollments_update on public.course_enrollments;
create policy course_enrollments_update on public.course_enrollments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists course_enrollments_delete on public.course_enrollments;
create policy course_enrollments_delete on public.course_enrollments
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- lesson_progress (SELECT, INSERT, DELETE)
drop policy if exists lesson_progress_select on public.lesson_progress;
create policy lesson_progress_select on public.lesson_progress
  for select to authenticated
  using ((select private.is_admin()) or user_id = (select auth.uid()));

drop policy if exists lesson_progress_insert on public.lesson_progress;
create policy lesson_progress_insert on public.lesson_progress
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists lesson_progress_delete on public.lesson_progress;
create policy lesson_progress_delete on public.lesson_progress
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- chapter_quiz_passes (SELECT, INSERT, DELETE)
drop policy if exists chapter_quiz_passes_select on public.chapter_quiz_passes;
create policy chapter_quiz_passes_select on public.chapter_quiz_passes
  for select to authenticated
  using ((select private.is_admin()) or user_id = (select auth.uid()));

drop policy if exists chapter_quiz_passes_insert on public.chapter_quiz_passes;
create policy chapter_quiz_passes_insert on public.chapter_quiz_passes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists chapter_quiz_passes_delete on public.chapter_quiz_passes;
create policy chapter_quiz_passes_delete on public.chapter_quiz_passes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- lesson_notes (SELECT, INSERT, UPDATE, DELETE)
drop policy if exists lesson_notes_select on public.lesson_notes;
create policy lesson_notes_select on public.lesson_notes
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists lesson_notes_insert on public.lesson_notes;
create policy lesson_notes_insert on public.lesson_notes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists lesson_notes_update on public.lesson_notes;
create policy lesson_notes_update on public.lesson_notes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists lesson_notes_delete on public.lesson_notes;
create policy lesson_notes_delete on public.lesson_notes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ===========================================================================
-- Part 2 — multiple_permissive_policies: split `*_admin_write FOR ALL` into
-- per-command INSERT/UPDATE/DELETE (admin SELECT stays via each *_select).
-- is_admin() wrapped in (select …) so these are initplan-friendly too.
-- ===========================================================================

-- clients
drop policy if exists clients_admin_write on public.clients;
create policy clients_admin_insert on public.clients
  for insert to authenticated with check ((select private.is_admin()));
create policy clients_admin_update on public.clients
  for update to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy clients_admin_delete on public.clients
  for delete to authenticated using ((select private.is_admin()));

-- projects
drop policy if exists projects_admin_write on public.projects;
create policy projects_admin_insert on public.projects
  for insert to authenticated with check ((select private.is_admin()));
create policy projects_admin_update on public.projects
  for update to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy projects_admin_delete on public.projects
  for delete to authenticated using ((select private.is_admin()));

-- project_members
drop policy if exists project_members_admin_write on public.project_members;
create policy project_members_admin_insert on public.project_members
  for insert to authenticated with check ((select private.is_admin()));
create policy project_members_admin_update on public.project_members
  for update to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy project_members_admin_delete on public.project_members
  for delete to authenticated using ((select private.is_admin()));

-- courses
drop policy if exists courses_admin_write on public.courses;
create policy courses_admin_insert on public.courses
  for insert to authenticated with check ((select private.is_admin()));
create policy courses_admin_update on public.courses
  for update to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy courses_admin_delete on public.courses
  for delete to authenticated using ((select private.is_admin()));

-- lessons
drop policy if exists lessons_admin_write on public.lessons;
create policy lessons_admin_insert on public.lessons
  for insert to authenticated with check ((select private.is_admin()));
create policy lessons_admin_update on public.lessons
  for update to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy lessons_admin_delete on public.lessons
  for delete to authenticated using ((select private.is_admin()));

-- chapters
drop policy if exists chapters_admin_write on public.chapters;
create policy chapters_admin_insert on public.chapters
  for insert to authenticated with check ((select private.is_admin()));
create policy chapters_admin_update on public.chapters
  for update to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy chapters_admin_delete on public.chapters
  for delete to authenticated using ((select private.is_admin()));

-- lesson_files
drop policy if exists lesson_files_admin_write on public.lesson_files;
create policy lesson_files_admin_insert on public.lesson_files
  for insert to authenticated with check ((select private.is_admin()));
create policy lesson_files_admin_update on public.lesson_files
  for update to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy lesson_files_admin_delete on public.lesson_files
  for delete to authenticated using ((select private.is_admin()));

-- course_files
drop policy if exists course_files_admin_write on public.course_files;
create policy course_files_admin_insert on public.course_files
  for insert to authenticated with check ((select private.is_admin()));
create policy course_files_admin_update on public.course_files
  for update to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy course_files_admin_delete on public.course_files
  for delete to authenticated using ((select private.is_admin()));

-- quiz_questions
drop policy if exists quiz_questions_admin_write on public.quiz_questions;
create policy quiz_questions_admin_insert on public.quiz_questions
  for insert to authenticated with check ((select private.is_admin()));
create policy quiz_questions_admin_update on public.quiz_questions
  for update to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy quiz_questions_admin_delete on public.quiz_questions
  for delete to authenticated using ((select private.is_admin()));

-- quiz_options
drop policy if exists quiz_options_admin_write on public.quiz_options;
create policy quiz_options_admin_insert on public.quiz_options
  for insert to authenticated with check ((select private.is_admin()));
create policy quiz_options_admin_update on public.quiz_options
  for update to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy quiz_options_admin_delete on public.quiz_options
  for delete to authenticated using ((select private.is_admin()));
