-- RLS for TP Academy v2 tables.
-- NOTE: the admin helper is `private.is_admin()` (moved out of public in 0004).
-- Chapters follow the lessons model in 0006 (readable when the course is
-- published, admin-only writes). Enrollment + progress are per-user: a user
-- manages only their own rows; admins may read all.

alter table public.chapters           enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.lesson_progress    enable row level security;

-- ---------------------------------------------------------------------------
-- chapters
-- ---------------------------------------------------------------------------
create policy chapters_select on public.chapters
  for select to authenticated
  using (
    private.is_admin()
    or exists (
      select 1 from public.courses c
      where c.id = chapters.course_id and c.status = 'published'
    )
  );

create policy chapters_admin_write on public.chapters
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ---------------------------------------------------------------------------
-- course_enrollments: users self-enroll into published courses and manage
-- their own enrollment; admins may read every enrollment.
-- ---------------------------------------------------------------------------
create policy course_enrollments_select on public.course_enrollments
  for select to authenticated
  using (private.is_admin() or user_id = auth.uid());

create policy course_enrollments_insert on public.course_enrollments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.courses c
      where c.id = course_enrollments.course_id and c.status = 'published'
    )
  );

create policy course_enrollments_update on public.course_enrollments
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy course_enrollments_delete on public.course_enrollments
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- lesson_progress: a user manages only their own progress rows.
-- ---------------------------------------------------------------------------
create policy lesson_progress_select on public.lesson_progress
  for select to authenticated
  using (private.is_admin() or user_id = auth.uid());

create policy lesson_progress_insert on public.lesson_progress
  for insert to authenticated
  with check (user_id = auth.uid());

create policy lesson_progress_delete on public.lesson_progress
  for delete to authenticated
  using (user_id = auth.uid());
