-- Billing phase 1 CUTOVER. Apply right before deploying the phase-1 app code,
-- outside working hours (checklist: docs/billing-gd1-trien-khai.md).
--
-- The WHOLE file is ONE statement (a single DO block, the freeze runs via
-- EXECUTE inside it), so it is all-or-nothing however it is run (db push,
-- db query, SQL editor): any error rolls back every step below.
--
-- 1. Backfill month files: every existing upload that covers exactly one
--    calendar month becomes a version of that month (ordered by upload time,
--    the newest is active). Other uploads (e.g. 26 -> 25) stay as legacy
--    files: still listed and downloadable, never picked automatically.
-- 2. Copy the price data to billing_price_lines (0036), losslessly:
--      billing_contract_items: one row per (line, code). The old line name and
--        unit go to print_name / print_dvt (what the HSTT prints); ten_vt /
--        dvt (MISA values) stay '' until the app fills them from the month
--        files. Regrouping by printed name therefore rebuilds exactly the same
--        ContractConfig (lines, names, units, prices, code order, line order)
--        -> the same amounts.
--      billing_excluded_codes: one row per code with unit_price 0.
--    Codes are normalised like the parser (trim + single spaces); if that
--    makes two codes collide, the unique constraint aborts the migration.
-- 3. Self-check: row counts and a full regroup-and-compare against the old
--    tables, using the 0036 rules. Any difference raises.
-- 4. Freeze the old tables: drop their write policies and revoke the old
--    save RPC, so the app (or an old browser tab) cannot write to them any
--    more. Data and SELECT policies stay (rollback source).
--
-- Rollback: supabase/revert/0037_billing_gd1_cutover.revert.sql.
-- Read-only verification afterwards: supabase/revert/check-price-lines-migration.sql,
-- supabase/revert/check-month-files.sql, supabase/revert/list-month-files.sql.

do $$
declare
  v_codes    integer;
  v_excluded integer;
  v_zero     integer;
  v_lines    integer;
  v_months   integer;
  v_diff     integer;
  v_units    integer;
