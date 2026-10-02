import { findUnknownCodes } from "./ledger-checks";
import { normalizeCode } from "./misa-parser";
import { companyWarehouseReason, type CompanyWarehouseRule, COMPANY_WAREHOUSE_RULES } from "./company-warehouses";
import { buildPriceTable } from "./price-table";
import { sameText } from "./text";
import type { MisaCatalog } from "./misa-catalog";
import type { BillingContract, BillingPriceLine } from "@/lib/db/types";
import type { ContractConfig, IsoDate, Ledger, Period } from "./types";
import { ALERT_CATEGORIES, alertCategory, type BillingAlert } from "./alert-list";

export {
  ALERT_CATEGORIES,
  ALERT_KINDS,
  alertCategory,
  countAlerts,
  filterAlerts,
  type AlertCategory,
  type AlertFilter,
  type AlertKind,
  type BillingAlert,
} from "./alert-list";

// Alert center (feedback item 7, plan section 5). Read-only checks over the
// merged MISA ledger of a period and the price table. Server-side only (the
// parser pulls in exceljs). Rules:
//
// negative_stock  A (warehouse, code) whose end-of-day balance is below 0 on
//                 some day of the period (the balance at the period start
//                 included). One alert per pair, in one of two groups:
//                   "new"     - the balance at the period start is >= 0 and
//                               a voucher in the period takes it below 0:
//                               the first negative day, that day's outgoing
//                               vouchers, the lowest balance;
//                   "opening" - already below 0 at the period start (often
//                               an old MISA balance): the opening balance
//                               and the lowest balance. Company warehouses (company-warehouses.ts) are
//                 flagged `company` so the page groups them separately.
// missing_price   A contract's warehouse has a code with stock or movements
//                 (up to the period end) that has no price row at all, not
//                 even a 0đ one: the engine would refuse to calculate.
//                 Same check as the engine (findUnknownCodes).
// no_contract     A warehouse with stock or movements but no contract.
//                 Company warehouses are skipped. Demo contracts count only
//                 while "Hiện dữ liệu giả định" is on (the caller passes them
//                 only then), so they never hide a real gap.
// not_in_misa     A contract's warehouse, or a priced code, that is in none
//                 of the ACTIVE month files (merged catalog, the same one
//                 /billing/prices checks against): usually a code renamed
//                 in MISA (ZUHANG -> ZUHANG-chothue).
// name_mismatch   Item name / unit in the price table, or the contract's
//                 warehouse name, different from MISA (merged catalog).

export interface AlertContract {
  contract: Pick<BillingContract, "id" | "misa_kho" | "misa_kho_name" | "contract_no" | "customer_name" | "is_demo">;
  label: string;
  lines: Pick<
    BillingPriceLine,
    "id" | "contract_id" | "ma_vt" | "ten_vt" | "dvt" | "unit_price" | "print_name" | "print_dvt" | "note" | "sort_order"
  >[];
}

export interface AlertsInput {
  ledger: Ledger;
  period: Period;
  /** Contracts that count (real; demo ones only while the switch is on). */
  contracts: readonly AlertContract[];
  /** Merged catalog of the active month files, or null when there is none. */
  catalog: MisaCatalog | null;
  rules?: readonly CompanyWarehouseRule[];
}

