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
  items: { name: string; unit: string; unit_price: number; ma_hang: string[]; sort_order: number }[];
  excluded: string[];
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
      items: c.items.map((i, idx) => ({
        name: i.name,
        // 56 Excel rows have no unit; the app requires one (display only).
        unit: i.unit.trim() || "—",
        unit_price: i.unitPrice,
        ma_hang: i.maHang.map(collapse),
        sort_order: idx + 1,
      })),
      excluded: c.excludedMaHang.map(collapse),
    };
  });
}
