-- "Tính hóa đơn tự động" (billing app), phase 1: equipment rent only.
--
-- Accountants upload the MISA "Sổ chi tiết vật tư hàng hóa" export, pick a
-- contract (= one MISA project warehouse) and a billing month, and the rent
-- engine in lib/billing computes the amount. Tables:
--
--   billing_contracts          one per MISA project warehouse (misa_kho)
--   billing_contract_items     display lines on the HSTT: name, unit, daily
--                              unit price (integer VND), MISA codes merged in
--   billing_excluded_codes     codes present in the warehouse but not billed
--   billing_excluded_ranges    non-billable date ranges (Tết...), per contract
--                              or global (contract_id null)
--   billing_misa_uploads       uploaded MISA files (in the private `billing`
--                              bucket), deduplicated by sha256
--   billing_rent_calculations  saved results: draft -> confirmed -> voided
--
-- Access (RLS in 0028): admins + active accountants only.
-- Money is integer VND: unit_price integer, totals bigint. The full engine
-- output (RentResult) and the contract config it used are stored as jsonb so a
-- later price change never rewrites history.
--
-- Conventions follow 0001/0024: uuid PKs, timestamptz, set_updated_at().

-- ---------------------------------------------------------------------------
-- Helper: admin OR active accountant. References the 'accountant' enum value
-- added in 0026, so it must run in a later transaction.
-- ---------------------------------------------------------------------------
create or replace function private.is_billing_user(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role in ('admin', 'accountant') and p.is_active
  );
$$;

