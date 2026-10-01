-- Billing phase 3: data for the HSTT export (4 sheets: ĐNTT, ĐCCN, Giá trị,
-- Khối lượng). Plan: docs/hstt/hstt-export-plan.md, section 2.
--
-- ADDITIVE ONLY: new tables, no ALTER/UPDATE/DELETE on existing objects.
--   * The contract's HSTT fields live in a 1:1 side table
--     (billing_contract_hstt) instead of new columns on billing_contracts:
--     filling them would bump billing_contracts.updated_at and change the
--     contracts_md5 of supabase/revert/check-real-contracts.sql.
--   * Per-period inputs (transport trips, deductions, payment) live in their
--     own tables keyed by (contract, period start), NOT on
--     billing_rent_calculations: a confirmed calculation is immutable
--     (billing_calc_guard), and the inputs must survive a void + recalculate.
--   * Exempt days (Tết) need nothing new: billing_excluded_ranges (0027/0031)
--     already feeds the engine and is snapshotted on each calculation.
--
-- Money is integer VND (bigint), like the price table. Account numbers and tax
-- codes are text (leading zeros, never summed).
--
-- RLS: billing viewers read everything; accountants/admins write, except the
-- company profile (Bên B), which only admins edit.
--
-- Rollback: supabase/revert/0038_billing_hstt.revert.sql.

