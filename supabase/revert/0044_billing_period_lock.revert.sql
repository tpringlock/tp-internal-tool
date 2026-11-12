-- Hand-written revert for 0044 (NOT a migration; do not place in migrations/).
-- Removes the period lock triggers and their functions. No data is touched.
-- After this, the lock exists only in the server action again (audit B-1).

drop trigger if exists billing_period_deductions_lock_guard on public.billing_period_deductions;
drop trigger if exists billing_period_transport_lock_guard   on public.billing_period_transport;
drop trigger if exists billing_period_inputs_lock_guard      on public.billing_period_inputs;

drop function if exists public.billing_period_child_lock_guard();
drop function if exists public.billing_period_inputs_lock_guard();
drop function if exists private.billing_period_confirmed(uuid, date);
