-- Billing: calculations over a custom date range (not a 26 -> 25 period).
--
-- A calculation now either belongs to a billing month (period_month set, the
-- one used for the payment dossier / HSTT) or covers an arbitrary range the
-- accountant picked for a quick look (period_month null). Range calculations
-- are saved as drafts so they can be reopened and exported, but they can
-- never be confirmed: confirming locks the HSTT figure for a billing month.

alter table public.billing_rent_calculations
  alter column period_month drop not null;

alter table public.billing_rent_calculations
  drop constraint if exists billing_calc_confirm_needs_month;
alter table public.billing_rent_calculations
  add constraint billing_calc_confirm_needs_month
  check (status = 'draft' or period_month is not null);
