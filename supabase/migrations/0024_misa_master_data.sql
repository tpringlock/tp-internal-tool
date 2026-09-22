-- MISA AMIS Kế toán (ACT Open API) — Phase 1: read-only master data cache.
--
-- Stores normalized copies of MISA master data (customers, products, stocks)
-- plus inventory balances, the sync bookkeeping (state + log), and the API
-- access token. Each business table keeps a stable `misa_id` (unique, for
-- idempotent upserts) and the original `raw` JSON for audit.
--
-- Access model:
--   * SELECT: admins + managers (content managers) — accountants use the
--     'manager' role (see 0016/0017). No accountant enum value is introduced.
--   * INSERT/UPDATE/DELETE: none for clients — only the service role (which
--     bypasses RLS) writes, from the trusted sync code after a permission check.
--   * misa_token is service-role only (RLS enabled, zero policies).
--
-- Conventions follow 0001_init.sql / 0017_manager_role_rls.sql: uuid PKs via
-- gen_random_uuid(), timestamptz + set_updated_at() triggers, and helper calls
-- wrapped in a scalar subselect so they evaluate once per statement (initplan).
--
-- Money/quantity use `numeric` (never float); supabase-js returns numeric as a
-- string, which the TS types preserve. Timestamps are timestamptz (UTC); the
-- sync normalizer converts MISA's ICT wall-clock values before insert.
--
-- Forward-compat (Phase 2, not created here): misa_sales_vouchers,
-- misa_stock_vouchers and their *_lines child tables (fetched via the async
-- request_data flow).

-- ---------------------------------------------------------------------------
-- misa_token: the current ACT Open API access token, one row per company.
-- Sensitive — no RLS policies, so only the service role can read/write it.
-- ---------------------------------------------------------------------------
create table public.misa_token (
  id               uuid primary key default gen_random_uuid(),
  org_company_code text not null unique,
  access_token     text not null,
  tenant_code      text,
  app_name         text,
  expired_at       timestamptz not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger misa_token_set_updated_at
  before update on public.misa_token
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- misa_customers: accounting objects (get_dictionary data_type = 1) — the set
-- includes customers/vendors/employees; object_type keeps MISA's own class.
-- ---------------------------------------------------------------------------
create table public.misa_customers (
  id               uuid primary key default gen_random_uuid(),
  misa_id          text not null unique,
  code             text,
  name             text not null default '',
  tax_code         text,
  phone            text,
  address          text,
  object_type      text,
  is_deleted       boolean not null default false,
  raw              jsonb not null default '{}'::jsonb,
  misa_modified_at timestamptz,
  synced_at        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index misa_customers_code_idx on public.misa_customers (code);
create index misa_customers_modified_idx on public.misa_customers (misa_modified_at);

create trigger misa_customers_set_updated_at
  before update on public.misa_customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- misa_products: vật tư hàng hoá (get_dictionary data_type = 3).
-- ---------------------------------------------------------------------------
create table public.misa_products (
  id               uuid primary key default gen_random_uuid(),
  misa_id          text not null unique,
  code             text,
  name             text not null default '',
  unit             text,
  category         text,
  is_deleted       boolean not null default false,
  raw              jsonb not null default '{}'::jsonb,
  misa_modified_at timestamptz,
  synced_at        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index misa_products_code_idx on public.misa_products (code);
create index misa_products_modified_idx on public.misa_products (misa_modified_at);

create trigger misa_products_set_updated_at
  before update on public.misa_products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- misa_stocks: kho (get_dictionary data_type = 5).
-- ---------------------------------------------------------------------------
create table public.misa_stocks (
  id               uuid primary key default gen_random_uuid(),
  misa_id          text not null unique,
  code             text,
  name             text not null default '',
  is_deleted       boolean not null default false,
  raw              jsonb not null default '{}'::jsonb,
  misa_modified_at timestamptz,
  synced_at        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index misa_stocks_code_idx on public.misa_stocks (code);

create trigger misa_stocks_set_updated_at
  before update on public.misa_stocks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- misa_inventory_balances: tồn kho (get_list_inventory_balance). Uniqueness is
-- per (stock, product); the exact grain may gain a branch dimension once the
-- real response is captured (see scripts/misa-test.ts).
-- ---------------------------------------------------------------------------
create table public.misa_inventory_balances (
  id              uuid primary key default gen_random_uuid(),
  stock_misa_id   text,
  product_misa_id text,
  quantity        numeric,
  value           numeric(18, 2),
  as_of           timestamptz,
  raw             jsonb not null default '{}'::jsonb,
  synced_at       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (stock_misa_id, product_misa_id)
);

create index misa_inventory_balances_product_idx
  on public.misa_inventory_balances (product_misa_id);

create trigger misa_inventory_balances_set_updated_at
  before update on public.misa_inventory_balances
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- misa_sync_state: last successful incremental watermark per data type.
-- ---------------------------------------------------------------------------
create table public.misa_sync_state (
  data_type              text primary key,
  last_sync_time         timestamptz,
  last_deleted_sync_time timestamptz,
  updated_at             timestamptz not null default now()
);

create trigger misa_sync_state_set_updated_at
  before update on public.misa_sync_state
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- misa_sync_log: one row per sync run per data type (append-only history).
-- ---------------------------------------------------------------------------
create table public.misa_sync_log (
  id               bigint generated always as identity primary key,
  data_type        text not null,
  status           text not null default 'running'
                     check (status in ('running', 'success', 'error')),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  records_upserted integer not null default 0,
  records_deleted  integer not null default 0,
  error            text,
  triggered_by     text not null default 'manual'
                     check (triggered_by in ('manual', 'cron')),
  actor_user_id    uuid references public.profiles (id)
);

create index misa_sync_log_data_type_idx
  on public.misa_sync_log (data_type, started_at desc);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.misa_token              enable row level security;
alter table public.misa_customers          enable row level security;
alter table public.misa_products           enable row level security;
alter table public.misa_stocks             enable row level security;
alter table public.misa_inventory_balances enable row level security;
alter table public.misa_sync_state         enable row level security;
alter table public.misa_sync_log           enable row level security;

-- Read-only for content managers (admins + managers). Writes go through the
-- service role, which bypasses RLS — so no insert/update/delete policies.
create policy misa_customers_select on public.misa_customers
  for select to authenticated using ((select private.is_content_manager()));

create policy misa_products_select on public.misa_products
  for select to authenticated using ((select private.is_content_manager()));

create policy misa_stocks_select on public.misa_stocks
  for select to authenticated using ((select private.is_content_manager()));

create policy misa_inventory_balances_select on public.misa_inventory_balances
  for select to authenticated using ((select private.is_content_manager()));

create policy misa_sync_state_select on public.misa_sync_state
  for select to authenticated using ((select private.is_content_manager()));

create policy misa_sync_log_select on public.misa_sync_log
  for select to authenticated using ((select private.is_content_manager()));

-- misa_token intentionally has RLS enabled and NO policies: unreachable by any
-- client role, readable/writable only by the service role.
