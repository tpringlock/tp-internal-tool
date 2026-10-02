-- Manual rollback of 0040_billing_period_presets.sql.
-- NOT a migration: run by hand (supabase db query --linked -f ...) only after
-- the owner agrees. Drops the period presets and the contracts' default
-- preset. Nothing that existed before 0040 is touched.
--
-- Afterwards remove the row from supabase_migrations.schema_migrations
-- (version 0040) so `db push` does not consider it applied.

begin;

drop table if exists public.billing_contract_period_presets;
drop table if exists public.billing_period_presets;

commit;
