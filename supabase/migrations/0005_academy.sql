-- TP Academy: courses + lessons library (the portal's second app).
-- A course groups an ordered list of lessons; a lesson carries an optional
-- embedded video (YouTube/Vimeo) and any number of PDF attachments.
-- RLS lives in 0006_academy_rls.sql; the PDF storage bucket in 0007_academy_storage.sql.
--
-- Reuses the shared foundation: public.set_updated_at(), the profiles table,
-- and the private.is_admin() RLS helper (moved to `private` in 0004).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.course_status as enum ('draft', 'published');

-- ---------------------------------------------------------------------------
-- courses: a training course. Visible to everyone once published.
-- ---------------------------------------------------------------------------
create table public.courses (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  category     text,
  status       public.course_status not null default 'draft',
  published_at timestamptz,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index courses_status_idx on public.courses (status);
create index courses_category_idx on public.courses (category);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- lessons: ordered within a course. `position` sets display order; ties fall
-- back to created_at. No unique(course_id, position) constraint so admins can
-- reorder lessons with plain per-row updates (no swap-conflict headaches).
-- ---------------------------------------------------------------------------
create table public.lessons (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses (id) on delete cascade,
  title          text not null,
  description    text,
  video_url      text,
  video_provider text check (video_provider in ('youtube', 'vimeo')),
  position       integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index lessons_course_id_idx on public.lessons (course_id, position);

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- lesson_files: PDF attachments (0..n per lesson), stored in the private
-- `academy` bucket and streamed through a permission-checked route handler.
-- ---------------------------------------------------------------------------
create table public.lesson_files (
  id           uuid primary key default gen_random_uuid(),
  lesson_id    uuid not null references public.lessons (id) on delete cascade,
  storage_path text not null unique,
  file_name    text not null,
  file_size    bigint not null check (file_size > 0),
  mime_type    text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

create index lesson_files_lesson_id_idx on public.lesson_files (lesson_id);
