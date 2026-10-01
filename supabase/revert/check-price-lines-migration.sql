-- READ-ONLY check of the 0037 price-data copy. Run right after 0037 (while
-- the old tables are frozen and still hold the original data):
--   npx supabase db query --linked -f supabase/revert/check-price-lines-migration.sql
--
-- Regroups billing_price_lines exactly like the app (rules in 0036: name =
-- coalesce(print_name, ten_vt, code), unit = coalesce(print_dvt, dvt), price 0
-- = not billed) and compares with the frozen billing_contract_items /
-- billing_excluded_codes. Expected: diff_count = 0, groups_with_two_prices = 0,
-- groups_with_two_units = 0, price_lines = old_codes + old_excluded.
-- real_price_lines_md5 is a fingerprint of the real (non-demo) price rows:
-- save it, and compare after deploying / after the first days of use.
with
new_priced as (
  select p.contract_id, coalesce(p.print_name, nullif(p.ten_vt, ''), p.ma_vt) as name,
         coalesce(p.print_dvt, nullif(p.dvt, '')) as unit,
         p.ma_vt, p.unit_price, p.sort_order
  from public.billing_price_lines p
  where p.unit_price > 0
),
new_ranked as (
  select contract_id, name, coalesce(unit, '') as unit, units, unit_price, max_price, codes,
         row_number() over (partition by contract_id order by first_sort, name) as pos
  from (
    select contract_id, name,
           (array_agg(unit order by sort_order) filter (where unit is not null))[1] as unit,
           count(distinct unit) as units,
           min(unit_price) as unit_price, max(unit_price) as max_price,
           array_agg(ma_vt order by sort_order) as codes, min(sort_order) as first_sort
    from new_priced group by contract_id, name
  ) g
),
old_ranked as (
  select i.contract_id, i.name, i.unit, i.unit_price, i.unit_price as max_price,
         array(select regexp_replace(btrim(c), '\s+', ' ', 'g') from unnest(i.ma_hang) as c) as codes,
         row_number() over (partition by i.contract_id order by i.sort_order, i.name) as pos
  from public.billing_contract_items i
  where i.unit_price > 0
),
new_excluded as (
  select contract_id, ma_vt from public.billing_price_lines where unit_price = 0
),
old_excluded as (
  select contract_id, regexp_replace(btrim(ma_hang), '\s+', ' ', 'g') as ma_vt
  from public.billing_excluded_codes
  union
  select i.contract_id, regexp_replace(btrim(c), '\s+', ' ', 'g')
  from public.billing_contract_items i, unnest(i.ma_hang) as c
  where i.unit_price = 0
),
diff as (
  (select 'chỉ có ở bảng cũ' as side, contract_id, name, unit, unit_price, codes, pos from old_ranked
   except select 'chỉ có ở bảng cũ', contract_id, name, unit, unit_price, codes, pos from new_ranked)
  union all
  (select 'chỉ có ở bảng mới', contract_id, name, unit, unit_price, codes, pos from new_ranked
   except select 'chỉ có ở bảng mới', contract_id, name, unit, unit_price, codes, pos from old_ranked)
  union all
  (select 'loại trừ: chỉ ở bảng cũ', contract_id, ma_vt, null::text, null::integer, null::text[], null::bigint from old_excluded
   except select 'loại trừ: chỉ ở bảng cũ', contract_id, ma_vt, null::text, null::integer, null::text[], null::bigint from new_excluded)
  union all
  (select 'loại trừ: chỉ ở bảng mới', contract_id, ma_vt, null::text, null::integer, null::text[], null::bigint from new_excluded
   except select 'loại trừ: chỉ ở bảng mới', contract_id, ma_vt, null::text, null::integer, null::text[], null::bigint from old_excluded)
),
real_contracts as (
  select id from public.billing_contracts where not is_demo
)
select
  (select count(*) from diff) as diff_count,
  (select count(*) from new_ranked where unit_price <> max_price) as groups_with_two_prices,
  (select count(*) from new_ranked where units > 1) as groups_with_two_units,
  (select count(*) from public.billing_price_lines) as price_lines,
  (select coalesce(sum(cardinality(ma_hang)), 0) from public.billing_contract_items) as old_codes,
  (select count(*) from public.billing_excluded_codes) as old_excluded,
  (select count(*) from public.billing_price_lines where contract_id in (select id from real_contracts)) as real_price_lines,
  (select md5(coalesce(string_agg(concat_ws('|', p.contract_id, p.ma_vt, p.ten_vt, p.dvt, p.unit_price,
                                            p.print_name, p.print_dvt, p.note, p.sort_order),
                                  E'\n' order by p.contract_id, p.ma_vt), ''))
     from public.billing_price_lines p where p.contract_id in (select id from real_contracts)) as real_price_lines_md5,
  (select jsonb_agg(to_jsonb(d)) from (select * from diff limit 50) d) as first_50_diffs;
