-- B-2 (AUDIT_REPORT.md): the database must not trust the amount it is asked to
-- confirm.
--
-- Before: RLS lets any billing user UPDATE every column of a DRAFT calculation,
-- and billing_calc_guard (0027) only stamps confirmed_by/at. Through PostgREST a
-- billing user could rewrite total_amount / result / contract_snapshot of a
-- draft and then confirm it. The app never does this (drafts are only ever
-- inserted, then flipped to confirmed), so the app is unaffected.
--
-- After:
--   1. A draft's content is immutable. Only `status` (and the stamps the guard
--      sets) may change. To change anything: recalculate, which inserts a new
--      draft.
--   2. total_amount must equal result.totalAmount (within 0.5 VND) when a
--      calculation is inserted and again when a draft is confirmed.
--
-- What this does NOT prevent: someone with a billing token inserting a
-- brand-new draft whose `result` is entirely made up but self-consistent. The
-- database cannot recompute the engine (lib/billing/engine.ts). Mitigations
-- outside SQL: confirmed amounts are visible in the history and activity log
-- (billing.confirmed), and the verify script scripts/billing-verify-recalc.mts
-- recomputes confirmed periods from the stored files.
--
-- billing_calc_guard is replaced with its 0027 body plus the new draft rules;
-- ownership and the revoked EXECUTE grants are kept by CREATE OR REPLACE.
-- Existing rows are not touched or re-validated, so nothing already confirmed
-- can fail. Run supabase/revert/check-calc-total-consistency.sql first to see
-- whether any existing row would not satisfy rule 2.
-- Rollback: supabase/revert/0045_billing_calc_integrity.revert.sql

create or replace function public.billing_calc_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'voided' then
    raise exception 'Bản tính đã hủy, không thể sửa.';
  end if;

  if old.status = 'confirmed' then
    if new.status <> 'voided'
       or new.contract_id       is distinct from old.contract_id
       or new.period_month      is distinct from old.period_month
       or new.period_from       is distinct from old.period_from
       or new.period_to         is distinct from old.period_to
       or new.upload_ids        is distinct from old.upload_ids
       or new.contract_snapshot is distinct from old.contract_snapshot
       or new.excluded_ranges   is distinct from old.excluded_ranges
       or new.total_amount      is distinct from old.total_amount
       or new.result            is distinct from old.result
       or new.created_by        is distinct from old.created_by
       or new.confirmed_by      is distinct from old.confirmed_by
       or new.confirmed_at      is distinct from old.confirmed_at then
      raise exception 'Bản tính đã xác nhận, không thể sửa. Hãy tạo bản tính mới.';
    end if;
    new.voided_by := auth.uid();
    new.voided_at := now();
    return new;
  end if;

  -- old.status = 'draft'
  if new.status = 'voided' then
    raise exception 'Chỉ bản tính đã xác nhận mới có thể hủy.';
  end if;

  -- NEW (0045): the content of a draft never changes.
  if new.contract_id       is distinct from old.contract_id
     or new.period_month      is distinct from old.period_month
     or new.period_from       is distinct from old.period_from
     or new.period_to         is distinct from old.period_to
     or new.upload_ids        is distinct from old.upload_ids
     or new.contract_snapshot is distinct from old.contract_snapshot
     or new.excluded_ranges   is distinct from old.excluded_ranges
     or new.total_amount      is distinct from old.total_amount
     or new.result            is distinct from old.result
     or new.created_by        is distinct from old.created_by
     or new.created_at        is distinct from old.created_at then
    raise exception 'Bản nháp không được sửa nội dung. Hãy tính lại để tạo bản nháp mới.';
  end if;

  if new.status = 'confirmed' then
    -- NEW (0045): the amount being confirmed must be the one in the result.
    if new.result -> 'totalAmount' is null
       or jsonb_typeof(new.result -> 'totalAmount') <> 'number'
       or abs(new.total_amount - (new.result ->> 'totalAmount')::numeric) >= 0.5 then
      raise exception 'Tổng tiền không khớp với kết quả tính, không thể xác nhận. Hãy tính lại.';
    end if;
    new.confirmed_by := auth.uid();
    new.confirmed_at := now();
  else
    new.confirmed_by := null;
    new.confirmed_at := null;
  end if;
  new.voided_by := null;
  new.voided_at := null;
  return new;
end;
$$;

-- Same check at insert time, so an inconsistent draft cannot even be stored.
create or replace function public.billing_calc_insert_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.result -> 'totalAmount' is null
     or jsonb_typeof(new.result -> 'totalAmount') <> 'number'
     or abs(new.total_amount - (new.result ->> 'totalAmount')::numeric) >= 0.5 then
    raise exception 'Tổng tiền không khớp với kết quả tính.';
  end if;
  return new;
end;
$$;

revoke execute on function public.billing_calc_insert_guard() from public, anon, authenticated;

drop trigger if exists billing_rent_calculations_insert_guard on public.billing_rent_calculations;
create trigger billing_rent_calculations_insert_guard
  before insert on public.billing_rent_calculations
  for each row execute function public.billing_calc_insert_guard();
