-- TP Academy v2: instructor + thumbnail on courses, a chapters grouping layer
-- between courses and lessons, and self-service enrollment + per-lesson progress.
-- Additive to 0005_academy.sql (which is already applied). RLS in 0009.

-- ---------------------------------------------------------------------------
-- courses: free-text instructor + optional thumbnail (stored in the `academy`
-- bucket, streamed through a route handler; path only is kept here).
-- ---------------------------------------------------------------------------
alter table public.courses add column if not exists instructor    text;
alter table public.courses add column if not exists thumbnail_path text;

-- ---------------------------------------------------------------------------
-- chapters: ordered groups of lessons within a course.
-- ---------------------------------------------------------------------------
create table if not exists public.chapters (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  title      text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chapters_course_id_idx on public.chapters (course_id, position);

create trigger chapters_set_updated_at
  before update on public.chapters
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- lessons now belong to a chapter. course_id is kept (denormalized, set from
-- the chapter on insert) so existing lesson queries keep working. `position`
-- now orders lessons within their chapter.
-- ---------------------------------------------------------------------------
alter table public.lessons
  add column if not exists chapter_id uuid references public.chapters (id) on delete cascade;

-- Backfill: give every course that already has lessons a default "Chapter 1"
-- and attach its lessons to it.
insert into public.chapters (course_id, title, position)
  select c.id, 'Chapter 1', 0
  from public.courses c
  where exists (select 1 from public.lessons l where l.course_id = c.id)
    and not exists (select 1 from public.chapters ch where ch.course_id = c.id);

update public.lessons l
  set chapter_id = (
    select ch.id from public.chapters ch
    where ch.course_id = l.course_id
    order by ch.position
    limit 1
  )
  where l.chapter_id is null;

-- Every lesson must live in a chapter going forward.
alter table public.lessons alter column chapter_id set not null;

create index if not exists lessons_chapter_id_idx on public.lessons (chapter_id, position);

-- ---------------------------------------------------------------------------
-- course_enrollments: a user "joins" a course. completed_at is set when every
-- lesson in the course has been marked done (recomputed in the app layer).
-- ---------------------------------------------------------------------------
create table if not exists public.course_enrollments (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  enrolled_at  timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, course_id)
);

create index if not exists course_enrollments_course_idx on public.course_enrollments (course_id);

-- ---------------------------------------------------------------------------
-- lesson_progress: one row per (user, lesson) marked complete. course_id is
-- denormalized so per-course completion counts stay a single cheap query.
-- ---------------------------------------------------------------------------
create table if not exists public.lesson_progress (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  lesson_id    uuid not null references public.lessons (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists lesson_progress_user_course_idx
  on public.lesson_progress (user_id, course_id);
