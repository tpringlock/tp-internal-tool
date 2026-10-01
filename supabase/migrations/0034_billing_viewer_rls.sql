-- "Chỉ xem" (billing_viewer, 0033): read access to the billing app.
--
-- Permission matrix (docs/ke-hoach-feedback-tp-2026-10.md, section 3):
--   read everything, download source files, export Excel -> viewer, accountant, admin
--   calculate, upload, import/edit prices, confirm      -> accountant, admin
--   replace a file used by a confirmed calculation,
--   delete data, period presets, templates              -> admin
--
-- Only the SELECT policies change here: they move from is_billing_user()
-- (admin + accountant) to is_billing_viewer() (admin + accountant + viewer).
-- Every INSERT / UPDATE / DELETE policy keeps is_billing_user() or
-- is_admin(), so a viewer cannot write even by calling PostgREST directly.
-- The app additionally checks the role in every server action.

create or replace function private.is_billing_viewer(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.role in ('admin', 'accountant', 'billing_viewer')
      and p.is_active
  );
$$;

revoke execute on function private.is_billing_viewer(uuid) from public;
grant  execute on function private.is_billing_viewer(uuid) to authenticated;

drop policy if exists billing_contracts_select on public.billing_contracts;
create policy billing_contracts_select on public.billing_contracts
  for select to authenticated using ((select private.is_billing_viewer()));

drop policy if exists billing_contract_items_select on public.billing_contract_items;
create policy billing_contract_items_select on public.billing_contract_items
  for select to authenticated using ((select private.is_billing_viewer()));

drop policy if exists billing_excluded_codes_select on public.billing_excluded_codes;
create policy billing_excluded_codes_select on public.billing_excluded_codes
  for select to authenticated using ((select private.is_billing_viewer()));

drop policy if exists billing_excluded_ranges_select on public.billing_excluded_ranges;
create policy billing_excluded_ranges_select on public.billing_excluded_ranges
  for select to authenticated using ((select private.is_billing_viewer()));

drop policy if exists billing_misa_uploads_select on public.billing_misa_uploads;
create policy billing_misa_uploads_select on public.billing_misa_uploads
  for select to authenticated using ((select private.is_billing_viewer()));

drop policy if exists billing_rent_calculations_select on public.billing_rent_calculations;
create policy billing_rent_calculations_select on public.billing_rent_calculations
  for select to authenticated using ((select private.is_billing_viewer()));
