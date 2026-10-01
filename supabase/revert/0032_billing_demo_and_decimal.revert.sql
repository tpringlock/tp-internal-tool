-- REVERT of 0032_billing_demo_and_decimal.sql. Run by hand, not a migration:
--   npx supabase db query --linked -f supabase/revert/0032_billing_demo_and_decimal.revert.sql
-- (Kept outside supabase/migrations/ so `db push` never applies it.)
--
-- Order: remove demo data -> drop trigger -> restore unique(misa_kho) ->
-- total_amount back to bigint (aborts if any fractional value remains) ->
-- drop is_demo -> forget 0032 in the migration history.
-- One transaction: any error rolls everything back.

begin;

-- 1. Demo data (calculations first: contracts are ON DELETE RESTRICT).
delete from public.billing_rent_calculations
where is_demo
   or contract_id in (select id from public.billing_contracts where is_demo);
-- Items, excluded codes and contract ranges cascade with the contract.
delete from public.billing_contracts where is_demo;

-- 2. Trigger + function.
drop trigger if exists billing_rent_calculations_demo_guard on public.billing_rent_calculations;
drop function if exists public.billing_calc_demo_guard();

-- 3. Unique misa_kho as in 0027 (fails if two real contracts share a kho).
alter table public.billing_contracts
  drop constraint if exists billing_contracts_misa_kho_is_demo_key;
alter table public.billing_contracts
  add constraint billing_contracts_misa_kho_key unique (misa_kho);

-- 4. total_amount back to bigint: stop if any value has decimals.
do $$
declare
  n integer;
begin
  select count(*) into n
  from public.billing_rent_calculations
  where total_amount <> trunc(total_amount);
  if n > 0 then
    raise exception 'Revert dừng: % bản tính có total_amount lẻ, không đổi về bigint được.', n;
  end if;
end;
$$;
alter table public.billing_rent_calculations
  alter column total_amount type bigint using total_amount::bigint;

-- 5. is_demo columns (the calculations index goes with its column).
drop index if exists public.billing_rent_calculations_demo_idx;
alter table public.billing_rent_calculations drop column if exists is_demo;
alter table public.billing_contracts drop column if exists is_demo;

-- 6. Migration history: 0032 no longer applied.
delete from supabase_migrations.schema_migrations where version = '0032';

commit;
