-- REVERT of 0034_billing_viewer_rls.sql (and, in effect, 0033). NOT a
-- migration. Run by hand:
--   npx supabase db query --linked -f supabase/revert/0034_billing_viewer_rls.revert.sql
--
-- Revert 0035 and 0036 first: their policies use private.is_billing_viewer(),
-- so the DROP FUNCTION below fails (and rolls everything back) while they exist.
--
-- The 'billing_viewer' enum value from 0033 cannot be dropped (Postgres has
-- no DROP VALUE); it stays unused. Users who had it become 'employee'.

begin;

-- prevent_profile_privilege_change (0004) only lets admins or the service
-- role change a role; `db query` runs without a user, so act as the service
-- role for this transaction only (auth.role() reads this setting).
select set_config('request.jwt.claim.role', 'service_role', true);
update public.profiles set role = 'employee' where role = 'billing_viewer';

drop policy if exists billing_contracts_select on public.billing_contracts;
create policy billing_contracts_select on public.billing_contracts
  for select to authenticated using ((select private.is_billing_user()));

drop policy if exists billing_contract_items_select on public.billing_contract_items;
create policy billing_contract_items_select on public.billing_contract_items
  for select to authenticated using ((select private.is_billing_user()));

drop policy if exists billing_excluded_codes_select on public.billing_excluded_codes;
create policy billing_excluded_codes_select on public.billing_excluded_codes
  for select to authenticated using ((select private.is_billing_user()));

drop policy if exists billing_excluded_ranges_select on public.billing_excluded_ranges;
create policy billing_excluded_ranges_select on public.billing_excluded_ranges
  for select to authenticated using ((select private.is_billing_user()));

drop policy if exists billing_misa_uploads_select on public.billing_misa_uploads;
create policy billing_misa_uploads_select on public.billing_misa_uploads
  for select to authenticated using ((select private.is_billing_user()));

drop policy if exists billing_rent_calculations_select on public.billing_rent_calculations;
create policy billing_rent_calculations_select on public.billing_rent_calculations
  for select to authenticated using ((select private.is_billing_user()));

drop function private.is_billing_viewer(uuid);

commit;
