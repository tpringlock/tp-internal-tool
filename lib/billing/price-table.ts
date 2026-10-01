import { matchesSearch } from "@/lib/search";
import type { BillingContract, BillingPriceLine } from "@/lib/db/types";
import type { MisaCatalog } from "./misa-catalog";
import type { PriceExportRow } from "./price-export";
import { normalizeCode, sameText } from "./text";

/**
 * The flat price table as shown on /billing/prices and exported to Excel:
 * every price row of the real contracts with its contract columns and the
 * MISA cross-check flags. Pure; the page and the export route share it so
 * the export is exactly what the filters show.
 */

export interface PriceTableRow extends PriceExportRow {
  id: string;
  contract_id: string;
  sort_order: number;
  /** MISA flags (all false when there is no catalog). */
  khoNotInMisa: boolean;
  codeNotInMisa: boolean;
  /** MISA value when the stored name / unit differs from it, else null. */
  misaName: string | null;
  misaDvt: string | null;
}

export interface PriceTableFilter {
  /** Accent-insensitive words over warehouse, contract, customer, code and names. */
  q?: string;
  /** Contract id. */
  contract?: string;
  /** Only rows with a MISA difference. */
  issues?: boolean;
}

type ContractCols = Pick<BillingContract, "id" | "misa_kho" | "misa_kho_name" | "contract_no" | "customer_name">;
type LineCols = Pick<
  BillingPriceLine,
  "id" | "contract_id" | "ma_vt" | "ten_vt" | "dvt" | "unit_price" | "print_name" | "print_dvt" | "note" | "sort_order"
>;

export function hasMisaIssue(r: Pick<PriceTableRow, "khoNotInMisa" | "codeNotInMisa" | "misaName" | "misaDvt">): boolean {
  return r.khoNotInMisa || r.codeNotInMisa || r.misaName !== null || r.misaDvt !== null;
}

export function buildPriceTable(
  contracts: readonly ContractCols[],
  lines: readonly LineCols[],
  catalog: MisaCatalog | null,
  filter: PriceTableFilter = {},
): PriceTableRow[] {
  const byId = new Map(contracts.map((c) => [c.id, c]));
  const rows: PriceTableRow[] = [];
  for (const l of lines) {
    const c = byId.get(l.contract_id);
    if (!c) continue; // demo contract or not visible
    const kho = normalizeCode(c.misa_kho);
    const item = catalog?.items[l.ma_vt];
    const row: PriceTableRow = {
      id: l.id,
      contract_id: l.contract_id,
      sort_order: l.sort_order,
      misa_kho: c.misa_kho,
      misa_kho_name: c.misa_kho_name,
      contract_no: c.contract_no,
      customer_name: c.customer_name,
      ma_vt: l.ma_vt,
      ten_vt: l.ten_vt,
      dvt: l.dvt,
      unit_price: l.unit_price,
      print_name: l.print_name,
      print_dvt: l.print_dvt,
      note: l.note,
      khoNotInMisa: !!catalog && catalog.warehouses[kho] === undefined,
      codeNotInMisa: !!catalog && !item,
      misaName: item?.name && !sameText(item.name, l.ten_vt) ? item.name : null,
      misaDvt: item?.dvt && !sameText(item.dvt, l.dvt) ? item.dvt : null,
    };
    if (filter.contract && row.contract_id !== filter.contract) continue;
    if (filter.issues && !hasMisaIssue(row)) continue;
    if (
      filter.q &&
      !matchesSearch(
        [row.misa_kho, row.misa_kho_name, row.contract_no, row.customer_name, row.ma_vt, row.ten_vt, row.print_name, row.note],
        filter.q,
      )
    ) {
      continue;
    }
    rows.push(row);
  }
  return rows.sort(
    (a, b) =>
      a.misa_kho.localeCompare(b.misa_kho, "vi") || a.sort_order - b.sort_order || a.ma_vt.localeCompare(b.ma_vt, "vi"),
  );
}
