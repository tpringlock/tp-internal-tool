-- Billing phase 4: customer-specific HSTT templates.
-- Convention + check: lib/billing/hstt-placeholders.ts, hstt-template.ts;
-- guide for accountants: docs/hstt/cach-tu-lam-mau.md.
--
-- ADDITIVE ONLY: new tables, functions and one new private bucket; no
-- ALTER/UPDATE/DELETE on existing objects (billing_contracts untouched, so
-- check-real-contracts.sql MD5 stays the same).
--
--   * billing_hstt_templates: one row per template (name, active/retired).
--   * billing_hstt_template_versions: every uploaded file, immutable. The
--     current version of a template is its highest version number;
--     re-uploading creates a new version, older ones stay downloadable.
--   * billing_contract_hstt_templates: contract -> template (1 row per
--     contract). No row = the standard TP template (docs/hstt/hstt-template.xlsx).
--   * billing_hstt_exports: one row per HSTT download: which template and
--     version (null = standard, with the standard file's sha256) produced
--     the file sent to the customer. Rows outlive the contract (snapshot of
--     contract code + customer name).
--
-- Files live in the private bucket `billing-templates`. No storage policies:
-- like the `billing` bucket (0027), server code checks permission first and
-- then uses the service role.
--
-- RLS: billing viewers read everything (and log their own downloads);
-- admins upload / rename / retire / delete templates; accountants + admins
-- assign templates to contracts.
--
-- Rollback: supabase/revert/0041_billing_hstt_templates.revert.sql.

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
create table public.billing_hstt_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '',
  status      text not null default 'active' check (status in ('active', 'retired')),
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  retired_by  uuid references public.profiles (id),
  retired_at  timestamptz,
  updated_at  timestamptz not null default now()
);

create unique index billing_hstt_templates_name_key
  on public.billing_hstt_templates (lower(btrim(name)));

create trigger billing_hstt_templates_set_updated_at
  before update on public.billing_hstt_templates
  for each row execute function public.set_updated_at();

create table public.billing_hstt_template_versions (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.billing_hstt_templates (id) on delete cascade,
  version      integer not null check (version > 0),
  storage_path text not null unique,
  file_name    text not null,
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 2097152),
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- TemplateReport of validateTemplate (sheets, errors, warnings). Only
  -- templates without errors are stored.
  report       jsonb not null check ((report ->> 'ok')::boolean is true),
  note         text not null default '',
  -- "Dùng lại phiên bản này": the older version this one re-publishes (same
  -- file content, copied to a new storage path). NO ACTION (checked at the
  -- end of the statement), so deleting the template cascades over both rows.
  reused_from  uuid references public.billing_hstt_template_versions (id),
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  unique (template_id, version)
);

create index billing_hstt_template_versions_template_idx
  on public.billing_hstt_template_versions (template_id, version desc);

-- ---------------------------------------------------------------------------
-- Contract -> template
-- ---------------------------------------------------------------------------
create table public.billing_contract_hstt_templates (
  contract_id uuid primary key references public.billing_contracts (id) on delete cascade,
  template_id uuid not null references public.billing_hstt_templates (id) on delete restrict,
  assigned_by uuid not null references public.profiles (id),
  assigned_at timestamptz not null default now()
);

create index billing_contract_hstt_templates_template_idx
  on public.billing_contract_hstt_templates (template_id);

