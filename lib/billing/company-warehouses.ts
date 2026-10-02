import { normalizeCode } from "./text";

// Company warehouses ("kho công ty"): MISA warehouses that hold TP's own
// stock or stock TP rents FROM others, not a customer's project. The alert
// center lists their negative stock in a separate group and never asks for a
// contract for them.
//
// They are recognised ONLY by the explicit rules below, never guessed from
// the warehouse name. To add or remove one, edit this list (and the table in
// docs/billing-module.md); company-warehouses.test.ts pins the result for the
// MISA warehouse list of 08–09/2026.
//
// Matching: the MISA code after normalizeCode (trim, single spaces),
// case-insensitive.
//   exact  - the whole code
//   suffix - the code ends with the value
//   prefix - the code starts with the value

export interface CompanyWarehouseRule {
  match: "exact" | "suffix" | "prefix";
  value: string;
  /** Shown next to the warehouse ("Kho tổng TP"…). */
  reason: string;
}

export const COMPANY_WAREHOUSE_RULES: readonly CompanyWarehouseRule[] = [
  { match: "exact", value: "TP/PHÚ THỌ", reason: "Kho tổng TP (Phú Thọ)" },
  { match: "exact", value: "TP/ĐAN PHƯỢNG", reason: "Kho tổng TP (Đan Phượng)" },
  { match: "exact", value: "KHO068", reason: "Kho CCDC văn phòng" },
  { match: "suffix", value: "dithue", reason: "Kho đi thuê (mã kết thúc bằng \"dithue\")" },
  { match: "prefix", value: "NCC ", reason: "Kho nhà cung cấp (mã bắt đầu bằng \"NCC \")" },
];

const lower = (s: string) => s.normalize("NFC").toLocaleLowerCase("vi");

/** Why `kho` is a company warehouse (the first matching rule), or null for a project warehouse. */
export function companyWarehouseReason(
  kho: string,
  rules: readonly CompanyWarehouseRule[] = COMPANY_WAREHOUSE_RULES,
): string | null {
  const k = lower(normalizeCode(kho));
  for (const r of rules) {
    // The rule value is used as written (a prefix may end with a space).
    const v = lower(r.value);
    const hit = r.match === "exact" ? k === v : r.match === "suffix" ? k.endsWith(v) : k.startsWith(v);
    if (hit) return r.reason;
  }
  return null;
}
