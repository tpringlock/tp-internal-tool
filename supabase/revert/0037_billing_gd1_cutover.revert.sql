-- REVERT of 0037_billing_gd1_cutover.sql. NOT a migration (lives outside
-- migrations/ so `db push` never runs it). Run by hand, only together with
-- redeploying the pre-phase-1 app code:
--   npx supabase db query --linked -f supabase/revert/0037_billing_gd1_cutover.revert.sql
--
-- What it does, in one transaction:
--   1. Snapshots the frozen old tables into private.*_0037_snapshot (in case
--      the original rows are needed again).
--   2. Rebuilds billing_contract_items / billing_excluded_codes FROM
--      billing_price_lines, so edits and imports made after the cutover are
--      kept. Same rules as the app (0036): line name =
--      coalesce(print_name, ten_vt, code), unit = coalesce(print_dvt, dvt);
--      price 0 -> excluded code. Stops if a group has two prices or two units.
--   3. Restores the write policies of 0028 and the old save RPC grant.
--   4. Empties billing_price_lines and billing_misa_month_files so 0037 can
--      be applied again later. Uploads (billing_misa_uploads + Storage),
--      contracts, calculations and the import log are NOT touched.
--
-- Afterwards 0033-0036 can stay (additive) or be reverted with their files.

begin;

-- 1. Snapshot ---------------------------------------------------------------
drop table if exists private.billing_contract_items_0037_snapshot;
drop table if exists private.billing_excluded_codes_0037_snapshot;
create table private.billing_contract_items_0037_snapshot as
  select * from public.billing_contract_items;
create table private.billing_excluded_codes_0037_snapshot as
  select * from public.billing_excluded_codes;

-- 2. Rebuild ----------------------------------------------------------------
do $$
declare
  v_conflicts text;
begin
  select string_agg(format('%s / "%s"', c.misa_kho, g.name), '; ')
  into v_conflicts
  from (
    select p.contract_id, coalesce(p.print_name, nullif(p.ten_vt, ''), p.ma_vt) as name
    from public.billing_price_lines p
    where p.unit_price > 0
    group by 1, 2
    having min(p.unit_price) <> max(p.unit_price)
        or count(distinct coalesce(p.print_dvt, nullif(p.dvt, ''))) > 1
  ) g
  join public.billing_contracts c on c.id = g.contract_id;
  if v_conflicts is not null then
    raise exception 'Không gộp được: các dòng cùng tên in có đơn giá hoặc ĐVT khác nhau: %', v_conflicts;
  end if;
end;
$$;

delete from public.billing_contract_items;
delete from public.billing_excluded_codes;

insert into public.billing_contract_items (contract_id, name, unit, unit_price, ma_hang, sort_order)
select
  contract_id,
  name,
  coalesce(unit, ''),
  unit_price,
  codes,
  (row_number() over (partition by contract_id order by first_sort, name))::integer
from (
  select
    p.contract_id,
    coalesce(p.print_name, nullif(p.ten_vt, ''), p.ma_vt) as name,
    (array_agg(coalesce(p.print_dvt, nullif(p.dvt, '')) order by p.sort_order)
       filter (where coalesce(p.print_dvt, nullif(p.dvt, '')) is not null))[1] as unit,
    min(p.unit_price) as unit_price,
    array_agg(p.ma_vt order by p.sort_order) as codes,
    min(p.sort_order) as first_sort
  from public.billing_price_lines p
  where p.unit_price > 0
  group by 1, 2
) g;

insert into public.billing_excluded_codes (contract_id, ma_hang)
select contract_id, ma_vt from public.billing_price_lines where unit_price = 0;

-- 3. Restore write access (same policies as 0028) ---------------------------
drop policy if exists billing_contract_items_insert on public.billing_contract_items;
create policy billing_contract_items_insert on public.billing_contract_items
  for insert to authenticated with check ((select private.is_billing_user()));

drop policy if exists billing_contract_items_update on public.billing_contract_items;
create policy billing_contract_items_update on public.billing_contract_items
  for update to authenticated
  using ((select private.is_billing_user()))
  with check ((select private.is_billing_user()));

drop policy if exists billing_contract_items_delete on public.billing_contract_items;
create policy billing_contract_items_delete on public.billing_contract_items
  for delete to authenticated using ((select private.is_billing_user()));

drop policy if exists billing_excluded_codes_insert on public.billing_excluded_codes;
create policy billing_excluded_codes_insert on public.billing_excluded_codes
  for insert to authenticated with check ((select private.is_billing_user()));

drop policy if exists billing_excluded_codes_delete on public.billing_excluded_codes;
create policy billing_excluded_codes_delete on public.billing_excluded_codes
  for delete to authenticated using ((select private.is_billing_user()));

grant execute on function public.billing_save_contract_config(uuid, jsonb, text[]) to authenticated;

comment on table public.billing_contract_items is null;
comment on table public.billing_excluded_codes is null;

-- 4. Empty the new tables so 0037 can run again ------------------------------
-- TRUNCATE skips the row-level delete guards on purpose: the files and
-- calculations themselves are untouched, only the month/version index goes.
truncate public.billing_price_lines;
truncate public.billing_misa_month_files;

commit;
