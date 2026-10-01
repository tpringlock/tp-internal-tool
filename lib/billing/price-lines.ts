import type { BillingContract, BillingPriceLine } from "@/lib/db/types";
import type { ContractConfig, ContractItem } from "./types";

/**
 * Flat price table (billing_price_lines, 0036) -> the engine's
 * ContractConfig. The engine is unchanged; these rules are mirrored by the
 * 0037 self-check and the 0037 revert script, so keep them in sync:
 *
 *   * unit_price = 0 -> the code is not billed (excludedMaHang);
 *   * unit_price > 0 -> grouped into HSTT lines by printed name
 *       coalesce(print_name, ten_vt || null, ma_vt)
 *     with printed unit coalesce(print_dvt, dvt || null) (first non-empty in
 *     sort order). The rows of a group must share the price, and their
 *     non-empty printed units must agree;
 *   * line order = smallest sort_order of the group (ties: name), code order
 *     inside a line = sort_order.
 *
 * Client-safe (no exceljs).
 */

export type PriceLineFields = Pick<
  BillingPriceLine,
  "ma_vt" | "ten_vt" | "dvt" | "unit_price" | "print_name" | "print_dvt" | "sort_order"
>;

/** Name printed on the HSTT for this row. */
export function printedName(l: Pick<PriceLineFields, "ma_vt" | "ten_vt" | "print_name">): string {
  return l.print_name || l.ten_vt || l.ma_vt;
}

/** Unit printed on the HSTT for this row, or null when unknown. */
export function printedUnit(l: Pick<PriceLineFields, "dvt" | "print_dvt">): string | null {
  return l.print_dvt || l.dvt || null;
}

export interface PriceGroupConflict {
  /** Printed name shared by the rows. */
  name: string;
  codes: string[];
  /** Distinct prices (more than one = conflict). */
  prices: number[];
  /** Distinct non-empty printed units (more than one = conflict). */
  units: string[];
}

export interface GroupedPriceLines {
  items: ContractItem[];
  /** Codes with price 0, sorted. */
  excluded: string[];
  conflicts: PriceGroupConflict[];
}

const byOrder = <T extends Pick<PriceLineFields, "sort_order" | "ma_vt">>(a: T, b: T) =>
  a.sort_order - b.sort_order || (a.ma_vt < b.ma_vt ? -1 : a.ma_vt > b.ma_vt ? 1 : 0);

export function groupPriceLines(lines: readonly PriceLineFields[]): GroupedPriceLines {
  const sorted = [...lines].sort(byOrder);
  const excluded = sorted.filter((l) => l.unit_price === 0).map((l) => l.ma_vt).sort();

  const groups = new Map<string, PriceLineFields[]>();
  for (const l of sorted) {
    if (l.unit_price === 0) continue;
    const name = printedName(l);
    groups.set(name, [...(groups.get(name) ?? []), l]);
  }

  const conflicts: PriceGroupConflict[] = [];
  const items = [...groups]
    .map(([name, rows]) => {
      const prices = [...new Set(rows.map((r) => r.unit_price))];
      const units = [...new Set(rows.map(printedUnit).filter((u): u is string => u !== null))];
      if (prices.length > 1 || units.length > 1) {
        conflicts.push({ name, codes: rows.map((r) => r.ma_vt), prices, units });
      }
      return {
        first: rows[0].sort_order,
        item: { name, unit: units[0] ?? "", unitPrice: rows[0].unit_price, maHang: rows.map((r) => r.ma_vt) },
      };
    })
    .sort((a, b) => a.first - b.first || a.item.name.localeCompare(b.item.name, "vi"))
    .map((g) => g.item);

  return { items, excluded, conflicts };
}

/** Vietnamese description of a group conflict, for errors and the import preview. */
export function describeConflict(c: PriceGroupConflict): string {
  const parts: string[] = [];
  if (c.prices.length > 1) parts.push(`đơn giá khác nhau (${c.prices.join(", ")})`);
  if (c.units.length > 1) parts.push(`ĐVT in khác nhau (${c.units.join(", ")})`);
  return `Các mã ${c.codes.join(", ")} cùng in thành "${c.name}" nhưng ${parts.join(" và ")}.`;
}

export class PriceLinesError extends Error {}

/**
 * The engine config of a contract. `id` is the readable contract code, which
 * the engine quotes in its errors. Throws PriceLinesError when rows that
 * print as one HSTT line disagree on price or unit: calculating would
 * otherwise pick one of them silently.
 */
export function toContractConfigFromLines(
  contract: Pick<BillingContract, "code" | "customer_name" | "project_name" | "contract_no" | "misa_kho">,
  lines: readonly PriceLineFields[],
): ContractConfig {
  const { items, excluded, conflicts } = groupPriceLines(lines);
  if (conflicts.length > 0) {
    throw new PriceLinesError(
      `Bảng giá kho ${contract.misa_kho} chưa gộp được thành HSTT: ${conflicts.map(describeConflict).join(" ")}`,
    );
  }
  return {
    id: contract.code,
    customerName: contract.customer_name,
    projectName: contract.project_name,
    contractNo: contract.contract_no,
    misaKho: contract.misa_kho,
    items,
    excludedMaHang: excluded,
  };
}

/**
 * The flat rows of an old-style config, exactly as the 0037 cutover writes
 * them: the line name / unit go to print_name / print_dvt, the MISA name and
 * unit stay empty, sort_order = line position * 1000 + code position, and
 * excluded codes become price-0 rows after every line.
 */
export function flattenContractConfig(config: Pick<ContractConfig, "items" | "excludedMaHang">): PriceLineFields[] {
  const rows: PriceLineFields[] = config.items.flatMap((it, i) =>
    it.maHang.map((code, j) => ({
      ma_vt: code.replace(/\s+/g, " ").trim(),
      ten_vt: "",
      dvt: "",
      unit_price: it.unitPrice,
      print_name: it.name.trim() ? it.name : null,
      print_dvt: it.unit.trim() ? it.unit : null,
      sort_order: (i + 1) * 1000 + j + 1,
    })),
  );
  [...config.excludedMaHang].sort().forEach((code, k) =>
    rows.push({
      ma_vt: code.replace(/\s+/g, " ").trim(),
      ten_vt: "",
      dvt: "",
      unit_price: 0,
      print_name: null,
      print_dvt: null,
      sort_order: 999000 + k + 1,
    }),
  );
  return rows;
}