const fmt = new Intl.NumberFormat("vi-VN");
const vnDate = (d: IsoDate) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** All alerts of a period, by category (ALERT_CATEGORIES order), project before company warehouses, then warehouse and code. */
export function buildAlerts(input: AlertsInput): BillingAlert[] {
  const { ledger, period } = input;
  const rules = input.rules ?? COMPANY_WAREHOUSE_RULES;
  const companyOf = new Map<string, string | null>();
  const company = (kho: string) => {
    if (!companyOf.has(kho)) companyOf.set(kho, companyWarehouseReason(kho, rules));
    return companyOf.get(kho)!;
  };
  const khoName = (kho: string) => ledger.warehouses[kho] ?? input.catalog?.warehouses[kho] ?? "";
  const contractsByKho = Map.groupBy(input.contracts, (c) => normalizeCode(c.contract.misa_kho));
  const owner = (kho: string) => contractsByKho.get(kho)?.[0] ?? null;
  const base = (kho: string, c: AlertContract | null) => ({
    kho,
    khoName: khoName(kho),
    company: company(kho),
    contractId: c?.contract.id ?? null,
    contractLabel: c?.label ?? null,
    isDemo: c?.contract.is_demo ?? false,
  });
  const alerts: BillingAlert[] = [];

  // --- negative_stock ------------------------------------------------------
  const names = new Map<string, string>();
  const opening = new Map<string, number>();
  for (const o of ledger.openings) {
    const key = `${o.kho}|${o.maHang}`;
    opening.set(key, (opening.get(key) ?? 0) + o.qty);
    if (!names.has(o.maHang)) names.set(o.maHang, o.tenHang);
  }
  const byPair = new Map<string, Map<IsoDate, { delta: number; out: Set<string> }>>();
  for (const m of ledger.movements) {
    if (m.date > period.to) continue;
    if (!names.has(m.maHang)) names.set(m.maHang, m.tenHang);
    const key = `${m.kho}|${m.maHang}`;
    let days = byPair.get(key);
    if (!days) byPair.set(key, (days = new Map()));
    const d = days.get(m.date) ?? { delta: 0, out: new Set<string>() };
    d.delta += m.nhap - m.xuat;
    if (m.xuat > 0 && m.soCt.trim()) d.out.add(m.soCt.trim());
    days.set(m.date, d);
  }
  for (const key of new Set([...opening.keys(), ...byPair.keys()])) {
    const i = key.lastIndexOf("|");
    const kho = key.slice(0, i);
    const ma = key.slice(i + 1);
    let bal = opening.get(key) ?? 0;
    const days = [...(byPair.get(key) ?? new Map()).entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    let k = 0;
    // Balance at the start of the period.
    for (; k < days.length && days[k][0] < period.from; k++) bal += days[k][1].delta;
    const openingBalance = bal;
    let first: { date: IsoDate; refs: string[] } | null = bal < 0 ? { date: period.from, refs: [] } : null;
    let lowest = bal;
    for (; k < days.length; k++) {
      const [date, d] = days[k];
      bal += d.delta;
      if (bal < 0 && !first) first = { date, refs: [...d.out].sort() };
      if (bal < lowest) lowest = bal;
    }
    if (!first) continue;
    const c = owner(kho);
    const group = openingBalance < 0 ? "opening" : "new";
    alerts.push({
      ...base(kho, c),
      kind: "negative_stock",
      maVt: ma,
      tenVt: names.get(ma) ?? null,
      negativeGroup: group,
      openingBalance,
      date: first.date,
      balance: lowest,
      refs: first.refs,
      message:
        group === "opening"
          ? `Âm sẵn từ đầu kỳ: tồn đầu kỳ (${vnDate(period.from)}) ${fmt.format(openingBalance)}; thấp nhất ${fmt.format(lowest)}.`
          : `Âm mới trong kỳ từ ngày ${vnDate(first.date)}${first.refs.length ? ` (phiếu ${first.refs.join(", ")})` : ""}; tồn đầu kỳ ${fmt.format(openingBalance)}, thấp nhất ${fmt.format(lowest)}.`,
    });
  }

  // Warehouses with stock or movements up to the period end.
  const active = new Set<string>();
  for (const o of ledger.openings) if (o.qty !== 0) active.add(o.kho);
  for (const m of ledger.movements) if (m.date <= period.to) active.add(m.kho);

  // --- missing_price ---------------------------------------------------------
  for (const c of input.contracts) {
    const kho = normalizeCode(c.contract.misa_kho);
    if (!(kho in ledger.warehouses)) continue; // reported as not_in_misa when absent everywhere
    const known: ContractConfig = {
      id: c.contract.id,
      customerName: "",
      projectName: "",
      contractNo: "",
      misaKho: c.contract.misa_kho,
      items: [{ name: "", unit: "", unitPrice: 0, maHang: c.lines.map((l) => l.ma_vt) }],
      excludedMaHang: [],
    };
    for (const u of findUnknownCodes(ledger, known, period)) {
      alerts.push({
        ...base(kho, c),
        kind: "missing_price",
        maVt: u.maHang,
        tenVt: u.tenHang,
        message: "Có tồn hoặc phát sinh nhưng chưa có dòng đơn giá (kể cả 0đ): tính tiền sẽ dừng.",
      });
    }
  }

  // --- no_contract -------------------------------------------------------------
  for (const kho of [...active].sort()) {
    if (contractsByKho.has(kho) || company(kho)) continue;
    alerts.push({
      ...base(kho, null),
      kind: "no_contract",
      maVt: null,
      tenVt: null,
      message: "Kho có hàng hoặc phát sinh trên MISA nhưng chưa có hợp đồng.",
    });
  }

  // --- not_in_misa + name_mismatch (price table vs merged catalog) ---------------
  if (input.catalog) {
    const catalog = input.catalog;
    const byId = new Map(input.contracts.map((c) => [c.contract.id, c]));
    const rows = buildPriceTable(
      input.contracts.map((c) => c.contract),
      input.contracts.flatMap((c) => c.lines),
      catalog,
    );
    for (const c of input.contracts) {
      const kho = normalizeCode(c.contract.misa_kho);
      const misaName = catalog.warehouses[kho];
      if (misaName === undefined) {
        alerts.push({
          ...base(kho, c),
          kind: "not_in_misa",
          maVt: null,
          tenVt: null,
          message: "Mã kho của hợp đồng không có trong file MISA nào đang dùng (MISA đổi mã kho?).",
        });
      } else if (c.contract.misa_kho_name.trim() && misaName && !sameText(misaName, c.contract.misa_kho_name)) {
        alerts.push({
          ...base(kho, c),
          kind: "name_mismatch",
          maVt: null,
          tenVt: null,
          message: `Tên kho trong hợp đồng "${c.contract.misa_kho_name}" khác MISA "${misaName}".`,
        });
      }
    }
    for (const r of rows) {
      const c = byId.get(r.contract_id)!;
      const kho = normalizeCode(r.misa_kho);
      if (r.codeNotInMisa) {
        alerts.push({
          ...base(kho, c),
          kind: "not_in_misa",
          maVt: r.ma_vt,
          tenVt: r.ten_vt || null,
          message: "Mã VT trong bảng giá không có trong file MISA nào đang dùng (MISA đổi mã?).",
        });
        continue;
      }
      const diffs: string[] = [];
      if (r.misaName !== null) diffs.push(r.ten_vt.trim() ? `tên "${r.ten_vt}" ≠ MISA "${r.misaName}"` : `chưa có tên VT (MISA: "${r.misaName}")`);
      if (r.misaDvt !== null) diffs.push(r.dvt.trim() ? `ĐVT "${r.dvt}" ≠ MISA "${r.misaDvt}"` : `chưa có ĐVT (MISA: "${r.misaDvt}")`);
      if (diffs.length === 0) continue;
      alerts.push({
        ...base(kho, c),
        kind: "name_mismatch",
        maVt: r.ma_vt,
        tenVt: r.misaName ?? r.ten_vt,
        message: `Bảng giá: ${diffs.join("; ")}.`,
      });
    }
  }

  const order = new Map(ALERT_CATEGORIES.map((k, i) => [k, i]));
  return alerts.sort(
    (a, b) =>
      order.get(alertCategory(a))! - order.get(alertCategory(b))! ||
      Number(a.company !== null) - Number(b.company !== null) ||
      a.kho.localeCompare(b.kho, "vi") ||
      (a.maVt ?? "").localeCompare(b.maVt ?? "", "vi"),
  );
}
