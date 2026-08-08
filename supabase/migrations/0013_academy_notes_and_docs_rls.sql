-- RLS for TP Academy notes + course documents.
-- lesson_notes are per-user private (self manages own rows; not even admins read
-- others' notes). course_files follow the lesson_files model in 0006 (readable
-- when the course is published, admin-only writes).
-- The admin helper is private.is_admin() (moved out of public in 0004).

alter table public.lesson_notes enable row level security;
alter table public.course_files enable row level security;

-- ---------------------------------------------------------------------------
-- lesson_notes: strictly the owning user, for every operation.
-- ---------------------------------------------------------------------------
create policy lesson_notes_select on public.lesson_notes
  for select to authenticated
  using (user_id = auth.uid());

create policy lesson_notes_insert on public.lesson_notes
  for insert to authenticated
  with check (user_id = auth.uid());

create policy lesson_notes_update on public.lesson_notes
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy lesson_notes_delete on public.lesson_notes
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- course_files: readable when their course is readable; admin-only writes.
-- ---------------------------------------------------------------------------
create policy course_files_select on public.course_files
  for select to authenticated
  using (
    private.is_admin()
    or exists (
      select 1 from public.courses c
      where c.id = course_files.course_id and c.status = 'published'
    )
  );

create policy course_files_admin_write on public.course_files
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());
