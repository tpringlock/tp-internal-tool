-- TP Academy quizzes: an optional per-chapter quiz that gates progression.
-- A chapter may have 0..n questions; each question has 2..n options with exactly
-- one correct choice (single-correct). A learner must answer every question in a
-- chapter correctly to record a pass; the next chapter unlocks only then
-- (gating computed in the app layer via chapterUnlockFlags). RLS in 0011.
--
-- Reuses the shared foundation: public.set_updated_at() and private.is_admin().

-- ---------------------------------------------------------------------------
-- quiz_questions: ordered questions within a chapter.
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_questions (
  id         uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  prompt     text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quiz_questions_chapter_idx
  on public.quiz_questions (chapter_id, position);

create trigger quiz_questions_set_updated_at
  before update on public.quiz_questions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- quiz_options: choices for a question. is_correct is never sent to learners
-- (grading is server-side); learner queries select only id/label/position.
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  label       text not null,
  is_correct  boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists quiz_options_question_idx
  on public.quiz_options (question_id, position);

-- ---------------------------------------------------------------------------
-- chapter_quiz_passes: one row per (user, chapter) once the learner has
-- answered every question in the chapter correctly. course_id is denormalized
-- so per-course pass counts stay a single cheap query (mirrors lesson_progress).
-- ---------------------------------------------------------------------------
create table if not exists public.chapter_quiz_passes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  course_id  uuid not null references public.courses (id) on delete cascade,
  passed_at  timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

create index if not exists chapter_quiz_passes_user_course_idx
  on public.chapter_quiz_passes (user_id, course_id);
