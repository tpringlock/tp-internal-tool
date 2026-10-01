-- Read-only fingerprint of REAL (non-demo) billing contracts, to compare
-- before/after seeding or reverting demo data.
--   npx supabase db query --linked -f supabase/revert/check-real-contracts.sql
-- Works whether or not the is_demo column exists (before/after 0032).
with real as (
  select c.*
  from public.billing_contracts c
  where not coalesce((to_jsonb(c) ->> 'is_demo')::boolean, false)
)
select
  (select count(*) from real) as real_contracts,
  (select count(*) from public.billing_contract_items i where i.contract_id in (select id from real)) as real_items,
  (select count(*) from public.billing_excluded_codes e where e.contract_id in (select id from real)) as real_excluded_codes,
  (select md5(coalesce(string_agg(concat_ws('|', id, code, customer_name, project_name, contract_no, misa_kho, period_start_day, contract_start, active, updated_at), E'\n' order by id), '')) from real) as contracts_md5,
  (select md5(coalesce(string_agg(concat_ws('|', i.id, i.contract_id, i.name, i.unit, i.unit_price, array_to_string(i.ma_hang, ','), i.sort_order, i.updated_at), E'\n' order by i.id), ''))
     from public.billing_contract_items i where i.contract_id in (select id from real)) as items_md5,
  (select md5(coalesce(string_agg(concat_ws('|', e.contract_id, e.ma_hang), E'\n' order by e.contract_id, e.ma_hang), ''))
     from public.billing_excluded_codes e where e.contract_id in (select id from real)) as excluded_md5,
  (select count(*) from public.billing_rent_calculations r where r.contract_id in (select id from real)) as real_calculations;
