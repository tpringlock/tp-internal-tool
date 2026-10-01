-- READ-ONLY backup of the billing tables that exist before phase 1 (and the
-- roles), as one JSON row. Run before each deployment step and keep the
-- output OUTSIDE the repo:
--   npx supabase db query --linked -f supabase/revert/backup-billing.sql > C:\Users\Admin\tp-backups\billing-<YYYYMMDD-HHMM>.json
-- After 0035/0036 are applied, also run backup-billing-gd1.sql.
-- (`supabase db dump` would need Docker, which is not installed.)
select jsonb_build_object(
  'taken_at', now(),
  'profiles_roles', (select jsonb_agg(jsonb_build_object('id', id, 'role', role, 'is_active', is_active)) from public.profiles),
  'billing_contracts', (select jsonb_agg(to_jsonb(t)) from public.billing_contracts t),
  'billing_contract_items', (select jsonb_agg(to_jsonb(t)) from public.billing_contract_items t),
  'billing_excluded_codes', (select jsonb_agg(to_jsonb(t)) from public.billing_excluded_codes t),
  'billing_excluded_ranges', (select jsonb_agg(to_jsonb(t)) from public.billing_excluded_ranges t),
  'billing_misa_uploads', (select jsonb_agg(to_jsonb(t)) from public.billing_misa_uploads t),
  'billing_rent_calculations', (select jsonb_agg(to_jsonb(t)) from public.billing_rent_calculations t)
) as backup;
