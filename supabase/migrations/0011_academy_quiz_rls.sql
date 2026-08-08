-- RLS for TP Academy quizzes.
-- Questions/options follow the lessons model in 0006 (readable when the owning
-- course is published, admin-only writes). Passes are per-user like
-- lesson_progress: a user manages only their own rows; admins may read all.
--
-- NOTE: exposing quiz_options.is_correct via SELECT is acceptable here because
-- learner-facing code never selects that column and grading is done server-side.
-- The admin helper is private.is_admin() (moved out of public in 0004).

alter table public.quiz_questions      enable row level security;
alter table public.quiz_options        enable row level security;
alter table public.chapter_quiz_passes enable row level security;

-- ---------------------------------------------------------------------------
-- quiz_questions: readable when their chapter's course is published.
-- ---------------------------------------------------------------------------
create policy quiz_questions_select on public.quiz_questions
  for select to authenticated
  using (
    private.is_admin()
    or exists (
      select 1
      from public.chapters ch
      join public.courses c on c.id = ch.course_id
      where ch.id = quiz_questions.chapter_id and c.status = 'published'
    )
  );

create policy quiz_questions_admin_write on public.quiz_questions
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ---------------------------------------------------------------------------
-- quiz_options: readable when their question is readable.
-- ---------------------------------------------------------------------------
create policy quiz_options_select on public.quiz_options
  for select to authenticated
  using (
    private.is_admin()
    or exists (
      select 1
      from public.quiz_questions q
      join public.chapters ch on ch.id = q.chapter_id
      join public.courses c on c.id = ch.course_id
      where q.id = quiz_options.question_id and c.status = 'published'
    )
  );

create policy quiz_options_admin_write on public.quiz_options
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ---------------------------------------------------------------------------
-- chapter_quiz_passes: a user manages only their own pass rows.
-- ---------------------------------------------------------------------------
create policy chapter_quiz_passes_select on public.chapter_quiz_passes
  for select to authenticated
  using (private.is_admin() or user_id = auth.uid());

create policy chapter_quiz_passes_insert on public.chapter_quiz_passes
  for insert to authenticated
  with check (user_id = auth.uid());

create policy chapter_quiz_passes_delete on public.chapter_quiz_passes
  for delete to authenticated
  using (user_id = auth.uid());
