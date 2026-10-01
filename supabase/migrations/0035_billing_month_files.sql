-- Billing phase 1: MISA source files by data month (feedback items 1, 1b).
--
-- Every new MISA "Sổ chi tiết vật tư hàng hóa" upload must cover exactly one
-- calendar month (01 -> last day). Re-uploading a month creates a new
-- version; older versions are kept (and downloadable) as history. Each month
-- has exactly one 'active' version, which phase 2 will pick automatically
-- when calculating a period.
--
-- The file itself stays a row in billing_misa_uploads (storage path, sha256,
-- uploader, parser warnings): this table only adds month + version on top,
-- so billing_rent_calculations.upload_ids keep pointing at the exact file
-- (= exact version) a calculation used.
--
-- Rules enforced here (the app checks them first for friendly messages):
--   * only a full calendar month can be registered (billing_add_month_file);
--   * one active version per month (partial unique index);
--   * month / version / file are immutable; history is never rewritten;
--   * replacing (superseding) a version that a CONFIRMED calculation uses
--     is admin-only; restoring an older version is admin-only;
--   * deleting a version is admin-only (RLS) and blocked while a confirmed
--     calculation uses it; deleting the active version re-activates the
--     newest remaining one.
--
-- Additive only: existing code keeps working. Existing uploads are
-- backfilled at cutover time (0037), not here, so uploads made between
-- applying 0035 and 0037 are not missed.

create table public.billing_misa_month_files (
  id            uuid primary key default gen_random_uuid(),
  upload_id     uuid not null unique
                references public.billing_misa_uploads (id) on delete restrict,
  month         text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  version       integer not null check (version > 0),
  status        text not null default 'active' check (status in ('active', 'superseded')),
  -- Number of distinct vouchers (Số chứng từ) in the file; null for rows
  -- backfilled by 0037 until the app re-reads the file.
  voucher_count integer check (voucher_count is null or voucher_count >= 0),
  -- MISA names read from the file, used to check the price table:
  --   {"warehouses": {"<kho>": "<tên kho>"},
  --    "items": {"<mã VT>": {"name": "<tên VT>", "dvt": "<ĐVT>"}},
  --    "pairs": ["<kho>|<mã VT>", ...]}   -- kho/mã with stock or movement
  -- null until read (backfilled rows).
  catalog       jsonb,
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  superseded_by uuid references public.profiles (id),
  superseded_at timestamptz,
  unique (month, version)
);

create unique index billing_misa_month_files_one_active
  on public.billing_misa_month_files (month)
  where status = 'active';

create index billing_misa_month_files_month_idx
  on public.billing_misa_month_files (month desc, version desc);

-- ---------------------------------------------------------------------------
-- Guard: immutable history, admin-only replacement of confirmed data.
-- SECURITY DEFINER so the "used by a confirmed calculation" check sees every
-- calculation regardless of the caller's RLS. auth.uid() still resolves to
-- the caller.
-- ---------------------------------------------------------------------------
create or replace function public.billing_month_file_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id         is distinct from old.id
     or new.upload_id  is distinct from old.upload_id
     or new.month      is distinct from old.month
     or new.version    is distinct from old.version
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Không được sửa tháng, phiên bản hoặc file của file nguồn đã lưu.';
  end if;

  -- catalog / voucher_count may only be filled in once (rows backfilled by 0037).
  if old.catalog is not null and new.catalog is distinct from old.catalog then
    raise exception 'Danh mục MISA của file đã đọc, không được sửa.';
  end if;
  if old.voucher_count is not null and new.voucher_count is distinct from old.voucher_count then
    raise exception 'Số phiếu của file đã đọc, không được sửa.';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'superseded' then
      if not private.is_admin() and exists (
        select 1 from public.billing_rent_calculations c
        where c.status = 'confirmed' and old.upload_id = any (c.upload_ids)
      ) then
        raise exception
          'Tháng % có bản tính đã xác nhận dùng file phiên bản %. Chỉ admin được thay file này.',
          old.month, old.version
          using errcode = '42501';
      end if;
      new.superseded_by := auth.uid();
      new.superseded_at := now();
    else
      if not private.is_admin() then
        raise exception 'Chỉ admin được khôi phục phiên bản cũ của file nguồn.' using errcode = '42501';
      end if;
      new.superseded_by := null;
      new.superseded_at := null;
    end if;
  else
    new.superseded_by := old.superseded_by;
    new.superseded_at := old.superseded_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.billing_month_file_guard() from public, anon, authenticated;

create trigger billing_misa_month_files_guard
  before update on public.billing_misa_month_files
  for each row execute function public.billing_month_file_guard();

-- A version backing a confirmed calculation must stay (same rule as
-- billing_upload_delete_guard in 0027).
create or replace function public.billing_month_file_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.billing_rent_calculations c
    where c.status = 'confirmed' and old.upload_id = any (c.upload_ids)
  ) then
    raise exception 'File tháng % phiên bản % đang được dùng trong bản tính đã xác nhận, không thể xóa.',
      old.month, old.version;
  end if;
  return old;
end;
$$;

revoke execute on function public.billing_month_file_delete_guard() from public, anon, authenticated;

