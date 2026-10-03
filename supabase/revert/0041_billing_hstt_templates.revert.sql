-- Revert 0041_billing_hstt_templates.sql (hand-written; NOT a migration).
--
-- Drops the template tables, the download log and their functions. Only
-- data created by GĐ4 is lost: contracts without a template row already use
-- the standard template, so HSTT downloads keep working after the app code
-- is rolled back.
--
-- The bucket is left in place when it still holds files: empty it first
-- (Dashboard → Storage → billing-templates) to drop it too.
-- After running: remove 0041 from supabase_migrations.schema_migrations.

begin;

drop table if exists public.billing_hstt_exports;
drop table if exists public.billing_contract_hstt_templates;
drop table if exists public.billing_hstt_template_versions;
drop table if exists public.billing_hstt_templates;

drop function if exists public.billing_add_hstt_template_version(uuid, text, jsonb, jsonb);
drop function if exists public.billing_contract_hstt_template_guard();
drop function if exists public.billing_hstt_template_guard();

delete from storage.buckets b
where b.id = 'billing-templates'
  and not exists (select 1 from storage.objects o where o.bucket_id = b.id);

commit;
