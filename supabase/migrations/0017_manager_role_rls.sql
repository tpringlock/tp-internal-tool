-- Grant the 'manager' role create/edit access to clients, projects and the full
-- TP Academy content tree, while DELETE of the top-level entities
-- (clients / projects / courses) stays admin-only.
--
-- Managers are otherwise identical to employees. This file references the
-- 'manager' enum value added in 0016; it must run as a later, separate
-- transaction (see the note in 0016_manager_role_enum.sql).
--
-- Style matches 0014_perf_rls_hardening.sql: argument-less helpers are wrapped in
-- a scalar subselect so they evaluate once per statement (initplan), and every
-- policy is dropped-if-exists before being recreated so this file is idempotent.

-- ---------------------------------------------------------------------------
-- Helper: admin OR active manager. Superset of private.is_admin(), so it can
-- replace is_admin() in policies that should also admit managers.
-- ---------------------------------------------------------------------------
create or replace function private.is_content_manager(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role in ('admin', 'manager') and p.is_active
  );
$$;

revoke execute on function private.is_content_manager(uuid) from public;
grant  execute on function private.is_content_manager(uuid) to authenticated;

-- ===========================================================================
-- clients: managers insert/update; delete stays admin-only.
-- ===========================================================================
drop policy if exists clients_admin_insert on public.clients;
create policy clients_admin_insert on public.clients
  for insert to authenticated with check ((select private.is_content_manager()));

drop policy if exists clients_admin_update on public.clients;
create policy clients_admin_update on public.clients
  for update to authenticated using ((select private.is_content_manager()))
  with check ((select private.is_content_manager()));

-- ===========================================================================
-- projects: managers insert/update + read all; delete stays admin-only.
-- ===========================================================================
drop policy if exists projects_select_member on public.projects;
create policy projects_select_member on public.projects
  for select to authenticated
  using ((select private.is_content_manager()) or private.is_project_member(id));

drop policy if exists projects_admin_insert on public.projects;
create policy projects_admin_insert on public.projects
  for insert to authenticated with check ((select private.is_content_manager()));

drop policy if exists projects_admin_update on public.projects;
create policy projects_admin_update on public.projects
  for update to authenticated using ((select private.is_content_manager()))
  with check ((select private.is_content_manager()));

-- ===========================================================================
-- courses: managers read drafts + insert/update; delete stays admin-only.
-- ===========================================================================
drop policy if exists courses_select on public.courses;
create policy courses_select on public.courses
  for select to authenticated
  using (status = 'published' or (select private.is_content_manager()));

drop policy if exists courses_admin_insert on public.courses;
create policy courses_admin_insert on public.courses
  for insert to authenticated with check ((select private.is_content_manager()));

drop policy if exists courses_admin_update on public.courses;
create policy courses_admin_update on public.courses
  for update to authenticated using ((select private.is_content_manager()))
  with check ((select private.is_content_manager()));

-- ===========================================================================
-- Course sub-content (lessons, chapters, files, quiz): managers get full
-- read + write INCLUDING delete, since removing a lesson/question is part of
-- editing a course. Only the top-level course delete is reserved for admins.
-- ===========================================================================

-- --- lessons
drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons
  for select to authenticated
  using (
    (select private.is_content_manager())
    or exists (
      select 1 from public.courses c
      where c.id = lessons.course_id and c.status = 'published'
    )
  );
drop policy if exists lessons_admin_insert on public.lessons;
create policy lessons_admin_insert on public.lessons
  for insert to authenticated with check ((select private.is_content_manager()));
drop policy if exists lessons_admin_update on public.lessons;
create policy lessons_admin_update on public.lessons
  for update to authenticated using ((select private.is_content_manager()))
  with check ((select private.is_content_manager()));
drop policy if exists lessons_admin_delete on public.lessons;
create policy lessons_admin_delete on public.lessons
  for delete to authenticated using ((select private.is_content_manager()));

-- --- chapters
drop policy if exists chapters_select on public.chapters;
create policy chapters_select on public.chapters
  for select to authenticated
  using (
    (select private.is_content_manager())
    or exists (
      select 1 from public.courses c
      where c.id = chapters.course_id and c.status = 'published'
    )
  );
drop policy if exists chapters_admin_insert on public.chapters;
create policy chapters_admin_insert on public.chapters
  for insert to authenticated with check ((select private.is_content_manager()));
