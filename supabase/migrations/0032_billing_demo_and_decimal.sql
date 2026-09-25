-- Billing: demo ("giả định") contracts + fractional amounts.
--
-- 1. Demo contracts. The Excel tool's assumed prices (sheet "DATA ĐƠN GIÁ")
--    are seeded as one demo contract per MISA warehouse, only to compare the
--    two systems (scripts/seed-gia-dinh.mts). They must never mix with real
--    contracts: flagged is_demo, hidden in the UI unless switched on, and a
--    calculation of a demo contract can never be confirmed (trigger below).
--    misa_kho becomes unique per (misa_kho, is_demo) so the real Viet Panel
--    contract and its demo twin can coexist.
--    Calculations carry a copy of the flag (set by the trigger from the
--    contract, not writable) so lists can filter without a join.
--
-- 2. total_amount becomes numeric(20,4). MISA has fractional quantities
--    (e.g. materials in kg), so the engine can return a fractional total.
--    The app rounds to 4 decimals before saving (drops float noise), never to
--    whole dong.

alter table public.billing_contracts
  add column if not exists is_demo boolean not null default false;

alter table public.billing_contracts
  drop constraint if exists billing_contracts_misa_kho_key;
alter table public.billing_contracts
  drop constraint if exists billing_contracts_misa_kho_is_demo_key;
alter table public.billing_contracts
  add constraint billing_contracts_misa_kho_is_demo_key unique (misa_kho, is_demo);

alter table public.billing_rent_calculations
  alter column total_amount type numeric(20, 4);

alter table public.billing_rent_calculations
  add column if not exists is_demo boolean not null default false;

create index if not exists billing_rent_calculations_demo_idx
  on public.billing_rent_calculations (is_demo, created_at desc);

-- Copy the contract's demo flag onto the calculation (never client-supplied)
-- and refuse to confirm a demo calculation.
create or replace function public.billing_calc_demo_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select coalesce(c.is_demo, false) into new.is_demo
    from public.billing_contracts c
    where c.id = new.contract_id;
    new.is_demo := coalesce(new.is_demo, false);
  else
    new.is_demo := old.is_demo;
  end if;

  if new.status = 'confirmed' and new.is_demo then
    raise exception 'Hợp đồng giả định: đơn giá chỉ để đối chiếu, không được xác nhận.';
  end if;
  return new;
end;
$$;

revoke execute on function public.billing_calc_demo_guard() from public, anon, authenticated;

drop trigger if exists billing_rent_calculations_demo_guard on public.billing_rent_calculations;
create trigger billing_rent_calculations_demo_guard
  before insert or update on public.billing_rent_calculations
  for each row execute function public.billing_calc_demo_guard();
