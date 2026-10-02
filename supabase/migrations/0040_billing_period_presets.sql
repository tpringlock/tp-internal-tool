-- Billing phase 2: period presets ("mẫu kỳ", feedback item 4b; plan
-- docs/ke-hoach-feedback-tp-2026-10.md section 2.3).
--
-- A preset = start day (1-28) + length in months (1, 3, 6, 12). With the
-- billing month M (the month the period ends in):
--   start day 1  -> 01 of month M-(months-1) .. last day of M
--                   ("Tháng dương lịch" 09/2026 = 01/09 - 30/09/2026)
--   start day d  -> d of month M-months .. (d-1) of M
--                   ("26->25" 08/2026 = 26/07 - 25/08/2026, = billingPeriod)
-- The app computes this (lib/billing/period-presets.ts); the DB only stores
-- the presets.
--
-- ADDITIVE ONLY: two new tables, no ALTER/UPDATE/DELETE on existing objects.
--   * The contract's default preset lives in a side table
--     (billing_contract_period_presets) instead of a column on
--     billing_contracts: assigning it would bump billing_contracts.updated_at
--     and change contracts_md5 of supabase/revert/check-real-contracts.sql
--     (same reason as billing_contract_hstt in 0038).
--   * Nothing new on billing_rent_calculations: upload_ids already points at
--     the exact month-file versions used (billing_misa_month_files.upload_id
--     is unique and immutable, 0035), so the calculation page reads month +
--     version from there.
--   * The HSTT period is unchanged: a calculation is a confirmable billing
--     period (period_month set) only when the chosen period equals the
--     contract's own period (period_start_day, 1 month, contract_start);
--     any other preset is saved like a custom range (period_month null, not
--     confirmable).
--
-- RLS: billing viewers read; only admins write presets (plan section 3);
-- billing users (accountant + admin) set a contract's default preset.

-- ---------------------------------------------------------------------------
-- billing_period_presets
-- ---------------------------------------------------------------------------
create table public.billing_period_presets (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (btrim(name) <> ''),
  start_day  smallint not null check (start_day between 1 and 28),
  months     smallint not null check (months in (1, 3, 6, 12)),
  sort_order integer not null default 0,
  -- Inactive presets are hidden from the pickers but kept for contracts
  -- that still point at them.
  active     boolean not null default true,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (start_day, months)
);

create trigger billing_period_presets_set_updated_at
  before update on public.billing_period_presets
  for each row execute function public.set_updated_at();

insert into public.billing_period_presets (name, start_day, months, sort_order) values
  ('26→25 (1 tháng)', 26, 1, 10),
  ('Tháng dương lịch', 1, 1, 20);

-- ---------------------------------------------------------------------------
-- billing_contract_period_presets: default preset of a contract (1:1, optional)
-- ---------------------------------------------------------------------------
create table public.billing_contract_period_presets (
  contract_id uuid primary key references public.billing_contracts (id) on delete cascade,
  -- restrict: a preset some contract uses can't be deleted, only set
  -- inactive (the app says how many contracts use it).
  preset_id   uuid not null references public.billing_period_presets (id) on delete restrict,
  updated_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index billing_contract_period_presets_preset_idx
  on public.billing_contract_period_presets (preset_id);

create trigger billing_contract_period_presets_set_updated_at
  before update on public.billing_contract_period_presets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.billing_period_presets enable row level security;

drop policy if exists billing_period_presets_select on public.billing_period_presets;
create policy billing_period_presets_select on public.billing_period_presets
  for select to authenticated using ((select private.is_billing_viewer()));

drop policy if exists billing_period_presets_insert on public.billing_period_presets;
create policy billing_period_presets_insert on public.billing_period_presets
  for insert to authenticated with check ((select private.is_admin()));

drop policy if exists billing_period_presets_update on public.billing_period_presets;
create policy billing_period_presets_update on public.billing_period_presets
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists billing_period_presets_delete on public.billing_period_presets;
create policy billing_period_presets_delete on public.billing_period_presets
  for delete to authenticated using ((select private.is_admin()));

alter table public.billing_contract_period_presets enable row level security;

drop policy if exists billing_contract_period_presets_select on public.billing_contract_period_presets;
create policy billing_contract_period_presets_select on public.billing_contract_period_presets
  for select to authenticated using ((select private.is_billing_viewer()));

drop policy if exists billing_contract_period_presets_insert on public.billing_contract_period_presets;
create policy billing_contract_period_presets_insert on public.billing_contract_period_presets
  for insert to authenticated with check ((select private.is_billing_user()));

drop policy if exists billing_contract_period_presets_update on public.billing_contract_period_presets;
create policy billing_contract_period_presets_update on public.billing_contract_period_presets
  for update to authenticated
  using ((select private.is_billing_user()))
  with check ((select private.is_billing_user()));

drop policy if exists billing_contract_period_presets_delete on public.billing_contract_period_presets;
create policy billing_contract_period_presets_delete on public.billing_contract_period_presets
  for delete to authenticated using ((select private.is_billing_user()));