begin
  -- -------------------------------------------------------------------------
  -- Preconditions: never run twice, never on top of new data.
  -- -------------------------------------------------------------------------
  if exists (select 1 from public.billing_price_lines) then
    raise exception '0037: billing_price_lines đã có dữ liệu. Dừng để không chép trùng.';
  end if;
  if exists (select 1 from public.billing_misa_month_files) then
    raise exception '0037: billing_misa_month_files đã có dữ liệu. Dừng để không backfill trùng.';
  end if;

  -- -------------------------------------------------------------------------
  -- 1. Month files
  -- -------------------------------------------------------------------------
  -- A superseded version is stamped with the uploader/time of the next one.
  -- (Set here, not by a later UPDATE: the 0035 guard trigger keeps the
  -- superseded_* columns unchanged on updates that don't change status.)
  insert into public.billing_misa_month_files
    (upload_id, month, version, status, created_by, created_at, superseded_by, superseded_at)
  select
    u.id,
    u.month,
    row_number() over w,
    case when row_number() over w = count(*) over (partition by u.month)
         then 'active' else 'superseded' end,
    u.uploaded_by,
    u.created_at,
    lead(u.uploaded_by) over w,
    lead(u.created_at) over w
  from (
    select x.*, to_char(x.file_from, 'YYYY-MM') as month
    from public.billing_misa_uploads x
    where x.file_from = date_trunc('month', x.file_from)::date
      and x.file_to = (date_trunc('month', x.file_from) + interval '1 month - 1 day')::date
  ) u
  window w as (partition by u.month order by u.created_at, u.id);

  -- -------------------------------------------------------------------------
  -- 2. Price lines
  -- -------------------------------------------------------------------------
  -- sort_order = old sort_order * 1000 + position of the code in the line:
  -- lines keep their order (ties still broken by name), codes keep theirs.
  insert into public.billing_price_lines
    (contract_id, ma_vt, ten_vt, dvt, unit_price, print_name, print_dvt, note, sort_order, created_at)
  select
    i.contract_id,
    regexp_replace(btrim(c.code), '\s+', ' ', 'g'),
    '',
    '',
    i.unit_price,
    case when btrim(i.name) = '' then null else i.name end,
    case when btrim(i.unit) = '' then null else i.unit end,
    '',
    i.sort_order * 1000 + c.ord::integer,
    i.created_at
  from public.billing_contract_items i
  cross join lateral unnest(i.ma_hang) with ordinality as c(code, ord);

  -- Plain insert, no ON CONFLICT: a code that is both priced and excluded
  -- would be a data error -> abort instead of silently picking one.
  insert into public.billing_price_lines
    (contract_id, ma_vt, ten_vt, dvt, unit_price, print_name, print_dvt, note, sort_order, created_at)
  select
    e.contract_id,
    regexp_replace(btrim(e.ma_hang), '\s+', ' ', 'g'),
    '',
    '',
    0,
    null,
    null,
    'Không tính tiền',
    999000 + (row_number() over (partition by e.contract_id order by e.ma_hang))::integer,
    e.created_at
  from public.billing_excluded_codes e;

  -- -------------------------------------------------------------------------
  -- 3. Self-check
  -- -------------------------------------------------------------------------
  select coalesce(sum(cardinality(ma_hang)), 0) into v_codes from public.billing_contract_items;
  select count(*) into v_excluded from public.billing_excluded_codes;
  select count(*) into v_lines from public.billing_price_lines;
  select count(*) into v_months from public.billing_misa_month_files;
  if v_lines <> v_codes + v_excluded then
    raise exception '0037: số dòng giá % ≠ % mã trong dòng cũ + % mã loại trừ.', v_lines, v_codes, v_excluded;
  end if;

  -- Old priced lines with price 0 (only demo data had them, removed on
  -- 2026-10-01) become "not billed" under the new rule. Reported, not an error.
  select count(*) into v_zero from public.billing_contract_items where unit_price = 0;
  if v_zero > 0 then
    raise notice '0037: % dòng giá cũ có đơn giá 0 -> chuyển thành mã không tính tiền.', v_zero;
  end if;

  -- Regroup the new rows exactly like lib/billing/price-lines.ts (rules in
  -- 0036) and compare with the old tables: same lines (name, unit, price,
  -- codes in order, line position) and the same excluded codes, per contract.
  with
  new_priced as (
    select
      p.contract_id,
      coalesce(p.print_name, nullif(p.ten_vt, ''), p.ma_vt) as name,
      coalesce(p.print_dvt, nullif(p.dvt, '')) as unit,
      p.ma_vt, p.unit_price, p.sort_order
    from public.billing_price_lines p
    where p.unit_price > 0
  ),
  new_lines as (
    select
      contract_id,
      name,
      (array_agg(unit order by sort_order) filter (where unit is not null))[1] as unit,
      count(distinct unit) as units,
      min(unit_price) as unit_price,
      max(unit_price) as max_price,
      array_agg(ma_vt order by sort_order) as codes,
      min(sort_order) as first_sort
    from new_priced
    group by contract_id, name
  ),
  new_ranked as (
    select contract_id, name, coalesce(unit, '') as unit, unit_price, max_price, codes,
           row_number() over (partition by contract_id order by first_sort, name) as pos
    from new_lines
  ),
  old_ranked as (
    select
      i.contract_id, i.name, i.unit, i.unit_price,
      i.unit_price as max_price,
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
    (select 'line' as k, contract_id, name, unit, unit_price, max_price, codes, pos from old_ranked
     except
     select 'line', contract_id, name, unit, unit_price, max_price, codes, pos from new_ranked)
    union all
    (select 'line', contract_id, name, unit, unit_price, max_price, codes, pos from new_ranked
     except
     select 'line', contract_id, name, unit, unit_price, max_price, codes, pos from old_ranked)
    union all
    (select 'excl', contract_id, ma_vt, null::text, null::integer, null::integer, null::text[], null::bigint from old_excluded
     except
     select 'excl', contract_id, ma_vt, null::text, null::integer, null::integer, null::text[], null::bigint from new_excluded)
    union all
    (select 'excl', contract_id, ma_vt, null::text, null::integer, null::integer, null::text[], null::bigint from new_excluded
     except
     select 'excl', contract_id, ma_vt, null::text, null::integer, null::integer, null::text[], null::bigint from old_excluded)
  )
  select
    (select count(*) from diff),
    (select count(*) from new_lines where units > 1)
  into v_diff, v_units;

  if v_diff > 0 or v_units > 0 then
    raise exception '0037: dữ liệu sau khi chuyển lệch % dòng (% nhóm có 2 ĐVT) so với bảng cũ. Đã hủy toàn bộ migration.',
      v_diff, v_units;
  end if;

  -- -------------------------------------------------------------------------
  -- 4. Freeze the old price tables (data and SELECT policies kept).
  --    Inside the DO block so it is part of the same all-or-nothing unit.
  -- -------------------------------------------------------------------------
  execute 'drop policy if exists billing_contract_items_insert on public.billing_contract_items';
  execute 'drop policy if exists billing_contract_items_update on public.billing_contract_items';
  execute 'drop policy if exists billing_contract_items_delete on public.billing_contract_items';
  execute 'drop policy if exists billing_excluded_codes_insert on public.billing_excluded_codes';
  execute 'drop policy if exists billing_excluded_codes_delete on public.billing_excluded_codes';
  execute 'revoke execute on function public.billing_save_contract_config(uuid, jsonb, text[]) from authenticated';
  execute 'comment on table public.billing_contract_items is '
       || quote_literal('FROZEN since 0037: replaced by billing_price_lines. Kept read-only as the rollback source.');
  execute 'comment on table public.billing_excluded_codes is '
       || quote_literal('FROZEN since 0037: replaced by billing_price_lines (unit_price = 0). Kept read-only as the rollback source.');

  raise notice '0037: OK. % dòng giá (% mã có giá + % mã loại trừ), % phiên bản file tháng. Bảng giá cũ đã khóa ghi.',
    v_lines, v_codes, v_excluded, v_months;
end;
$$;
