-- Private storage bucket for document PDFs.
-- No public access and no authenticated storage policies: every read/write
-- goes through server-side route handlers that check permission (via the
-- documents RLS) and log activity before streaming the file. Those handlers
-- use the service role, which bypasses storage RLS.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
