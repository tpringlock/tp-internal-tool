-- TP Academy: per-lesson learner notes + course-level PDF documents.
-- lesson_notes: one private note per (user, lesson), auto-saved from the lesson
-- viewer. course_files: PDF documents attached to a course (not a lesson),
-- surfaced via a "Documents" toggle beside Course Content. Both reuse the
-- private `academy` bucket (course_files) and shared conventions. RLS in 0013.

-- ---------------------------------------------------------------------------
-- lesson_notes: a learner's private note for a lesson. course_id is
-- denormalized (set from the lesson on write) to keep per-course queries cheap.
-- ---------------------------------------------------------------------------
create table if not exists public.lesson_notes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  lesson_id  uuid not null references public.lessons (id) on delete cascade,
  course_id  uuid not null references public.courses (id) on delete cascade,
  content    text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists lesson_notes_user_course_idx
  on public.lesson_notes (user_id, course_id);

create trigger lesson_notes_set_updated_at
  before update on public.lesson_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- course_files: PDF documents attached to a course (0..n), stored in the
-- private `academy` bucket and streamed through a permission-checked route.
-- Mirrors lesson_files but keyed on course.
-- ---------------------------------------------------------------------------
create table if not exists public.course_files (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses (id) on delete cascade,
  storage_path text not null unique,
  file_name    text not null,
  file_size    bigint not null check (file_size > 0),
  mime_type    text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

create index if not exists course_files_course_id_idx
  on public.course_files (course_id);
