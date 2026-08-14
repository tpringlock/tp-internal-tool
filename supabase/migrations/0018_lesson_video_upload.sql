-- Self-hosted lesson videos.
-- Lessons already carry an optional embedded video (YouTube/Vimeo) via
-- video_url + video_provider. This adds a third provider, 'self_hosted', where
-- the video file lives in the private `academy` bucket (path convention
-- videos/{courseId}/{lessonId}/{fileId}.{ext}) and is streamed to the browser
-- via a short-lived signed URL. A lesson has EITHER a link OR an uploaded file.

-- Allow 'self_hosted' alongside the existing providers. The original check
-- constraint was declared inline in 0005, so Postgres named it
-- lessons_video_provider_check.
alter table public.lessons
  drop constraint if exists lessons_video_provider_check;
alter table public.lessons
  add constraint lessons_video_provider_check
  check (video_provider in ('youtube', 'vimeo', 'self_hosted'));

-- Storage metadata for a self-hosted video. Null for link-based lessons.
alter table public.lessons
  add column if not exists video_storage_path text,
  add column if not exists video_file_name  text,
  add column if not exists video_file_size  bigint;

-- Raise the academy bucket's per-object size limit to accommodate videos
-- (1 GB). PDFs and images stay well under this.
-- NOTE: the project-wide "Upload file size limit" in the Supabase dashboard
-- (Storage settings) also caps uploads and must be raised to match.
update storage.buckets
  set file_size_limit = 1073741824  -- 1 GiB
  where id = 'academy';