-- ---------------------------------------------------------------------------
-- company_profile: Bên B (TP). Exactly one row (id = 1), created by the seed
-- migration; no insert/delete policy.
-- ---------------------------------------------------------------------------
create table public.company_profile (
  id            smallint primary key default 1 check (id = 1),
  ten_in_hoa    text not null default '',  -- "CÔNG TY CỔ PHẦN TẬP ĐOÀN THIẾT BỊ XÂY DỰNG TP"
  ten_2_dong    text not null default '',  -- ĐNTT header, with a line break
  ten_thuong    text not null default '',  -- inside sentences
  ten_thu_huong text not null default '',  -- ĐNTT "Đơn vị thụ hưởng"
  dia_chi       text not null default '',
  dia_chi_ngan  text not null default '',  -- ĐNTT
  dien_thoai    text not null default '',
  so_tk         text not null default '',
  ngan_hang     text not null default '',  -- bank + branch, printed after "Tại "
  mst           text not null default '',
  dai_dien      text not null default '',
  chuc_vu       text not null default '',
  noi_lap       text not null default '',  -- "Hà Nội"
  updated_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger company_profile_set_updated_at
  before update on public.company_profile
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- billing_customers: Bên A. One customer can have several contracts.
-- ---------------------------------------------------------------------------
create table public.billing_customers (
  id          uuid primary key default gen_random_uuid(),
  ten_in_hoa  text not null check (btrim(ten_in_hoa) <> ''),
  ten_thuong  text not null default '',  -- in the "Căn cứ hợp đồng" sentence
  ten_rut_gon text not null default '',  -- file name: "HSTT T08.2026 - Việt Panel - TP.xlsx"
  dia_chi     text not null default '',
  dien_thoai  text not null default '',
  so_tk       text not null default '',
  ngan_hang   text not null default '',  -- printed after "Tại "
  mst         text not null default '',
  dai_dien    text not null default '',
  chuc_vu     text not null default '',
  note        text not null default '',
  created_by  uuid references public.profiles (id),
  updated_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index billing_customers_mst_key
  on public.billing_customers (mst) where mst <> '';

create trigger billing_customers_set_updated_at
  before update on public.billing_customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- billing_contract_hstt: HSTT fields of a contract (1:1, optional).
-- ---------------------------------------------------------------------------
create table public.billing_contract_hstt (
  contract_id        uuid primary key references public.billing_contracts (id) on delete cascade,
  customer_id        uuid references public.billing_customers (id) on delete restrict,
  contract_type      text not null default 'Hợp đồng kinh tế',
  contract_date      date,
  du_an_ten          text not null default '',  -- "Senci"
  du_an_dia_chi      text not null default '',  -- "KCN Phúc Điền, Hải Dương"
  -- null = generated: "- Căn cứ {type} số {no} ký ngày {date} giữa {A} và {B} về việc ..."
  can_cu_override    text check (can_cu_override is null or btrim(can_cu_override) <> ''),
  vat_percent        numeric(5, 2) not null default 8 check (vat_percent between 0 and 100),
  -- One note for the whole ĐCCN "Đã tạm ứng" line (e.g. "Tạm ứng PL02+03+04").
  advances_note      text not null default '',
  -- Debt (Bên A owes Bên B) at the END of the last month done by hand, e.g.
  -- 2906447532 at the end of 2026-08: the opening debt of the first web month.
  opening_debt       bigint,
  opening_debt_month text check (opening_debt_month is null or opening_debt_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  updated_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check ((opening_debt is null) = (opening_debt_month is null))
);

create index billing_contract_hstt_customer_idx
  on public.billing_contract_hstt (customer_id);

create trigger billing_contract_hstt_set_updated_at
  before update on public.billing_contract_hstt
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- billing_transport_prices: transport price list of a contract (Giá trị,
-- section II). One row = one vehicle type = one HSTT line.
-- ---------------------------------------------------------------------------
create table public.billing_transport_prices (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.billing_contracts (id) on delete cascade,
  name        text not null check (btrim(name) <> ''),  -- "Vận chuyển xe sơ mi 30 tấn"
  unit        text not null default 'Chuyến',
  unit_price  bigint not null check (unit_price >= 0),
  sort_order  integer not null default 0,
  active      boolean not null default true,
  updated_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (contract_id, name)
);

create index billing_transport_prices_contract_idx
  on public.billing_transport_prices (contract_id, sort_order);

create trigger billing_transport_prices_set_updated_at
  before update on public.billing_transport_prices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- billing_contract_advances: advances paid by Bên A ("Đã tạm ứng", ĐCCN
-- line 1, display only). The HSTT writes their sum as =a+b+...; the line's
-- note is billing_contract_hstt.advances_note.
-- ---------------------------------------------------------------------------
create table public.billing_contract_advances (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.billing_contracts (id) on delete cascade,
  amount      bigint not null check (amount <> 0),
  paid_on     date,
  sort_order  integer not null default 0,
  updated_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index billing_contract_advances_contract_idx
  on public.billing_contract_advances (contract_id, sort_order);

create trigger billing_contract_advances_set_updated_at
  before update on public.billing_contract_advances
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- billing_period_inputs: what the accountant types per period. Keyed like
-- the confirmed calculation (contract_id, period_from).
--   paid_in_period        = ĐCCN line 4 (Bên A paid in the period)
--   opening_debt_override = ĐCCN line 2 typed by hand; null = computed (closing
--                           debt of the previous confirmed period, else the
--                           contract's opening_debt)
-- ---------------------------------------------------------------------------
create table public.billing_period_inputs (
  id                    uuid primary key default gen_random_uuid(),
  contract_id           uuid not null references public.billing_contracts (id) on delete cascade,
  period_from           date not null,
  period_to             date not null,
  paid_in_period        bigint not null default 0,
  opening_debt_override bigint,
  note                  text not null default '',
  updated_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (period_to >= period_from),
  unique (contract_id, period_from)
);

create trigger billing_period_inputs_set_updated_at
  before update on public.billing_period_inputs
  for each row execute function public.set_updated_at();

-- Transport of a period: one row per vehicle type used on the HSTT.
--   trips            = column G (this period); null = blank cell
--   cumulative_trips = column F ("lũy kế", optional)
--   charge_mode      = 'now': J = G * I;  'end_of_term': J blank, K "Tính cuối kỳ"
--   unit_price       = copied from billing_transport_prices when entered, so a
--                      later price change does not rewrite past periods
create table public.billing_period_transport (
  id                 uuid primary key default gen_random_uuid(),
  period_input_id    uuid not null references public.billing_period_inputs (id) on delete cascade,
  transport_price_id uuid not null references public.billing_transport_prices (id) on delete restrict,
  trips              integer check (trips is null or trips >= 0),
  cumulative_trips   integer check (cumulative_trips is null or cumulative_trips >= 0),
  unit_price         bigint not null check (unit_price >= 0),
  charge_mode        text not null default 'now' check (charge_mode in ('now', 'end_of_term')),
  note               text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (period_input_id, transport_price_id)
);

create trigger billing_period_transport_set_updated_at
  before update on public.billing_period_transport
  for each row execute function public.set_updated_at();

-- After-VAT deductions of a period (inserted between VAT and the total, like
-- the 02/2026 HSTT).
create table public.billing_period_deductions (
  id              uuid primary key default gen_random_uuid(),
  period_input_id uuid not null references public.billing_period_inputs (id) on delete cascade,
  label           text not null check (btrim(label) <> ''),
  amount          bigint not null check (amount > 0),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index billing_period_deductions_input_idx
  on public.billing_period_deductions (period_input_id, sort_order);

create trigger billing_period_deductions_set_updated_at
  before update on public.billing_period_deductions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.company_profile           enable row level security;
alter table public.billing_customers         enable row level security;
alter table public.billing_contract_hstt     enable row level security;
alter table public.billing_transport_prices  enable row level security;
alter table public.billing_contract_advances enable row level security;
alter table public.billing_period_inputs     enable row level security;
alter table public.billing_period_transport  enable row level security;
alter table public.billing_period_deductions enable row level security;

-- company_profile: viewers read, admins update the single row.
drop policy if exists company_profile_select on public.company_profile;
create policy company_profile_select on public.company_profile
  for select to authenticated using ((select private.is_billing_viewer()));

drop policy if exists company_profile_update on public.company_profile;
create policy company_profile_update on public.company_profile
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Every other table: viewers read, accountants/admins write.
do $$
declare
  t text;
begin
  foreach t in array array[
    'billing_customers',
    'billing_contract_hstt',
    'billing_transport_prices',
    'billing_contract_advances',
    'billing_period_inputs',
    'billing_period_transport',
    'billing_period_deductions'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.is_billing_viewer()))',
      t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.is_billing_user()))',
      t || '_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated '
      'using ((select private.is_billing_user())) with check ((select private.is_billing_user()))',
      t || '_update', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select private.is_billing_user()))',
      t || '_delete', t);
  end loop;
end;
$$;
