-- Billing phase 1: flat price table (feedback items 2, 3).
--
-- One row = (project warehouse, MISA item code), like the "DATA ĐƠN GIÁ"
-- sheet of TP's old Excel tool and the import template
-- docs/mau-nhap-don-gia.xlsx (sheet DON_GIA). It replaces
-- billing_contract_items (one line merging several codes) and
-- billing_excluded_codes; the data is copied over at cutover (0037) and the
-- old tables are then frozen, not dropped.
--
-- Columns:
--   ten_vt / dvt          = the MISA name / unit (filled from the month files'
--                           catalog; a mismatch is a warning, never blocking)
--   print_name / print_dvt = overrides printed on the HSTT; null = use the
--                           MISA value
--
-- How a contract's rows become the engine's ContractConfig (app code,
-- lib/billing/price-lines.ts; the engine itself does not change):
--   * unit_price = 0  -> the code is "not billed" (excludedMaHang).
--   * unit_price > 0  -> billed, grouped into HSTT lines by
--       name = coalesce(print_name, nullif(ten_vt, ''), ma_vt)
--     Each row's printed unit is coalesce(print_dvt, nullif(dvt, '')); the
--     non-empty printed units of a group must be equal, and so must the
--     prices. Group order = smallest sort_order (ties: name); code order
--     inside a group = sort_order.
--   * a code with stock/movement but NO row at all = missing price: the
--     engine stops, as today. Price 0 and "no row" are never conflated.
--
-- Additive only: existing code keeps working on billing_contract_items until
-- 0037 + the new app code are deployed together.

-- Warehouse name as on MISA ("VIETPANEL HẢI DƯƠNG"), from the import file or
-- the month files. Searchable in the project picker.
alter table public.billing_contracts
  add column if not exists misa_kho_name text not null default '';

-- ---------------------------------------------------------------------------
-- billing_price_lines
-- ---------------------------------------------------------------------------
create table public.billing_price_lines (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.billing_contracts (id) on delete cascade,
  -- Normalised like the parser's normalizeCode(): trimmed, single spaces.
  ma_vt       text not null
              check (ma_vt <> '' and ma_vt = regexp_replace(btrim(ma_vt), '\s+', ' ', 'g')),
  -- MISA name / unit ('' = not known yet).
  ten_vt      text not null default '',
  dvt         text not null default '',
  -- Integer VND per day. 0 = not billed (pallet...).
  unit_price  integer not null check (unit_price >= 0),
  -- HSTT overrides. Rows with the same printed name are merged into one line.
  print_name  text check (print_name is null or btrim(print_name) <> ''),
  print_dvt   text check (print_dvt is null or btrim(print_dvt) <> ''),
  note        text not null default '',
  sort_order  integer not null default 0,
  updated_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (contract_id, ma_vt)
);

create index billing_price_lines_contract_idx
  on public.billing_price_lines (contract_id, sort_order);

create trigger billing_price_lines_set_updated_at
  before update on public.billing_price_lines
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- billing_price_imports: one row per confirmed Excel import (audit log).
-- The imported file is kept in the `billing` bucket (storage_path).
-- `columns` = the optional columns the file had (absent ones were left
-- untouched); `changes` lists every change with full before/after values,
-- so an import can be audited (and undone by hand) later.
-- ---------------------------------------------------------------------------
create table public.billing_price_imports (
  id                uuid primary key default gen_random_uuid(),
  mode              text not null check (mode in ('upsert', 'replace')),
  file_name         text not null,
  size_bytes        bigint not null check (size_bytes > 0),
  sha256            text not null,
  storage_path      text not null unique,
  row_count         integer not null check (row_count >= 0),
  columns           text[] not null default '{}',
  contracts_created integer not null default 0,
  contracts_updated integer not null default 0,
  lines_inserted    integer not null default 0,
  lines_updated     integer not null default 0,
  lines_deleted     integer not null default 0,
  lines_unchanged   integer not null default 0,
  warnings          jsonb not null default '[]'::jsonb,
  changes           jsonb not null default '[]'::jsonb,
  created_by        uuid not null references public.profiles (id),
  created_at        timestamptz not null default now()
);

create index billing_price_imports_created_idx
  on public.billing_price_imports (created_at desc);

