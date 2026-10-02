-- Billing phase 3 seed: Bên B (TP) and the Việt Panel data needed to export
-- its HSTT, taken from the hand-made HSTT T08/2026 (docs/hstt/hstt-t08-2026-
-- vietpanel.xlsx, plan section 4).
--
-- INSERTS ONLY into the tables of 0038; nothing existing is updated. Aborts
-- (and rolls back everything in this file) unless there is exactly one REAL
-- contract 'vietpanel-senci' on warehouse VIETPANEL-01, and refuses to run
-- twice.
--
-- Rollback: supabase/revert/0038_billing_hstt.revert.sql (drops the tables).

do $$
declare
  v_contract uuid;
  v_customer uuid;
  v_n        integer;
begin
  select count(*) into v_n
  from public.billing_contracts
  where code = 'vietpanel-senci' and misa_kho = 'VIETPANEL-01' and not is_demo;
  if v_n <> 1 then
    raise exception '0039: cần đúng 1 hợp đồng thật vietpanel-senci / VIETPANEL-01, đang có %.', v_n;
  end if;
  select id into v_contract
  from public.billing_contracts
  where code = 'vietpanel-senci' and misa_kho = 'VIETPANEL-01' and not is_demo;

  if exists (select 1 from public.company_profile)
     or exists (select 1 from public.billing_contract_hstt where contract_id = v_contract) then
    raise exception '0039: dữ liệu HSTT đã có, không chạy lại.';
  end if;

  -- Bên B. Values exactly as printed in the T08/2026 HSTT (the short address
  -- and the payee name differ slightly from the full ones there; kept as-is).
  insert into public.company_profile (
    id, ten_in_hoa, ten_2_dong, ten_thuong, ten_thu_huong,
    dia_chi, dia_chi_ngan, dien_thoai, so_tk, ngan_hang, mst,
    dai_dien, chuc_vu, noi_lap
  ) values (
    1,
    'CÔNG TY CỔ PHẦN TẬP ĐOÀN THIẾT BỊ XÂY DỰNG TP',
    E'CÔNG TY CỔ PHẦN TẬP ĐOÀN\nTHIẾT BỊ XÂY DỰNG TP',
    'Công ty Cổ phần Tập đoàn Thiết bị xây dựng TP',
    'Công ty Cổ phần Tập đoàn Thiết bị Xây dựng TP',
    'Thôn Trung, xã Ô Diên, Thành phố Hà Nội, Việt Nam',
    'Thôn Trung, Xã Ô Diên, Thành phố Hà Nội',
    '02433250143',
    '8331100096008',
    'Ngân hàng Thương mại cổ phần Quân đội - Chi nhánh Hoàng Quốc Việt',
    '0105204346',
    'Ông Hữu Minh Tiến',
    'Phó Tổng giám đốc',
    'Hà Nội'
  );

  -- Bên A.
  insert into public.billing_customers (
    ten_in_hoa, ten_thuong, ten_rut_gon, dia_chi, dien_thoai,
    so_tk, ngan_hang, mst, dai_dien, chuc_vu
  ) values (
    'CÔNG TY TNHH XÂY DỰNG VIỆT PANEL',
    'Công ty TNHH xây dựng Việt Panel',
    'Việt Panel',
    'Thôn Đông Phù, Xã Tiên Du, Tỉnh Bắc Ninh, Việt Nam',
    '0222 6535 699',
    '616139999',
    'MB Ngân hàng quân đội',
    '2300856941',
    'Ông Lưu Đình Cải',
    'Giám đốc'
  )
  returning id into v_customer;

  -- Contract HSTT fields. Contract no. stays in billing_contracts.contract_no
  -- (0412/HĐKT2025/TP-VIETPANEL); the "Căn cứ" sentence is generated, so no
  -- override. Opening debt = closing debt of 08/2026 (last hand-made month).
  -- Advances note empty, like the T08 block (cell I299).
  insert into public.billing_contract_hstt (
    contract_id, customer_id, contract_type, contract_date,
    du_an_ten, du_an_dia_chi, can_cu_override, vat_percent, advances_note,
    opening_debt, opening_debt_month
  ) values (
    v_contract, v_customer, 'Hợp đồng kinh tế', date '2025-12-04',
    'Senci', 'KCN Phúc Điền, Hải Dương', null, 8, '',
    2906447532, '2026-08'
  );

  -- Transport price list.
  insert into public.billing_transport_prices (contract_id, name, unit, unit_price, sort_order) values
    (v_contract, 'Vận chuyển xe sơ mi 30 tấn', 'Chuyến', 5000000, 1),
    (v_contract, 'Vận chuyển xe thùng 15 tấn', 'Chuyến', 4500000, 2);

  -- Advances: ĐCCN line 1 is "=1255054014+424319720" (= 1.679.373.734).
  insert into public.billing_contract_advances (contract_id, amount, sort_order) values
    (v_contract, 1255054014, 1),
    (v_contract, 424319720, 2);

  -- Self-check.
  if (select sum(amount) from public.billing_contract_advances where contract_id = v_contract) <> 1679373734 then
    raise exception '0039: tổng tạm ứng sai.';
  end if;
end;
$$;