create trigger billing_misa_month_files_delete_guard
  before delete on public.billing_misa_month_files
  for each row execute function public.billing_month_file_delete_guard();

-- Deleting the active version re-activates the newest remaining one, so a
-- month never silently loses its data. Runs as the caller (an admin: delete
-- is admin-only), so the guard above allows superseded -> active.
create or replace function public.billing_month_file_after_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'active' then
    update public.billing_misa_month_files f
    set status = 'active'
    where f.id = (
      select f2.id from public.billing_misa_month_files f2
      where f2.month = old.month
      order by f2.version desc
      limit 1
    );
  end if;
  return null;
end;
$$;

revoke execute on function public.billing_month_file_after_delete() from public, anon, authenticated;

create trigger billing_misa_month_files_after_delete
  after delete on public.billing_misa_month_files
  for each row execute function public.billing_month_file_after_delete();

-- ---------------------------------------------------------------------------
-- RPC: store an uploaded month file as the new active version, in one
-- transaction (upload row + month row + superseding the previous version).
-- The app uploads the object to Storage first and removes it again if this
-- call fails.
--
-- p_upload: {"id", "storage_path", "file_name", "size_bytes", "sha256",
--            "file_from", "file_to", "layout", "warehouse_count", "warnings"}
-- Returns {"month", "version", "replaced_upload_id"}.
--
-- SECURITY INVOKER (default): RLS of 0028/0034 and this file still applies.
-- ---------------------------------------------------------------------------
create or replace function public.billing_add_month_file(
  p_upload        jsonb,
  p_voucher_count integer,
  p_catalog       jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_from     date := (p_upload ->> 'file_from')::date;
  v_to       date := (p_upload ->> 'file_to')::date;
  v_month    text;
  v_version  integer;
  v_upload   uuid := (p_upload ->> 'id')::uuid;
  v_replaced uuid;
begin
  if not private.is_billing_user() then
    raise exception 'Không có quyền tải file nguồn.' using errcode = '42501';
  end if;

  if v_from is null or v_to is null
     or v_from <> date_trunc('month', v_from)::date
     or v_to <> (date_trunc('month', v_from) + interval '1 month - 1 day')::date then
    raise exception 'File nguồn phải là trọn 1 tháng (từ ngày 01 đến ngày cuối tháng). File này: % → %.',
      to_char(v_from, 'DD/MM/YYYY'), to_char(v_to, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;
  v_month := to_char(v_from, 'YYYY-MM');

  -- Serialise uploads of the same month (version numbering, one active).
  perform pg_advisory_xact_lock(hashtext('billing_misa_month:' || v_month));

  insert into public.billing_misa_uploads (
    id, storage_path, file_name, size_bytes, sha256, file_from, file_to,
    layout, warehouse_count, warnings, uploaded_by
  ) values (
    v_upload,
    p_upload ->> 'storage_path',
    p_upload ->> 'file_name',
    (p_upload ->> 'size_bytes')::bigint,
    p_upload ->> 'sha256',
    v_from,
    v_to,
    p_upload ->> 'layout',
    coalesce((p_upload ->> 'warehouse_count')::integer, 0),
    coalesce(p_upload -> 'warnings', '[]'::jsonb),
    auth.uid()
  );

  -- The guard trigger refuses this for a non-admin when a confirmed
  -- calculation uses the current version; the whole call then rolls back.
  update public.billing_misa_month_files f
  set status = 'superseded'
  where f.month = v_month and f.status = 'active'
  returning f.upload_id into v_replaced;

  select coalesce(max(f.version), 0) + 1 into v_version
  from public.billing_misa_month_files f
  where f.month = v_month;

  insert into public.billing_misa_month_files (
    upload_id, month, version, status, voucher_count, catalog, created_by
  ) values (
    v_upload, v_month, v_version, 'active', p_voucher_count, p_catalog, auth.uid()
  );

  return jsonb_build_object(
    'month', v_month,
    'version', v_version,
    'replaced_upload_id', v_replaced
  );
end;
$$;

revoke execute on function public.billing_add_month_file(jsonb, integer, jsonb) from public, anon;
grant  execute on function public.billing_add_month_file(jsonb, integer, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.billing_misa_month_files enable row level security;

drop policy if exists billing_misa_month_files_select on public.billing_misa_month_files;
create policy billing_misa_month_files_select on public.billing_misa_month_files
  for select to authenticated using ((select private.is_billing_viewer()));

drop policy if exists billing_misa_month_files_insert on public.billing_misa_month_files;
create policy billing_misa_month_files_insert on public.billing_misa_month_files
  for insert to authenticated
  with check (
    (select private.is_billing_user())
    and created_by = (select auth.uid())
    and status = 'active'
  );

-- Status changes and one-time catalog fill; the guard trigger decides what
-- is allowed.
drop policy if exists billing_misa_month_files_update on public.billing_misa_month_files;
create policy billing_misa_month_files_update on public.billing_misa_month_files
  for update to authenticated
  using ((select private.is_billing_user()))
  with check ((select private.is_billing_user()));

drop policy if exists billing_misa_month_files_delete on public.billing_misa_month_files;
create policy billing_misa_month_files_delete on public.billing_misa_month_files
  for delete to authenticated using ((select private.is_admin()));