revoke execute on function private.is_billing_user(uuid) from public;
grant  execute on function private.is_billing_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- billing_contracts
-- ---------------------------------------------------------------------------
create table public.billing_contracts (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  customer_name    text not null,
  project_name     text not null,
  contract_no      text not null default '',
  misa_kho         text not null unique,
  -- Billing period runs from this day of the previous month to (day - 1) of
  -- the billing month. TP uses 26 -> 25. Capped at 28 so every month has it.
  period_start_day smallint not null default 26 check (period_start_day between 2 and 28),
  -- First delivery date; shortens the very first period (e.g. 20/12 - 25/12).
  contract_start   date,
  active           boolean not null default true,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger billing_contracts_set_updated_at
  before update on public.billing_contracts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- billing_contract_items
-- ---------------------------------------------------------------------------
create table public.billing_contract_items (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.billing_contracts (id) on delete cascade,
  name        text not null,
  unit        text not null,
  unit_price  integer not null check (unit_price >= 0),
  ma_hang     text[] not null check (cardinality(ma_hang) > 0),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (contract_id, name)
);

create index billing_contract_items_contract_idx
  on public.billing_contract_items (contract_id, sort_order);

create trigger billing_contract_items_set_updated_at
  before update on public.billing_contract_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- billing_excluded_codes
-- ---------------------------------------------------------------------------
create table public.billing_excluded_codes (
  contract_id uuid not null references public.billing_contracts (id) on delete cascade,
  ma_hang     text not null,
  created_at  timestamptz not null default now(),
  primary key (contract_id, ma_hang)
);

-- ---------------------------------------------------------------------------
-- billing_excluded_ranges
-- ---------------------------------------------------------------------------
create table public.billing_excluded_ranges (
  id          uuid primary key default gen_random_uuid(),
  -- null = applies to every contract.
  contract_id uuid references public.billing_contracts (id) on delete cascade,
  date_from   date not null,
  date_to     date not null,
  reason      text not null,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  check (date_to >= date_from)
);

create index billing_excluded_ranges_contract_idx
  on public.billing_excluded_ranges (contract_id);

-- ---------------------------------------------------------------------------
-- billing_misa_uploads
-- ---------------------------------------------------------------------------
create table public.billing_misa_uploads (
  id              uuid primary key default gen_random_uuid(),
  storage_path    text not null unique,
  file_name       text not null,
  size_bytes      bigint not null check (size_bytes > 0),
  sha256          text not null unique,
  file_from       date not null,
  file_to         date not null,
  layout          text not null,
  warehouse_count integer not null default 0,
  warnings        jsonb not null default '[]'::jsonb,
  uploaded_by     uuid not null references public.profiles (id),
  created_at      timestamptz not null default now(),
  check (file_to >= file_from)
);

create index billing_misa_uploads_period_idx
  on public.billing_misa_uploads (file_from, file_to);

-- ---------------------------------------------------------------------------
-- billing_rent_calculations
-- ---------------------------------------------------------------------------
create type public.billing_calc_status as enum ('draft', 'confirmed', 'voided');

create table public.billing_rent_calculations (
  id                uuid primary key default gen_random_uuid(),
  -- restrict: a contract with saved calculations can only be deactivated.
  contract_id       uuid not null references public.billing_contracts (id) on delete restrict,
  period_month      text not null check (period_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  period_from       date not null,
  period_to         date not null,
  upload_ids        uuid[] not null,
  contract_snapshot jsonb not null,
  excluded_ranges   jsonb not null default '[]'::jsonb,
  total_amount      bigint not null,
  result            jsonb not null,
  status            public.billing_calc_status not null default 'draft',
  created_by        uuid not null references public.profiles (id),
  created_at        timestamptz not null default now(),
  confirmed_by      uuid references public.profiles (id),
  confirmed_at      timestamptz,
  voided_by         uuid references public.profiles (id),
  voided_at         timestamptz,
  check (period_to >= period_from)
);

create index billing_rent_calculations_contract_idx
  on public.billing_rent_calculations (contract_id, period_from desc, created_at desc);

-- At most one confirmed calculation per contract and period.
create unique index billing_rent_calculations_one_confirmed
  on public.billing_rent_calculations (contract_id, period_from)
  where status = 'confirmed';

-- Lifecycle guard. Only drafts are editable; the only allowed transitions are
-- draft -> confirmed and confirmed -> voided. Confirmation/void stamps are set
-- here from auth.uid() so the client can't forge them. (Who may void is
-- decided by RLS in 0028: admins only.)
create or replace function public.billing_calc_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'voided' then
    raise exception 'Bản tính đã hủy, không thể sửa.';
  end if;

  if old.status = 'confirmed' then
    if new.status <> 'voided'
       or new.contract_id       is distinct from old.contract_id
       or new.period_month      is distinct from old.period_month
       or new.period_from       is distinct from old.period_from
       or new.period_to         is distinct from old.period_to
       or new.upload_ids        is distinct from old.upload_ids
       or new.contract_snapshot is distinct from old.contract_snapshot
       or new.excluded_ranges   is distinct from old.excluded_ranges
       or new.total_amount      is distinct from old.total_amount
       or new.result            is distinct from old.result
       or new.created_by        is distinct from old.created_by
       or new.confirmed_by      is distinct from old.confirmed_by
       or new.confirmed_at      is distinct from old.confirmed_at then
      raise exception 'Bản tính đã xác nhận, không thể sửa. Hãy tạo bản tính mới.';
    end if;
    new.voided_by := auth.uid();
    new.voided_at := now();
    return new;
  end if;

  -- old.status = 'draft'
  if new.status = 'voided' then
    raise exception 'Chỉ bản tính đã xác nhận mới có thể hủy.';
  end if;
  if new.status = 'confirmed' then
    new.confirmed_by := auth.uid();
    new.confirmed_at := now();
  else
    new.confirmed_by := null;
    new.confirmed_at := null;
  end if;
  new.voided_by := null;
  new.voided_at := null;
  return new;
end;
$$;

revoke execute on function public.billing_calc_guard() from public, anon, authenticated;

create trigger billing_rent_calculations_guard
  before update on public.billing_rent_calculations
  for each row execute function public.billing_calc_guard();

-- An upload that backs a confirmed calculation must stay available for audit.
create or replace function public.billing_upload_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.billing_rent_calculations c
    where c.status = 'confirmed' and old.id = any (c.upload_ids)
  ) then
    raise exception 'File MISA này đang được dùng trong bản tính đã xác nhận, không thể xóa.';
  end if;
  return old;
end;
$$;

revoke execute on function public.billing_upload_delete_guard() from public, anon, authenticated;

create trigger billing_misa_uploads_delete_guard
  before delete on public.billing_misa_uploads
  for each row execute function public.billing_upload_delete_guard();

-- ---------------------------------------------------------------------------
-- Storage: private bucket for the uploaded MISA files. No storage policies:
-- reads/writes go through server code that checks permission first and then
-- uses the service role (same model as the `documents` bucket, 0003).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'billing',
  'billing',
  false,
  10485760, -- 10 MiB
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do nothing;
