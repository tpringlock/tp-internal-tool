-- RLS for the billing app tables (0027). Only admins and active accountants
-- (private.is_billing_user) can see or change anything; everyone else gets
-- zero rows. Deleting a contract or an uploaded MISA file is admin-only,
-- deleting a calculation is limited to drafts, and voiding a confirmed
-- calculation is admin-only (the lifecycle itself is enforced by the
-- billing_calc_guard trigger).
--
-- Style matches 0014/0017: helpers wrapped in a scalar subselect (evaluated
-- once per statement), one policy per command, drop-if-exists first.

alter table public.billing_contracts         enable row level security;
alter table public.billing_contract_items    enable row level security;
alter table public.billing_excluded_codes    enable row level security;
alter table public.billing_excluded_ranges   enable row level security;
alter table public.billing_misa_uploads      enable row level security;
alter table public.billing_rent_calculations enable row level security;

-- ===========================================================================
-- billing_contracts: billing users read/insert/update; delete admin-only.
-- ===========================================================================
drop policy if exists billing_contracts_select on public.billing_contracts;
create policy billing_contracts_select on public.billing_contracts
  for select to authenticated using ((select private.is_billing_user()));

drop policy if exists billing_contracts_insert on public.billing_contracts;
create policy billing_contracts_insert on public.billing_contracts
  for insert to authenticated with check ((select private.is_billing_user()));

drop policy if exists billing_contracts_update on public.billing_contracts;
create policy billing_contracts_update on public.billing_contracts
  for update to authenticated
  using ((select private.is_billing_user()))
  with check ((select private.is_billing_user()));

drop policy if exists billing_contracts_delete on public.billing_contracts;
create policy billing_contracts_delete on public.billing_contracts
  for delete to authenticated using ((select private.is_admin()));

-- ===========================================================================
-- Contract configuration (items, excluded codes, excluded ranges): full
-- access for billing users.
-- ===========================================================================
drop policy if exists billing_contract_items_select on public.billing_contract_items;
create policy billing_contract_items_select on public.billing_contract_items
  for select to authenticated using ((select private.is_billing_user()));

drop policy if exists billing_contract_items_insert on public.billing_contract_items;
create policy billing_contract_items_insert on public.billing_contract_items
  for insert to authenticated with check ((select private.is_billing_user()));

drop policy if exists billing_contract_items_update on public.billing_contract_items;
create policy billing_contract_items_update on public.billing_contract_items
  for update to authenticated
  using ((select private.is_billing_user()))
  with check ((select private.is_billing_user()));

drop policy if exists billing_contract_items_delete on public.billing_contract_items;
create policy billing_contract_items_delete on public.billing_contract_items
  for delete to authenticated using ((select private.is_billing_user()));

drop policy if exists billing_excluded_codes_select on public.billing_excluded_codes;
create policy billing_excluded_codes_select on public.billing_excluded_codes
  for select to authenticated using ((select private.is_billing_user()));

drop policy if exists billing_excluded_codes_insert on public.billing_excluded_codes;
create policy billing_excluded_codes_insert on public.billing_excluded_codes
  for insert to authenticated with check ((select private.is_billing_user()));

drop policy if exists billing_excluded_codes_delete on public.billing_excluded_codes;
create policy billing_excluded_codes_delete on public.billing_excluded_codes
  for delete to authenticated using ((select private.is_billing_user()));

drop policy if exists billing_excluded_ranges_select on public.billing_excluded_ranges;
create policy billing_excluded_ranges_select on public.billing_excluded_ranges
  for select to authenticated using ((select private.is_billing_user()));

drop policy if exists billing_excluded_ranges_insert on public.billing_excluded_ranges;
create policy billing_excluded_ranges_insert on public.billing_excluded_ranges
  for insert to authenticated with check ((select private.is_billing_user()));

drop policy if exists billing_excluded_ranges_update on public.billing_excluded_ranges;
create policy billing_excluded_ranges_update on public.billing_excluded_ranges
  for update to authenticated
  using ((select private.is_billing_user()))
  with check ((select private.is_billing_user()));

drop policy if exists billing_excluded_ranges_delete on public.billing_excluded_ranges;
create policy billing_excluded_ranges_delete on public.billing_excluded_ranges
  for delete to authenticated using ((select private.is_billing_user()));

-- ===========================================================================
-- billing_misa_uploads: billing users read + insert (as themselves); files are
-- immutable (no update policy); delete admin-only.
-- ===========================================================================
drop policy if exists billing_misa_uploads_select on public.billing_misa_uploads;
create policy billing_misa_uploads_select on public.billing_misa_uploads
  for select to authenticated using ((select private.is_billing_user()));

drop policy if exists billing_misa_uploads_insert on public.billing_misa_uploads;
create policy billing_misa_uploads_insert on public.billing_misa_uploads
  for insert to authenticated
  with check (
    (select private.is_billing_user()) and uploaded_by = (select auth.uid())
  );

drop policy if exists billing_misa_uploads_delete on public.billing_misa_uploads;
create policy billing_misa_uploads_delete on public.billing_misa_uploads
  for delete to authenticated using ((select private.is_admin()));

-- ===========================================================================
-- billing_rent_calculations
--   insert: billing users, as themselves, always as a draft
--   update: drafts by any billing user; confirmed rows (-> voided) by admins
--   delete: drafts only
-- ===========================================================================
drop policy if exists billing_rent_calculations_select on public.billing_rent_calculations;
create policy billing_rent_calculations_select on public.billing_rent_calculations
  for select to authenticated using ((select private.is_billing_user()));

drop policy if exists billing_rent_calculations_insert on public.billing_rent_calculations;
create policy billing_rent_calculations_insert on public.billing_rent_calculations
  for insert to authenticated
  with check (
    (select private.is_billing_user())
    and created_by = (select auth.uid())
    and status = 'draft'
  );

drop policy if exists billing_rent_calculations_update on public.billing_rent_calculations;
create policy billing_rent_calculations_update on public.billing_rent_calculations
  for update to authenticated
  using (
    (select private.is_billing_user())
    and (status = 'draft' or (select private.is_admin()))
  )
  with check ((select private.is_billing_user()));

drop policy if exists billing_rent_calculations_delete on public.billing_rent_calculations;
create policy billing_rent_calculations_delete on public.billing_rent_calculations
  for delete to authenticated
  using ((select private.is_billing_user()) and status = 'draft');
