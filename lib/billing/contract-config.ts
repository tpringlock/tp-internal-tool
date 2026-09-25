import type { BillingContract, BillingContractItem } from "@/lib/db/types";
import type { ContractConfig, Ledger, Period } from "./types";

/**
 * Build the engine's ContractConfig from the billing_* rows. Items are ordered
 * by sort_order (then name) because that is the line order on the HSTT.
 * `id` is the human-readable contract code, which the engine quotes in its
 * error messages.
 */
export function toContractConfig(
  contract: Pick<BillingContract, "code" | "customer_name" | "project_name" | "contract_no" | "misa_kho">,
  items: Pick<BillingContractItem, "name" | "unit" | "unit_price" | "ma_hang" | "sort_order">[],
  excludedCodes: string[],
): ContractConfig {
  return {
    id: contract.code,
    customerName: contract.customer_name,
    projectName: contract.project_name,
    contractNo: contract.contract_no,
    misaKho: contract.misa_kho,
    items: [...items]
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "vi"))
      .map((i) => ({ name: i.name, unit: i.unit, unitPrice: i.unit_price, maHang: [...i.ma_hang] })),
    excludedMaHang: [...excludedCodes].sort(),
  };
}

export interface UnknownCode {
  maHang: string;
  tenHang: string;
}

/**
 * Codes in the contract's warehouse that the engine would reject (activity up
 * to the end of the period, but neither priced nor excluded). Mirrors the
 * check in buildRentInput so the UI can offer "add to contract" instead of
 * only showing the engine's error text.
 */
export function findUnknownCodes(ledger: Ledger, contract: ContractConfig, period: Period): UnknownCode[] {
  const known = new Set([...contract.items.flatMap((i) => i.maHang), ...contract.excludedMaHang]);
  const found = new Map<string, string>();
  const add = (maHang: string, tenHang: string) => {
    if (!known.has(maHang) && !found.has(maHang)) found.set(maHang, tenHang);
  };
  for (const o of ledger.openings) {
    if (o.kho === contract.misaKho && o.qty !== 0) add(o.maHang, o.tenHang);
  }
  for (const m of ledger.movements) {
    if (m.kho === contract.misaKho && m.date <= period.to) add(m.maHang, m.tenHang);
  }
  return [...found]
    .map(([maHang, tenHang]) => ({ maHang, tenHang }))
    .sort((a, b) => a.maHang.localeCompare(b.maHang));
}

/** "VT0022, VT0090\nVT0091" -> ["VT0022", "VT0090", "VT0091"] (trimmed, de-duplicated, order kept). */
export function parseCodeList(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))];
}

/**
 * MISA codes that appear more than once across a contract's lines and
 * excluded list. Each code must map to exactly one line (or be excluded),
 * otherwise quantities would be counted twice.
 */
export function findDuplicateCodes(itemCodes: string[][], excludedCodes: string[] = []): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const code of [...itemCodes.flat(), ...excludedCodes]) {
    if (seen.has(code)) dup.add(code);
    seen.add(code);
  }
  return [...dup].sort();
}

/**
 * Ledger warnings relevant to one warehouse. Parser/merge warnings that name
 * a "KHO/MA" pair are kept only for this warehouse (a MISA export covers
 * ~200 warehouses); warnings that name no warehouse are always kept.
 * Warehouse codes may contain spaces and dots ("319.5 - 1"), so the patterns
 * follow the exact sentences in misa-parser.ts and merge-ledgers.ts and take
 * everything up to the last "/" as the warehouse.
 */
const WAREHOUSE_WARNING = [
  /^Dòng \d+ \((.+)\/[^/]+\):/, // misa-parser: running balance mismatch
  /^Tồn đầu \S+ của (.+)\/[^/\s]+ trong file sau/, // merge-ledgers: opening mismatch
];

export function warningsForWarehouse(warnings: string[], misaKho: string): string[] {
  return warnings.filter((w) => {
    for (const re of WAREHOUSE_WARNING) {
      const m = re.exec(w);
      if (m) return m[1] === misaKho;
    }
    return true;
  });
}