-- ---------------------------------------------------------------------------
-- Download log
-- ---------------------------------------------------------------------------
create table public.billing_hstt_exports (
  id                  uuid primary key default gen_random_uuid(),
  -- The log outlives contracts and calculations: links become null, the
  -- snapshot columns (contract code, customer, month) stay readable.
  contract_id         uuid references public.billing_contracts (id) on delete set null,
  calculation_id      uuid references public.billing_rent_calculations (id) on delete set null,
  contract_code       text not null,
  customer_name       text not null,
  period_month        text not null check (period_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- null = standard template; the version row is never deleted while logged.
  template_version_id uuid references public.billing_hstt_template_versions (id) on delete restrict,
  template_sha256     text not null check (template_sha256 ~ '^[0-9a-f]{64}$'),
  file_name           text not null,
  after_tax           bigint not null,
  closing_debt        bigint not null,
  exported_by         uuid not null references public.profiles (id),
  exported_at         timestamptz not null default now()
);

create index billing_hstt_exports_contract_idx
  on public.billing_hstt_exports (contract_id, exported_at desc);
create index billing_hstt_exports_version_idx
  on public.billing_hstt_exports (template_version_id);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Templates: identity is immutable; retiring is blocked while a contract
-- uses the template (unassign first) and stamps who/when.
-- SECURITY DEFINER so the "assigned" check sees every assignment.
create or replace function public.billing_hstt_template_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contracts text;
begin
  if new.id is distinct from old.id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Không được sửa mã, người tạo hoặc thời gian tạo của mẫu HSTT.';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'retired' then
      select string_agg(c.code, ', ' order by c.code) into v_contracts
      from public.billing_contract_hstt_templates a
      join public.billing_contracts c on c.id = a.contract_id
      where a.template_id = old.id;
      if v_contracts is not null then
        raise exception 'Mẫu đang được gán cho hợp đồng: %. Bỏ gán trước khi ngừng dùng.', v_contracts
          using errcode = '23503';
      end if;
      new.retired_by := auth.uid();
      new.retired_at := now();
    else
      new.retired_by := null;
      new.retired_at := null;
    end if;
  else
    new.retired_by := old.retired_by;
    new.retired_at := old.retired_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.billing_hstt_template_guard() from public, anon, authenticated;

create trigger billing_hstt_templates_guard
  before update on public.billing_hstt_templates
  for each row execute function public.billing_hstt_template_guard();

-- Assignments: only an active template that has at least one version.
create or replace function public.billing_contract_hstt_template_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.billing_hstt_templates t
    where t.id = new.template_id and t.status = 'active'
      and exists (select 1 from public.billing_hstt_template_versions v where v.template_id = t.id)
  ) then
    raise exception 'Mẫu HSTT đã ngừng dùng hoặc chưa có file, không gán được.' using errcode = '23514';
  end if;
  new.assigned_by := auth.uid();
  new.assigned_at := now();
  return new;
end;
$$;

revoke execute on function public.billing_contract_hstt_template_guard() from public, anon, authenticated;

create trigger billing_contract_hstt_templates_guard
  before insert or update on public.billing_contract_hstt_templates
  for each row execute function public.billing_contract_hstt_template_guard();

