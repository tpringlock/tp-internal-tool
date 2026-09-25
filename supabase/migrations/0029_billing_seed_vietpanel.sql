-- Seed: Viet Panel contract, Senci project (MISA warehouse VIETPANEL-01).
-- Mirrors lib/billing/contracts/vietpanel-senci.ts, whose prices were
-- verified against 9 real payment dossiers (12/2025 -> 08/2026).
--
-- Kept in its own file so it can be applied to dev without touching prod.
-- Idempotent: does nothing if the contract code already exists.

do $$
declare
  cid uuid;
begin
  insert into public.billing_contracts
    (code, customer_name, project_name, contract_no, misa_kho, period_start_day, contract_start)
  values (
    'vietpanel-senci',
    'CÔNG TY TNHH XÂY DỰNG VIỆT PANEL',
    'Senci – KCN Phúc Điền, Hải Dương',
    '0412/HĐKT2025/TP-VIETPANEL',
    'VIETPANEL-01',
    26,
    '2025-12-20'
  )
  on conflict (code) do nothing
  returning id into cid;

  if cid is null then
    return; -- already seeded
  end if;

  insert into public.billing_contract_items (contract_id, name, unit, unit_price, ma_hang, sort_order)
  values
    (cid, 'Giáo ringlock 1.0m Kẽm',                 'Cây', 85,  array['VT0021'],             1),
    (cid, 'Giáo ringlock 1.5m Kẽm',                 'Cây', 125, array['VT0020'],             2),
    (cid, 'Giáo ringlock 2.0m Kẽm',                 'Cây', 159, array['VT0023'],             3),
    (cid, 'Giáo ringlock 2.5m Kẽm',                 'Cây', 185, array['VT0022', 'VT0090'],   4),
    (cid, 'Giằng ngang ringlock 0.6m',              'Cái', 43,  array['VT0008'],             5),
    (cid, 'Giằng ngang ringlock 0.9m',              'Cái', 55,  array['VT0069'],             6),
    (cid, 'Giằng ngang ringlock 1.2m',              'Cái', 71,  array['VT0064', 'VT0091'],   7),
    (cid, 'Kích U Ø38*(3,0ly - 4,5ly), L=600mm',    'Cái', 70,  array['VT0053', 'VT0067'],   8),
    (cid, 'Kích chân Ø38*(3,0ly - 4,5ly), L=600mm', 'Cái', 70,  array['VT0048', 'VT0068'],   9),
    (cid, 'Khóa giáo xoay D48',                     'Cái', 45,  array['CCDC272'],            10);

  insert into public.billing_excluded_codes (contract_id, ma_hang)
  values (cid, 'PALLET'), (cid, 'VT0094');
end;
$$;
