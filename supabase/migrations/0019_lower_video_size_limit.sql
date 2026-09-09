-- Lower the academy bucket's per-object size limit to 50 MB. The app-level
-- MAX_VIDEO_SIZE (lib/academy/constants.ts) mirrors this; the bucket limit is
-- what actually inspects the bytes, since the browser PUTs straight to storage
-- with a pre-minted token. Other objects in this bucket (PDFs, images) already
-- max out well under 50 MB; existing larger videos are unaffected (the limit
-- applies to new writes only).
-- NOTE: the project-wide "Upload file size limit" in the Supabase dashboard
-- (Storage settings) also caps uploads and must be at least 50 MB.
update storage.buckets
  set file_size_limit = 52428800  -- 50 MiB
  where id = 'academy';