-- ---------------------------------------------------------------------------
-- RPC: store an uploaded (and checked) template file as the next version,
-- creating the template when p_template_id is null — one transaction.
-- The app uploads the object to Storage first and removes it if this fails.
--
-- p_file: {"storage_path", "file_name", "size_bytes", "sha256", "note",
--          "reused_from"}
-- Returns {"template_id", "version_id", "version"}.
--
-- The same content may be stored again: there is NO uniqueness on sha256.
-- "Dùng lại phiên bản này" copies the old version's file to a new storage
-- path and calls this with p_file.reused_from = that version's id (same
-- template, same sha256, checked here); the result is a new, highest
-- version, so it becomes the current one. History is never rewritten.
--
-- SECURITY INVOKER (default): the RLS below still applies.
-- ---------------------------------------------------------------------------
create or replace function public.billing_add_hstt_template_version(
  p_template_id uuid,
  p_name        text,
  p_file        jsonb,
  p_report      jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_template uuid := p_template_id;
  v_reused   uuid := nullif(p_file ->> 'reused_from', '')::uuid;
  v_version  integer;
  v_id       uuid;
begin
  if not private.is_admin() then
    raise exception 'Chỉ admin được tải lên mẫu HSTT.' using errcode = '42501';
  end if;

  if v_template is null then
    insert into public.billing_hstt_templates (name, created_by)
    values (btrim(p_name), auth.uid())
    returning id into v_template;
  elsif not exists (
    select 1 from public.billing_hstt_templates t where t.id = v_template and t.status = 'active'
  ) then
    raise exception 'Mẫu HSTT không tồn tại hoặc đã ngừng dùng.' using errcode = '23514';
  end if;

  if v_reused is not null and not exists (
    select 1 from public.billing_hstt_template_versions v
    where v.id = v_reused and v.template_id = v_template and v.sha256 = p_file ->> 'sha256'
  ) then
    raise exception 'Phiên bản dùng lại không thuộc mẫu này hoặc khác nội dung file.' using errcode = '23514';
  end if;

  -- Serialise uploads of the same template (version numbering).
  perform pg_advisory_xact_lock(hashtext('billing_hstt_template:' || v_template::text));

  select coalesce(max(v.version), 0) + 1 into v_version
  from public.billing_hstt_template_versions v
  where v.template_id = v_template;

  insert into public.billing_hstt_template_versions (
    template_id, version, storage_path, file_name, size_bytes, sha256, report, note, reused_from, created_by
  ) values (
    v_template,
    v_version,
    p_file ->> 'storage_path',
    p_file ->> 'file_name',
    (p_file ->> 'size_bytes')::bigint,
    p_file ->> 'sha256',
    p_report,
    coalesce(p_file ->> 'note', ''),
    v_reused,
    auth.uid()
  )
  returning id into v_id;

  return jsonb_build_object('template_id', v_template, 'version_id', v_id, 'version', v_version);
end;
$$;

revoke execute on function public.billing_add_hstt_template_version(uuid, text, jsonb, jsonb) from public, anon;
grant  execute on function public.billing_add_hstt_template_version(uuid, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.billing_hstt_templates          enable row level security;
alter table public.billing_hstt_template_versions  enable row level security;
alter table public.billing_contract_hstt_templates enable row level security;
alter table public.billing_hstt_exports            enable row level security;

-- Templates: viewers read; admins create / rename / retire / delete. Delete
-- fails (FK) while the template is assigned or one of its versions is logged.
drop policy if exists billing_hstt_templates_select on public.billing_hstt_templates;
create policy billing_hstt_templates_select on public.billing_hstt_templates
  for select to authenticated using ((select private.is_billing_viewer()));

drop policy if exists billing_hstt_templates_insert on public.billing_hstt_templates;
create policy billing_hstt_templates_insert on public.billing_hstt_templates
  for insert to authenticated
  with check ((select private.is_admin()) and created_by = (select auth.uid()) and status = 'active');

drop policy if exists billing_hstt_templates_update on public.billing_hstt_templates;
create policy billing_hstt_templates_update on public.billing_hstt_templates
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists billing_hstt_templates_delete on public.billing_hstt_templates;
create policy billing_hstt_templates_delete on public.billing_hstt_templates
  for delete to authenticated using ((select private.is_admin()));

-- Versions: immutable (no update / delete policy; removed only with their template).
drop policy if exists billing_hstt_template_versions_select on public.billing_hstt_template_versions;
create policy billing_hstt_template_versions_select on public.billing_hstt_template_versions
  for select to authenticated using ((select private.is_billing_viewer()));

drop policy if exists billing_hstt_template_versions_insert on public.billing_hstt_template_versions;
create policy billing_hstt_template_versions_insert on public.billing_hstt_template_versions
  for insert to authenticated
  with check ((select private.is_admin()) and created_by = (select auth.uid()));

-- Assignments: viewers read; accountants + admins assign / change / remove.
drop policy if exists billing_contract_hstt_templates_select on public.billing_contract_hstt_templates;
create policy billing_contract_hstt_templates_select on public.billing_contract_hstt_templates
  for select to authenticated using ((select private.is_billing_viewer()));

drop policy if exists billing_contract_hstt_templates_insert on public.billing_contract_hstt_templates;
create policy billing_contract_hstt_templates_insert on public.billing_contract_hstt_templates
  for insert to authenticated with check ((select private.is_billing_user()));

drop policy if exists billing_contract_hstt_templates_update on public.billing_contract_hstt_templates;
create policy billing_contract_hstt_templates_update on public.billing_contract_hstt_templates
  for update to authenticated
  using ((select private.is_billing_user()))
  with check ((select private.is_billing_user()));

drop policy if exists billing_contract_hstt_templates_delete on public.billing_contract_hstt_templates;
create policy billing_contract_hstt_templates_delete on public.billing_contract_hstt_templates
  for delete to authenticated using ((select private.is_billing_user()));

-- Download log: viewers read and add their own rows; never changed or deleted.
drop policy if exists billing_hstt_exports_select on public.billing_hstt_exports;
create policy billing_hstt_exports_select on public.billing_hstt_exports
  for select to authenticated using ((select private.is_billing_viewer()));

drop policy if exists billing_hstt_exports_insert on public.billing_hstt_exports;
create policy billing_hstt_exports_insert on public.billing_hstt_exports
  for insert to authenticated
  with check ((select private.is_billing_viewer()) and exported_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: private bucket for template files (2 MiB, .xlsx only).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'billing-templates',
  'billing-templates',
  false,
  2097152, -- 2 MiB
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do nothing;
