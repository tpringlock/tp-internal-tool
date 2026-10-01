import type { PriceExportRow } from "./price-export";

/**
 * Sample rows of the price import template (docs/mau-nhap-don-gia.xlsx):
 * the real Viet Panel – Senci contract (prices from HSTT T08/2026), with the
 * MISA names/units and the HSTT print overrides that reproduce the current
 * HSTT exactly (price-export.test.ts checks this against the golden config).
 * Regenerate the file with `npx tsx scripts/make-price-template.mts`.
 */
const VP = {
  misa_kho: "VIETPANEL-01",
  misa_kho_name: "VIETPANEL HẢI DƯƠNG",
  contract_no: "0412/HĐKT2025/TP-VIETPANEL",
  customer_name: "CÔNG TY TNHH XÂY DỰNG VIỆT PANEL",
};

const row = (
  ma_vt: string,
  ten_vt: string,
  dvt: string,
  unit_price: number,
  print_name: string | null,
  print_dvt: string | null,
  note = "",
): PriceExportRow => ({ ...VP, ma_vt, ten_vt, dvt, unit_price, print_name, print_dvt, note });

export const PRICE_TEMPLATE_ROWS: readonly PriceExportRow[] = [
  row("VT0021", "Giáo ringlock 1.0m Kẽm", "cây", 85, "Giáo ringlock 1.0m Kẽm", "Cây"),
  row("VT0020", "Giáo ringlock 1.5m Kẽm", "cây", 125, "Giáo ringlock 1.5m Kẽm", "Cây"),
  row("VT0023", "Giáo ringlock 2.0m Kẽm", "cây", 159, "Giáo ringlock 2.0m Kẽm", "Cây"),
  row("VT0022", "Giáo ringlock 2.5m Kẽm", "cây", 185, "Giáo ringlock 2.5m Kẽm", "Cây"),
  row("VT0090", "Giáo RL 2.5m mạ kẽm nhúng nóng 3.2ly", "cây", 185, "Giáo ringlock 2.5m Kẽm", "Cây"),
  row("VT0008", "Giằng ngang ringlock 0.6m", "cây", 43, "Giằng ngang ringlock 0.6m", "Cái"),
  row("VT0069", "Giằng ngang ringlock 0.9m", "cây", 55, "Giằng ngang ringlock 0.9m", "Cái"),
  row("VT0064", "Giằng ngang ringlock 1.2m", "cây", 71, "Giằng ngang ringlock 1.2m", "Cái"),
  row("VT0091", "Giằng ngang ringlock 1.2m mạ kẽm nhúng nóng 2.75mm", "", 71, "Giằng ngang ringlock 1.2m", "Cái"),
  row("VT0053", "Kích đầu D38 L600 - Eku To", "cây", 70, "Kích U Ø38*(3,0ly - 4,5ly), L=600mm", "Cái"),
  row("VT0067", "Kích đầu D38 L600 - Ecu Tán - 4ly", "cây", 70, "Kích U Ø38*(3,0ly - 4,5ly), L=600mm", "Cái"),
  row("VT0048", "Kích chân D38 L600 - Eku To", "cây", 70, "Kích chân Ø38*(3,0ly - 4,5ly), L=600mm", "Cái"),
  row("VT0068", "Kích chân D38 L600 - Ecu Tán - 4ly", "cây", 70, "Kích chân Ø38*(3,0ly - 4,5ly), L=600mm", "Cái"),
  row("CCDC272", "Cùm xoay (khóa giáo)", "Cái", 45, "Khóa giáo xoay D48", "Cái"),
  row("PALLET", "Pallet đựng NVL", "Cái", 0, null, null, "Không tính tiền"),
  row("VT0094", "Pallet U", "cây", 0, null, null, "Không tính tiền"),
];