drop policy if exists chapters_admin_update on public.chapters;
create policy chapters_admin_update on public.chapters
  for update to authenticated using ((select private.is_content_manager()))
  with check ((select private.is_content_manager()));
drop policy if exists chapters_admin_delete on public.chapters;
create policy chapters_admin_delete on public.chapters
  for delete to authenticated using ((select private.is_content_manager()));

-- --- lesson_files
drop policy if exists lesson_files_select on public.lesson_files;
create policy lesson_files_select on public.lesson_files
  for select to authenticated
  using (
    (select private.is_content_manager())
    or exists (
      select 1
      from public.lessons l
      join public.courses c on c.id = l.course_id
      where l.id = lesson_files.lesson_id and c.status = 'published'
    )
  );
drop policy if exists lesson_files_admin_insert on public.lesson_files;
create policy lesson_files_admin_insert on public.lesson_files
  for insert to authenticated with check ((select private.is_content_manager()));
drop policy if exists lesson_files_admin_update on public.lesson_files;
create policy lesson_files_admin_update on public.lesson_files
  for update to authenticated using ((select private.is_content_manager()))
  with check ((select private.is_content_manager()));
drop policy if exists lesson_files_admin_delete on public.lesson_files;
create policy lesson_files_admin_delete on public.lesson_files
  for delete to authenticated using ((select private.is_content_manager()));

-- --- course_files
drop policy if exists course_files_select on public.course_files;
create policy course_files_select on public.course_files
  for select to authenticated
  using (
    (select private.is_content_manager())
    or exists (
      select 1 from public.courses c
      where c.id = course_files.course_id and c.status = 'published'
    )
  );
drop policy if exists course_files_admin_insert on public.course_files;
create policy course_files_admin_insert on public.course_files
  for insert to authenticated with check ((select private.is_content_manager()));
drop policy if exists course_files_admin_update on public.course_files;
create policy course_files_admin_update on public.course_files
  for update to authenticated using ((select private.is_content_manager()))
  with check ((select private.is_content_manager()));
drop policy if exists course_files_admin_delete on public.course_files;
create policy course_files_admin_delete on public.course_files
  for delete to authenticated using ((select private.is_content_manager()));

-- --- quiz_questions
drop policy if exists quiz_questions_select on public.quiz_questions;
create policy quiz_questions_select on public.quiz_questions
  for select to authenticated
  using (
    (select private.is_content_manager())
    or exists (
      select 1
      from public.chapters ch
      join public.courses c on c.id = ch.course_id
      where ch.id = quiz_questions.chapter_id and c.status = 'published'
    )
  );
drop policy if exists quiz_questions_admin_insert on public.quiz_questions;
create policy quiz_questions_admin_insert on public.quiz_questions
  for insert to authenticated with check ((select private.is_content_manager()));
drop policy if exists quiz_questions_admin_update on public.quiz_questions;
create policy quiz_questions_admin_update on public.quiz_questions
  for update to authenticated using ((select private.is_content_manager()))
  with check ((select private.is_content_manager()));
drop policy if exists quiz_questions_admin_delete on public.quiz_questions;
create policy quiz_questions_admin_delete on public.quiz_questions
  for delete to authenticated using ((select private.is_content_manager()));

-- --- quiz_options
drop policy if exists quiz_options_select on public.quiz_options;
create policy quiz_options_select on public.quiz_options
  for select to authenticated
  using (
    (select private.is_content_manager())
    or exists (
      select 1
      from public.quiz_questions q
      join public.chapters ch on ch.id = q.chapter_id
      join public.courses c on c.id = ch.course_id
      where q.id = quiz_options.question_id and c.status = 'published'
    )
  );
drop policy if exists quiz_options_admin_insert on public.quiz_options;
create policy quiz_options_admin_insert on public.quiz_options
  for insert to authenticated with check ((select private.is_content_manager()));
drop policy if exists quiz_options_admin_update on public.quiz_options;
create policy quiz_options_admin_update on public.quiz_options
  for update to authenticated using ((select private.is_content_manager()))
  with check ((select private.is_content_manager()));
drop policy if exists quiz_options_admin_delete on public.quiz_options;
create policy quiz_options_admin_delete on public.quiz_options
  for delete to authenticated using ((select private.is_content_manager()));
