-- Manual rollback of 0038_billing_hstt.sql + 0039_billing_hstt_seed_vietpanel.sql.
-- NOT a migration: run by hand (supabase db query --linked -f ...) only after
-- the owner agrees. Drops the HSTT tables and everything typed into them
-- (company profile, customers, transport prices, advances, period inputs).
-- Nothing that existed before 0038 is touched.
--
-- Afterwards remove the two rows from supabase_migrations.schema_migrations
-- (versions 0038, 0039) so `db push` does not consider them applied.

begin;

drop table if exists public.billing_period_deductions;
drop table if exists public.billing_period_transport;
drop table if exists public.billing_period_inputs;
drop table if exists public.billing_contract_advances;
drop table if exists public.billing_transport_prices;
drop table if exists public.billing_contract_hstt;
drop table if exists public.billing_customers;
drop table if exists public.company_profile;

commit;
