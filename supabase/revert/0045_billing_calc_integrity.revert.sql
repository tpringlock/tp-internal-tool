-- Hand-written revert for 0045 (NOT a migration; do not place in migrations/).
-- Restores billing_calc_guard exactly as 0027_billing.sql defined it and drops
-- the insert-time total check. No data is touched.

drop trigger if exists billing_rent_calculations_insert_guard on public.billing_rent_calculations;
drop function if exists public.billing_calc_insert_guard();

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
  if new.status = 'confirmed' then
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