-- ---------------------------------------------------------------------------
-- RPC: replace one contract's price rows (manual editor on the contract page,
-- which always sends every field). Rows not in p_lines are deleted, the rest
-- upserted by ma_vt; sort_order follows the array order.
--
-- p_lines: [{"ma_vt", "ten_vt", "dvt", "unit_price", "print_name",
--            "print_dvt", "note"}, ...]
-- ---------------------------------------------------------------------------
create or replace function public.billing_save_price_lines(
  p_contract_id uuid,
  p_lines       jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_codes text[];
begin
  if not private.is_billing_user() then
    raise exception 'Không có quyền sửa bảng giá.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.billing_contracts where id = p_contract_id) then
    raise exception 'Không tìm thấy hợp đồng.' using errcode = 'P0002';
  end if;

  v_codes := array(select x ->> 'ma_vt' from jsonb_array_elements(p_lines) as x);

  delete from public.billing_price_lines p
  where p.contract_id = p_contract_id
    and not (p.ma_vt = any (v_codes));

  insert into public.billing_price_lines as p
    (contract_id, ma_vt, ten_vt, dvt, unit_price, print_name, print_dvt, note, sort_order, updated_by)
  select
    p_contract_id,
    x.line ->> 'ma_vt',
    coalesce(x.line ->> 'ten_vt', ''),
    coalesce(x.line ->> 'dvt', ''),
    (x.line ->> 'unit_price')::integer,
    nullif(btrim(coalesce(x.line ->> 'print_name', '')), ''),
    nullif(btrim(coalesce(x.line ->> 'print_dvt', '')), ''),
    coalesce(x.line ->> 'note', ''),
    x.ord::integer,
    auth.uid()
  from jsonb_array_elements(p_lines) with ordinality as x(line, ord)
  on conflict (contract_id, ma_vt) do update set
    ten_vt     = excluded.ten_vt,
    dvt        = excluded.dvt,
    unit_price = excluded.unit_price,
    print_name = excluded.print_name,
    print_dvt  = excluded.print_dvt,
    note       = excluded.note,
    sort_order = excluded.sort_order,
    updated_by = excluded.updated_by
  where (p.ten_vt, p.dvt, p.unit_price, p.print_name, p.print_dvt, p.note, p.sort_order)
        is distinct from
        (excluded.ten_vt, excluded.dvt, excluded.unit_price, excluded.print_name,
         excluded.print_dvt, excluded.note, excluded.sort_order);

  update public.billing_contracts set updated_at = now() where id = p_contract_id;
end;
$$;

revoke execute on function public.billing_save_price_lines(uuid, jsonb) from public, anon;
grant  execute on function public.billing_save_price_lines(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: apply a previewed Excel import in one transaction and log it.
--
-- The app parses and validates the file (format errors block the import,
-- MISA name mismatches are warnings), shows the preview, and on confirmation
-- re-parses the same file and calls this.
--
-- Missing columns vs empty cells (only Mã kho, Mã VT, Đơn giá are required):
--   * a column NOT in the file  -> its key is ABSENT from the JSON objects
--     below -> the stored value is kept (new rows get the default);
--   * a column IN the file but the cell is empty -> the key is present with
--     "" -> the stored value is cleared ('' for text, null for print_*).
--
-- p_import = {
--   "mode": "upsert" | "replace",
--      upsert:  insert new rows, update changed rows, delete nothing;
--      replace: additionally delete the rows of every warehouse IN THE FILE
--               that are not in the file (other warehouses are untouched).
--   "file": {"file_name", "size_bytes", "sha256", "storage_path", "row_count"},
--   "columns": ["ten_kho", "so_hd", ...],   -- optional columns present (log only)
--   "warnings": [text, ...],
--   "expected": {"contracts_created", "contracts_updated", "lines_inserted",
--                "lines_updated", "lines_deleted", "lines_unchanged"},
--   "contracts": [{
--      "misa_kho",                               -- required
--      "code",                                   -- used only for a new warehouse
--      "misa_kho_name"?, "contract_no"?, "customer_name"?,
--      "lines": [{"ma_vt", "unit_price", "sort_order",       -- required
--                 "ten_vt"?, "dvt"?, "print_name"?, "print_dvt"?, "note"?}]
--   }, ...]
-- }
--
-- Only real contracts are touched (is_demo = false). The app refuses a NEW
-- warehouse without Số hợp đồng / Khách hàng; here they default to ''.
-- If the counts differ from "expected" (someone changed the price table after
-- the preview), the whole import is rolled back and the user is asked to
-- preview again.
--
-- SECURITY INVOKER (default): RLS still applies.
-- Returns {"import_id", "contracts_created", ..., "lines_unchanged"}.
-- ---------------------------------------------------------------------------
create or replace function public.billing_import_price_lines(p_import jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_mode      text := p_import ->> 'mode';
  v_c         jsonb;
  v_l         jsonb;
  v_contract  public.billing_contracts%rowtype;
  v_line      public.billing_price_lines%rowtype;
  v_cid       uuid;
  v_kho       text;
  v_codes     text[];
  v_matches   integer;
  v_deleted   jsonb;
  v_n         integer;
  v_changes   jsonb := '[]'::jsonb;
  v_counts    jsonb;
  v_import_id uuid;
  -- new contract header values
  n_kho_name  text;
  n_no        text;
  n_customer  text;
  -- new line values
  n_ten       text;
  n_dvt       text;
  n_price     integer;
  n_print     text;
  n_print_dvt text;
  n_note      text;
  n_sort      integer;
  c_created   integer := 0;
  c_updated   integer := 0;
  l_inserted  integer := 0;
  l_updated   integer := 0;
  l_deleted   integer := 0;
  l_unchanged integer := 0;
begin
  if not private.is_billing_user() then
    raise exception 'Không có quyền nhập bảng giá.' using errcode = '42501';
  end if;
  if v_mode is null or v_mode not in ('upsert', 'replace') then
    raise exception 'Chế độ nhập không hợp lệ: %.', coalesce(v_mode, '(trống)') using errcode = '22023';
  end if;

  -- One import at a time, so the preview/expected check is meaningful.
  perform pg_advisory_xact_lock(hashtext('billing_price_import'));

  for v_c in select * from jsonb_array_elements(p_import -> 'contracts') loop
    v_kho := v_c ->> 'misa_kho';

    select count(*) into v_matches
    from public.billing_contracts c
    where not c.is_demo
      and regexp_replace(btrim(c.misa_kho), '\s+', ' ', 'g') = v_kho;
    if v_matches > 1 then
      raise exception 'Có % hợp đồng cùng mã kho "%". Hãy gộp lại trước khi nhập.', v_matches, v_kho;
    end if;

    -- No row -> every field of v_contract is null.
    select c.* into v_contract
    from public.billing_contracts c
    where not c.is_demo
      and regexp_replace(btrim(c.misa_kho), '\s+', ' ', 'g') = v_kho
    for update;

    n_kho_name := case when v_c ? 'misa_kho_name' then coalesce(v_c ->> 'misa_kho_name', '')
                       else coalesce(v_contract.misa_kho_name, '') end;
    n_no       := case when v_c ? 'contract_no' then coalesce(v_c ->> 'contract_no', '')
                       else coalesce(v_contract.contract_no, '') end;
    n_customer := case when v_c ? 'customer_name' then coalesce(v_c ->> 'customer_name', '')
                       else coalesce(v_contract.customer_name, '') end;

    if v_contract.id is null then
      insert into public.billing_contracts
        (code, customer_name, project_name, contract_no, misa_kho, misa_kho_name, created_by)
      values (
        v_c ->> 'code', n_customer, coalesce(nullif(n_kho_name, ''), v_kho), n_no, v_kho, n_kho_name, auth.uid()
      )
      returning id into v_cid;
      c_created := c_created + 1;
      v_changes := v_changes || jsonb_build_object(
        'op', 'contract_created', 'misa_kho', v_kho,
        'after', jsonb_build_object('contract_no', n_no, 'customer_name', n_customer, 'misa_kho_name', n_kho_name));
    else
      v_cid := v_contract.id;
      if (v_contract.contract_no, v_contract.customer_name, v_contract.misa_kho_name)
         is distinct from (n_no, n_customer, n_kho_name) then
        update public.billing_contracts
        set contract_no = n_no, customer_name = n_customer, misa_kho_name = n_kho_name
        where id = v_cid;
        c_updated := c_updated + 1;
        v_changes := v_changes || jsonb_build_object(
          'op', 'contract_updated', 'misa_kho', v_kho,
          'before', jsonb_build_object('contract_no', v_contract.contract_no,
                                       'customer_name', v_contract.customer_name,
                                       'misa_kho_name', v_contract.misa_kho_name),
          'after', jsonb_build_object('contract_no', n_no, 'customer_name', n_customer,
                                      'misa_kho_name', n_kho_name));
      end if;
    end if;

    -- replace: drop this warehouse's rows that are not in the file.
    if v_mode = 'replace' then
      v_codes := array(select x ->> 'ma_vt' from jsonb_array_elements(v_c -> 'lines') as x);
      with del as (
        delete from public.billing_price_lines p
        where p.contract_id = v_cid and not (p.ma_vt = any (v_codes))
        returning p.*
      )
      select count(*), coalesce(jsonb_agg(jsonb_build_object(
               'op', 'line_deleted', 'misa_kho', v_kho, 'ma_vt', del.ma_vt,
               'before', jsonb_build_object(
                 'ten_vt', del.ten_vt, 'dvt', del.dvt, 'unit_price', del.unit_price,
                 'print_name', del.print_name, 'print_dvt', del.print_dvt, 'note', del.note))), '[]'::jsonb)
      into v_n, v_deleted
      from del;
      l_deleted := l_deleted + v_n;
      v_changes := v_changes || v_deleted;
    end if;

    for v_l in select * from jsonb_array_elements(v_c -> 'lines') loop
      -- No row -> every field of v_line is null (= defaults for a new row).
      select p.* into v_line
      from public.billing_price_lines p
      where p.contract_id = v_cid and p.ma_vt = v_l ->> 'ma_vt'
      for update;

      n_price     := (v_l ->> 'unit_price')::integer;
      n_sort      := coalesce((v_l ->> 'sort_order')::integer, 0);
      n_ten       := case when v_l ? 'ten_vt' then coalesce(v_l ->> 'ten_vt', '')
                          else coalesce(v_line.ten_vt, '') end;
      n_dvt       := case when v_l ? 'dvt' then coalesce(v_l ->> 'dvt', '')
                          else coalesce(v_line.dvt, '') end;
      n_print     := case when v_l ? 'print_name' then nullif(btrim(coalesce(v_l ->> 'print_name', '')), '')
                          else v_line.print_name end;
      n_print_dvt := case when v_l ? 'print_dvt' then nullif(btrim(coalesce(v_l ->> 'print_dvt', '')), '')
                          else v_line.print_dvt end;
      n_note      := case when v_l ? 'note' then coalesce(v_l ->> 'note', '')
                          else coalesce(v_line.note, '') end;

      if v_line.id is null then
        insert into public.billing_price_lines
          (contract_id, ma_vt, ten_vt, dvt, unit_price, print_name, print_dvt, note, sort_order, updated_by)
        values (v_cid, v_l ->> 'ma_vt', n_ten, n_dvt, n_price, n_print, n_print_dvt, n_note, n_sort, auth.uid());
        l_inserted := l_inserted + 1;
        v_changes := v_changes || jsonb_build_object(
          'op', 'line_inserted', 'misa_kho', v_kho, 'ma_vt', v_l ->> 'ma_vt',
          'after', jsonb_build_object('ten_vt', n_ten, 'dvt', n_dvt, 'unit_price', n_price,
                                      'print_name', n_print, 'print_dvt', n_print_dvt, 'note', n_note));
      elsif (v_line.ten_vt, v_line.dvt, v_line.unit_price, v_line.print_name, v_line.print_dvt, v_line.note)
            is distinct from (n_ten, n_dvt, n_price, n_print, n_print_dvt, n_note) then
        update public.billing_price_lines set
          ten_vt     = n_ten,
          dvt        = n_dvt,
          unit_price = n_price,
          print_name = n_print,
          print_dvt  = n_print_dvt,
          note       = n_note,
          -- In replace mode the file also defines the row order.
          sort_order = case when v_mode = 'replace' then n_sort else sort_order end,
          updated_by = auth.uid()
        where id = v_line.id;
        l_updated := l_updated + 1;
        v_changes := v_changes || jsonb_build_object(
          'op', 'line_updated', 'misa_kho', v_kho, 'ma_vt', v_l ->> 'ma_vt',
          'before', jsonb_build_object('ten_vt', v_line.ten_vt, 'dvt', v_line.dvt,
                                       'unit_price', v_line.unit_price, 'print_name', v_line.print_name,
                                       'print_dvt', v_line.print_dvt, 'note', v_line.note),
          'after', jsonb_build_object('ten_vt', n_ten, 'dvt', n_dvt, 'unit_price', n_price,
                                      'print_name', n_print, 'print_dvt', n_print_dvt, 'note', n_note));
      else
        if v_mode = 'replace' and v_line.sort_order <> n_sort then
          update public.billing_price_lines set sort_order = n_sort where id = v_line.id;
        end if;
        l_unchanged := l_unchanged + 1;
      end if;
    end loop;
  end loop;

  v_counts := jsonb_build_object(
    'contracts_created', c_created,
    'contracts_updated', c_updated,
    'lines_inserted', l_inserted,
    'lines_updated', l_updated,
    'lines_deleted', l_deleted,
    'lines_unchanged', l_unchanged
  );
  if p_import ? 'expected' and (p_import -> 'expected') is distinct from v_counts then
    raise exception 'Bảng giá đã thay đổi kể từ lúc xem trước (dự kiến %, thực tế %). Hãy xem trước lại.',
      p_import -> 'expected', v_counts
      using errcode = '40001';
  end if;

  insert into public.billing_price_imports (
    mode, file_name, size_bytes, sha256, storage_path, row_count, columns,
    contracts_created, contracts_updated,
    lines_inserted, lines_updated, lines_deleted, lines_unchanged,
    warnings, changes, created_by
  ) values (
    v_mode,
    p_import -> 'file' ->> 'file_name',
    (p_import -> 'file' ->> 'size_bytes')::bigint,
    p_import -> 'file' ->> 'sha256',
    p_import -> 'file' ->> 'storage_path',
    (p_import -> 'file' ->> 'row_count')::integer,
    array(select jsonb_array_elements_text(coalesce(p_import -> 'columns', '[]'::jsonb))),
    c_created, c_updated, l_inserted, l_updated, l_deleted, l_unchanged,
    coalesce(p_import -> 'warnings', '[]'::jsonb),
    v_changes,
    auth.uid()
  )
  returning id into v_import_id;

  return v_counts || jsonb_build_object('import_id', v_import_id);
end;
$$;

revoke execute on function public.billing_import_price_lines(jsonb) from public, anon;
grant  execute on function public.billing_import_price_lines(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
--   price lines: viewers read; accountants/admins write (editing or
--                importing the price table is accountant work, section 3).
--   imports:     viewers read; accountants/admins insert as themselves;
--                immutable (no update/delete policy).
-- ---------------------------------------------------------------------------
alter table public.billing_price_lines   enable row level security;
alter table public.billing_price_imports enable row level security;

drop policy if exists billing_price_lines_select on public.billing_price_lines;
create policy billing_price_lines_select on public.billing_price_lines
  for select to authenticated using ((select private.is_billing_viewer()));

drop policy if exists billing_price_lines_insert on public.billing_price_lines;
create policy billing_price_lines_insert on public.billing_price_lines
  for insert to authenticated with check ((select private.is_billing_user()));

drop policy if exists billing_price_lines_update on public.billing_price_lines;
create policy billing_price_lines_update on public.billing_price_lines
  for update to authenticated
  using ((select private.is_billing_user()))
  with check ((select private.is_billing_user()));

drop policy if exists billing_price_lines_delete on public.billing_price_lines;
create policy billing_price_lines_delete on public.billing_price_lines
  for delete to authenticated using ((select private.is_billing_user()));

drop policy if exists billing_price_imports_select on public.billing_price_imports;
create policy billing_price_imports_select on public.billing_price_imports
  for select to authenticated using ((select private.is_billing_viewer()));

drop policy if exists billing_price_imports_insert on public.billing_price_imports;
create policy billing_price_imports_insert on public.billing_price_imports
  for insert to authenticated
  with check (
    (select private.is_billing_user()) and created_by = (select auth.uid())
  );
