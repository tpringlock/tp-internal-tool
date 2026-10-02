-- READ-ONLY backup of the HSTT tables (0038) and period presets (0040), as
-- one JSON row. Only valid once 0038 and 0040 are applied. Holds real data
-- (Bên A / Bên B, bank accounts, tax codes, period inputs): keep the output
-- OUTSIDE the repo:
--   npx supabase db query --linked -f supabase/revert/backup-billing-hstt.sql > C:\Users\Admin\tp-backups\billing-hstt-<YYYYMMDD-HHMM>.json
select jsonb_build_object(
  'taken_at', now(),
  'company_profile', (select jsonb_agg(to_jsonb(t)) from public.company_profile t),
  'billing_customers', (select jsonb_agg(to_jsonb(t)) from public.billing_customers t),
  'billing_contract_hstt', (select jsonb_agg(to_jsonb(t)) from public.billing_contract_hstt t),
  'billing_transport_prices', (select jsonb_agg(to_jsonb(t)) from public.billing_transport_prices t),
  'billing_contract_advances', (select jsonb_agg(to_jsonb(t)) from public.billing_contract_advances t),
  'billing_period_inputs', (select jsonb_agg(to_jsonb(t)) from public.billing_period_inputs t),
  'billing_period_transport', (select jsonb_agg(to_jsonb(t)) from public.billing_period_transport t),
  'billing_period_deductions', (select jsonb_agg(to_jsonb(t)) from public.billing_period_deductions t),
  'billing_period_presets', (select jsonb_agg(to_jsonb(t)) from public.billing_period_presets t),
  'billing_contract_period_presets', (select jsonb_agg(to_jsonb(t)) from public.billing_contract_period_presets t)
) as backup;
