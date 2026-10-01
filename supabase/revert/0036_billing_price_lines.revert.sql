-- REVERT of 0036_billing_price_lines.sql. NOT a migration. Run by hand:
--   npx supabase db query --linked -f supabase/revert/0036_billing_price_lines.revert.sql
--
-- Requires 0037 to be reverted first (the old price tables must be writable
-- again, otherwise the price data would only exist in the tables dropped
-- here). Drops the flat price table, the import log and their RPCs, and the
-- misa_kho_name column. Contracts created by imports stay (they are normal
-- contracts). Imported files under `price-imports/` in the `billing` bucket
-- are NOT deleted; remove them from the Storage dashboard if wanted.

begin;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_contract_items'
      and policyname = 'billing_contract_items_insert'
  ) then
    raise exception 'Hãy chạy 0037_billing_gd1_cutover.revert.sql trước (bảng giá cũ vẫn đang bị khóa ghi).';
  end if;
  if exists (select 1 from public.billing_price_lines) then
    raise exception 'billing_price_lines vẫn còn dữ liệu. Hãy chạy 0037_billing_gd1_cutover.revert.sql trước.';
  end if;
end;
$$;

drop function if exists public.billing_import_price_lines(jsonb);
drop function if exists public.billing_save_price_lines(uuid, jsonb);
drop table if exists public.billing_price_imports;
drop table if exists public.billing_price_lines;
alter table public.billing_contracts drop column if exists misa_kho_name;

commit;
