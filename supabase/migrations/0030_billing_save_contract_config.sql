-- Atomic save of a billing contract's price lines + excluded MISA codes.
--
-- The editor replaces the whole list at once. Doing that as separate
-- delete/insert calls from the app could leave a contract with no prices if
-- the insert failed half-way; here it is one transaction.
--
-- SECURITY INVOKER (the default): runs as the caller, so the RLS policies
-- from 0028 still apply. The explicit check only gives a clearer error.
--
-- p_items: [{ "name": text, "unit": text, "unit_price": int, "ma_hang": [text] }, ...]
-- in display order (sort_order is assigned from the array position).

create or replace function public.billing_save_contract_config(
  p_contract_id uuid,
  p_items jsonb,
  p_excluded text[]
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not private.is_billing_user() then
    raise exception 'Không có quyền sửa hợp đồng.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.billing_contracts where id = p_contract_id) then
    raise exception 'Không tìm thấy hợp đồng.' using errcode = 'P0002';
  end if;

  delete from public.billing_contract_items where contract_id = p_contract_id;
  insert into public.billing_contract_items (contract_id, name, unit, unit_price, ma_hang, sort_order)
  select
    p_contract_id,
    x.item ->> 'name',
    x.item ->> 'unit',
    (x.item ->> 'unit_price')::integer,
    array(select jsonb_array_elements_text(x.item -> 'ma_hang')),
    x.ord::integer
  from jsonb_array_elements(p_items) with ordinality as x(item, ord);

  delete from public.billing_excluded_codes where contract_id = p_contract_id;
  insert into public.billing_excluded_codes (contract_id, ma_hang)
  select p_contract_id, c from unnest(coalesce(p_excluded, '{}')) as c;

  update public.billing_contracts set updated_at = now() where id = p_contract_id;
end;
$$;

revoke execute on function public.billing_save_contract_config(uuid, jsonb, text[]) from public, anon;
grant  execute on function public.billing_save_contract_config(uuid, jsonb, text[]) to authenticated;
