import { normalizeCode } from "./misa-parser";
import type { ContractConfig, Ledger, Period } from "./types";

// Checks that read a parsed MISA ledger. Server-side only in practice: they
// pull in misa-parser (exceljs), so keep them out of client-imported
// modules like contract-config.ts.

export interface UnknownCode {
  maHang: string;
  tenHang: string;
}

/**
 * Codes in the contract's warehouse that the engine would reject (activity up
 * to the end of the period, but neither priced nor excluded). Mirrors the
 * check in buildRentInput (codes compared after normalizeCode) so the UI can
 * offer "add to contract" instead of only showing the engine's error text.
 * A warehouse missing from the file yields [] and is left to the engine,
 * which stops with "Không tìm thấy kho …".
 */
export function findUnknownCodes(ledger: Ledger, contract: ContractConfig, period: Period): UnknownCode[] {
  const kho = normalizeCode(contract.misaKho);
  const known = new Set(
    [...contract.items.flatMap((i) => i.maHang), ...contract.excludedMaHang].map(normalizeCode),
  );
  const found = new Map<string, string>();
  const add = (maHang: string, tenHang: string) => {
    if (!known.has(maHang) && !found.has(maHang)) found.set(maHang, tenHang);
  };
  for (const o of ledger.openings) {
    if (o.kho === kho && o.qty !== 0) add(o.maHang, o.tenHang);
  }
  for (const m of ledger.movements) {
    if (m.kho === kho && m.date <= period.to) add(m.maHang, m.tenHang);
  }
  return [...found]
    .map(([maHang, tenHang]) => ({ maHang, tenHang }))
    .sort((a, b) => a.maHang.localeCompare(b.maHang));
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
  const kho = normalizeCode(misaKho);
  return warnings.filter((w) => {
    for (const re of WAREHOUSE_WARNING) {
      const m = re.exec(w);
      if (m) return m[1] === kho;
    }
    return true;
  });
}
