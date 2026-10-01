import type { ContractConfig } from "./types";

/** Display prefix that marks every demo contract. */
export const DEMO_PREFIX = "[GIẢ ĐỊNH] ";

/** Same collapse as misa-parser's normalizeCode (kept here to stay client-safe). */
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** "gia-dinh-Minh Trường - 4" -> "gia-dinh-minh-truong-4" (valid contract code). */
export function slugifyCode(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface DemoContractRow {
  code: string;
  customer_name: string;
  project_name: string;
  contract_no: string;
  misa_kho: string;
  period_start_day: number;
  active: boolean;
  is_demo: true;
  /**
   * Flat price rows (billing_price_lines, 0036): one per code. The Excel
   * tool's names/units are stored as the MISA name/unit; excluded codes are
   * price-0 rows (not billed).
   */
  lines: {
    ma_vt: string;
    ten_vt: string;
    dvt: string;
    unit_price: number;
    print_name: string | null;
    print_dvt: string | null;
    note: string;
    sort_order: number;
  }[];
}

/**
 * Turn the Excel-tool seed (seed/gia-dinh-excel-contracts.json) into
 * billing_contracts rows: demo flag, "[GIẢ ĐỊNH] " prefix, a valid unique
 * code per contract, warehouse codes normalised like the parser.
 */
export function buildDemoContracts(contracts: ContractConfig[]): DemoContractRow[] {
  const used = new Set<string>();
  return contracts.map((c) => {
    const base = slugifyCode(c.id.startsWith("gia-dinh") ? c.id : `gia-dinh-${c.id}`) || "gia-dinh";
    let code = base.slice(0, 40);
    for (let n = 2; used.has(code); n++) code = `${base.slice(0, 36)}-${n}`;
    used.add(code);
    return {
      code,
      customer_name: DEMO_PREFIX + c.customerName,
      project_name: c.projectName,
      contract_no: c.contractNo,
      misa_kho: collapse(c.misaKho),
      period_start_day: 26,
      active: true,
      is_demo: true,
      lines: [
        ...c.items.flatMap((i, idx) =>
          i.maHang.map((code, j) => ({
            ma_vt: collapse(code),
            ten_vt: i.name,
            dvt: i.unit.trim(),
            unit_price: i.unitPrice,
            // Lines merging several codes keep printing as one HSTT line.
            print_name: i.maHang.length > 1 ? i.name : null,
            print_dvt: null,
            note: "",
            sort_order: (idx + 1) * 1000 + j + 1,
          })),
        ),
        ...c.excludedMaHang.map((code, k) => ({
          ma_vt: collapse(code),
          ten_vt: "",
          dvt: "",
          unit_price: 0,
          print_name: null,
          print_dvt: null,
          note: "Không tính tiền",
          sort_order: 999000 + k + 1,
        })),
      ],
    };
  });
}
