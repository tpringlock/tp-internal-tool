-- Private storage bucket for Academy lesson PDFs.
-- Mirrors the `documents` bucket (0003_storage.sql): no public access and no
-- authenticated storage policies. Reads go through a server route handler that
-- checks permission (via lesson_files RLS) and streams with the service role,
-- which bypasses storage RLS. Path convention: {courseId}/{lessonId}/{fileId}.pdf

insert into storage.buckets (id, name, public)
values ('academy', 'academy', false)
on conflict (id) do nothing;
