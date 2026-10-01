-- REVERT of 0035_billing_month_files.sql. NOT a migration. Run by hand:
--   npx supabase db query --linked -f supabase/revert/0035_billing_month_files.revert.sql
--
-- Drops only the month/version index. Every uploaded file stays in
-- billing_misa_uploads and Storage, and calculations keep their upload_ids,
-- so nothing is lost: the old upload list shows all files again.
-- If 0037 is still applied, revert it first.

begin;

drop function if exists public.billing_add_month_file(jsonb, integer, jsonb);
drop table if exists public.billing_misa_month_files; -- drops its triggers too
drop function if exists public.billing_month_file_guard();
drop function if exists public.billing_month_file_delete_guard();
drop function if exists public.billing_month_file_after_delete();

commit;
