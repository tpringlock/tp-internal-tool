-- Row-Level Security for TP Academy.
-- Access model:
--   * Any authenticated user may READ published courses and their lessons/files.
--   * Admins may read everything (including drafts) and are the only writers.
-- The service role (used by admin server actions + the PDF streaming route)
-- bypasses RLS entirely.
--
-- NOTE: the RLS helper is `private.is_admin()`, not public. 0004_security_hardening
-- moved is_admin/is_active_user/is_project_member from public into the `private`
-- schema (kept out of PostgREST). New policies must call them via `private.*`;
-- the older 0002 policies still resolve only because Postgres tracks them by OID.

alter table public.courses      enable row level security;
alter table public.lessons      enable row level security;
alter table public.lesson_files enable row level security;

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
create policy courses_select on public.courses
  for select to authenticated
  using (status = 'published' or private.is_admin());

create policy courses_admin_write on public.courses
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ---------------------------------------------------------------------------
-- lessons: readable when their course is readable
-- ---------------------------------------------------------------------------
create policy lessons_select on public.lessons
  for select to authenticated
  using (
    private.is_admin()
    or exists (
      select 1 from public.courses c
      where c.id = lessons.course_id and c.status = 'published'
    )
  );

create policy lessons_admin_write on public.lessons
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ---------------------------------------------------------------------------
-- lesson_files: readable when their lesson's course is readable
-- ---------------------------------------------------------------------------
create policy lesson_files_select on public.lesson_files
  for select to authenticated
  using (
    private.is_admin()
    or exists (
      select 1
      from public.lessons l
      join public.courses c on c.id = l.course_id
      where l.id = lesson_files.lesson_id and c.status = 'published'
    )
  );

create policy lesson_files_admin_write on public.lesson_files
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());
