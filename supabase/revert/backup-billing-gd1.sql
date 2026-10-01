-- READ-ONLY backup of the phase-1 billing tables (0035, 0036), as one JSON
-- row. Only valid once 0035 and 0036 are applied. Keep the output OUTSIDE the repo:
--   npx supabase db query --linked -f supabase/revert/backup-billing-gd1.sql > C:\Users\Admin\tp-backups\billing-gd1-<YYYYMMDD-HHMM>.json
select jsonb_build_object(
  'taken_at', now(),
  'billing_misa_month_files', (select jsonb_agg(to_jsonb(t)) from public.billing_misa_month_files t),
  'billing_price_lines', (select jsonb_agg(to_jsonb(t)) from public.billing_price_lines t),
  'billing_price_imports', (select jsonb_agg(to_jsonb(t)) from public.billing_price_imports t)
) as backup;
