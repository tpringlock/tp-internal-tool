-- B-1 (AUDIT_REPORT.md): lock the HSTT period data once the period is confirmed.
--
-- The rule "a period with a confirmed calculation cannot be edited" lived only
-- in the server action savePeriodInputs (periodEditBlock). The tables are
-- writable by every billing user through RLS (0038), so a direct PostgREST
-- call could change transport, deductions, payments or the typed opening debt
-- of a confirmed period, and the HSTT downloaded afterwards would no longer
-- match the one already sent to the customer.
--
-- This moves the rule into the database. A row of billing_period_inputs
-- (keyed contract_id + period_from), and its billing_period_transport /
-- billing_period_deductions children, can no longer be inserted, updated or
-- deleted while a CONFIRMED calculation exists for that contract and period.
-- To edit, an admin voids the confirmation first (unchanged workflow; the
-- app already tells the user so). Applies to every role, admin included.
--
-- Scope: only the three per-period tables the app already locks. Contract-level
-- tables (billing_contract_hstt, advances, transport prices, customers) stay
-- editable, as in the app today.
--
-- Triggers only: no table, column or existing row is changed.
-- Rollback: supabase/revert/0044_billing_period_lock.revert.sql

create or replace function private.billing_period_confirmed(p_contract uuid, p_from date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.billing_rent_calculations c
    where c.contract_id = p_contract
      and c.period_from = p_from
      and c.status = 'confirmed'
  );
$$;

revoke execute on function private.billing_period_confirmed(uuid, date) from public, anon, authenticated;

-- billing_period_inputs ------------------------------------------------------
create or replace function public.billing_period_inputs_lock_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE')
     and private.billing_period_confirmed(old.contract_id, old.period_from) then
    raise exception 'Kỳ này đã có bản tính xác nhận, không thể sửa dữ liệu kỳ. Hãy hủy xác nhận trước.'
      using errcode = '42501';
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and private.billing_period_confirmed(new.contract_id, new.period_from) then
    raise exception 'Kỳ này đã có bản tính xác nhận, không thể sửa dữ liệu kỳ. Hãy hủy xác nhận trước.'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.billing_period_inputs_lock_guard() from public, anon, authenticated;

drop trigger if exists billing_period_inputs_lock_guard on public.billing_period_inputs;
create trigger billing_period_inputs_lock_guard
  before insert or update or delete on public.billing_period_inputs
  for each row execute function public.billing_period_inputs_lock_guard();

-- billing_period_transport / billing_period_deductions (children) ---------------
-- When the parent input row is being deleted by a cascade it is already gone
-- here, so `found` is false and the delete goes through; the parent's own guard
-- has already run for that delete.
create or replace function public.billing_period_child_lock_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract uuid;
  v_from date;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select i.contract_id, i.period_from into v_contract, v_from
    from public.billing_period_inputs i
    where i.id = old.period_input_id;
    if found and private.billing_period_confirmed(v_contract, v_from) then
      raise exception 'Kỳ này đã có bản tính xác nhận, không thể sửa dữ liệu kỳ. Hãy hủy xác nhận trước.'
        using errcode = '42501';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select i.contract_id, i.period_from into v_contract, v_from
    from public.billing_period_inputs i
    where i.id = new.period_input_id;
    if found and private.billing_period_confirmed(v_contract, v_from) then
      raise exception 'Kỳ này đã có bản tính xác nhận, không thể sửa dữ liệu kỳ. Hãy hủy xác nhận trước.'
        using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.billing_period_child_lock_guard() from public, anon, authenticated;

drop trigger if exists billing_period_transport_lock_guard on public.billing_period_transport;
create trigger billing_period_transport_lock_guard
  before insert or update or delete on public.billing_period_transport
  for each row execute function public.billing_period_child_lock_guard();

drop trigger if exists billing_period_deductions_lock_guard on public.billing_period_deductions;
create trigger billing_period_deductions_lock_guard
  before insert or update or delete on public.billing_period_deductions
  for each row execute function public.billing_period_child_lock_guard();
