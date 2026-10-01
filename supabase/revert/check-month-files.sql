-- READ-ONLY check of the month files after 0037 (backfill):
--   npx supabase db query --linked -f supabase/revert/check-month-files.sql
--
-- Expected: months_without_active = 0, months_with_two_active = 0,
-- not_full_month = 0. `months` lists every month with its versions;
-- `legacy_uploads` lists uploads that are not a full month (kept as legacy
-- files, never picked automatically).
with
m as (
  select f.month, f.version, f.status, f.upload_id, u.file_name, u.file_from, u.file_to, u.created_at
  from public.billing_misa_month_files f
  join public.billing_misa_uploads u on u.id = f.upload_id
)
select
  (select count(*) from public.billing_misa_uploads) as uploads,
  (select count(*) from public.billing_misa_month_files) as month_versions,
  (select count(distinct month) from m) as months,
  (select count(*) from (select month from m group by month
                         having count(*) filter (where status = 'active') = 0) x) as months_without_active,
  (select count(*) from (select month from m group by month
                         having count(*) filter (where status = 'active') > 1) x) as months_with_two_active,
  (select count(*) from m
   where file_from <> to_date(month || '-01', 'YYYY-MM-DD')
      or file_to <> (to_date(month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date) as not_full_month,
  (select jsonb_agg(jsonb_build_object(
            'month', month, 'version', version, 'status', status,
            'file', file_name, 'uploaded', created_at)
          order by month, version) from m) as months_detail,
  (select jsonb_agg(jsonb_build_object(
            'file', u.file_name, 'from', u.file_from, 'to', u.file_to, 'uploaded', u.created_at)
          order by u.created_at)
     from public.billing_misa_uploads u
     where not exists (select 1 from public.billing_misa_month_files f where f.upload_id = u.id)) as legacy_uploads;
