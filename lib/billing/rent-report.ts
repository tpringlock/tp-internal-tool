import { computeRentFromLedger } from "./engine";
import { normalizeCode } from "./misa-parser";
import { buildMisaCatalog } from "./misa-catalog";
import { warningsForWarehouse } from "./ledger-checks";
import { rangesForPeriod, type RangeRow } from "./periods";
import type { ContractConfig, Ledger, Period, RentResult } from "./types";

// Rent report over many projects (feedback items 5, 6; plan section 4):
// calculate every chosen contract over one period from one merged ledger,
// then total per MISA item code and list projects by amount. Read-only and
// pure (no database; server-side only, the parser pulls in exceljs); the
// engine is used as is.

export interface ReportContract {
  id: string;
  /** "Customer – Project (KHO)". */
  label: string;
  misaKho: string;
  isDemo: boolean;
  /** Engine config, or null when the price table can't be used (see configError). */
  config: ContractConfig | null;
  configError: string | null;
  /** This contract's period (a preset may shorten it by the contract start). */
  period: Period;
  /** Non-billable ranges of this contract + the global ones (rows as stored). */
  ranges: RangeRow[];
}

export interface ReportProject {
  contractId: string;
  label: string;
  misaKho: string;
  isDemo: boolean;
  period: Period;
  /** Rent for the period; null when it could not be calculated (see error). */
  total: number | null;
  error: string | null;
  warnings: string[];
}

export interface ReportCodeRow {
  maVt: string;
  name: string;
  unit: string;
  /** The same price in every project, or null when it differs ("Theo dự án"). */
  unitPrice: number | null;
  opening: number;
  /** Σ positive movements in the period (delivered to sites). */
  delivered: number;
  /** Σ negative movements in the period, as a positive number (returned). */
  returned: number;
  closing: number;
  /** Σ quantity × billed days. */
  qtyDays: number;
  amount: number;
  projectCount: number;
}

export interface RentReport {
  /** Projects: amount descending, then those that failed (with the reason). */
  projects: ReportProject[];
  /** Totals per MISA item code over the projects that calculated, by code. */
  codes: ReportCodeRow[];
  total: number;
  okCount: number;
  errorCount: number;
  demoCount: number;
  /** Engine result per contract id (only with `keepResults`, for the Excel export). */
  results?: Map<string, RentResult>;
}

/**
 * The ledger restricted to one warehouse. The engine only ever reads rows of
 * the contract's warehouse, so results are identical; it just avoids
 * scanning every row of a 200-warehouse file once per contract.
 */
export function splitLedgerByWarehouse(ledger: Ledger): Map<string, Ledger> {
  const out = new Map<string, Ledger>();
  const get = (kho: string) => {
    let l = out.get(kho);
    if (!l) {
      l = { ...ledger, openings: [], movements: [] };
      out.set(kho, l);
    }
    return l;
  };
  for (const o of ledger.openings) get(o.kho).openings.push(o);
  for (const m of ledger.movements) get(m.kho).movements.push(m);
  return out;
}

/**
 * The same contract with one engine line per MISA code (price-0 codes kept
 * as 0đ lines), named by the code. Every amount is quantity × days × price
 * per voucher, so the lines add up to the normal calculation; used only to
 * total quantities and money per code.
 */
export function perCodeConfig(config: ContractConfig): ContractConfig {
  const items = config.items.flatMap((it) =>
    it.maHang.map((code) => ({ name: normalizeCode(code), unit: it.unit, unitPrice: it.unitPrice, maHang: [code] })),
  );
  const priced = new Set(items.map((i) => i.name));
  for (const code of config.excludedMaHang) {
    const name = normalizeCode(code);
    if (!priced.has(name)) items.push({ name, unit: "", unitPrice: 0, maHang: [code] });
  }
  return { ...config, items, excludedMaHang: [] };
}

/** Engine result of one contract, with the same file warnings as a saved calculation. */
export function computeReportProject(ledger: Ledger, c: ReportContract): RentResult {
  if (!c.config) throw new Error(c.configError ?? "Hợp đồng chưa có bảng giá dùng được.");
  if (c.config.items.length === 0) throw new Error("Hợp đồng chưa có dòng đơn giá nào.");
  const res = computeRentFromLedger(ledger, c.config, c.period, rangesForPeriod(c.ranges, c.period));
  // File-level warnings for this warehouse, next to the engine's own (as on a saved calculation).
  res.warnings.unshift(...warningsForWarehouse(ledger.warnings, c.misaKho));
  return res;
}

/**
 * Calculate every contract over its period from one merged ledger (which
 * must cover all of them). A contract the engine refuses (warehouse not in
 * the file, code without a price, unusable price table…) is listed last with
 * the engine's message: never silently left out of the total.
 */
export function buildRentReport(
  ledger: Ledger,
  contracts: readonly ReportContract[],
  opts: { keepResults?: boolean } = {},
): RentReport {
  const byKho = splitLedgerByWarehouse(ledger);
  const empty: Ledger = { ...ledger, openings: [], movements: [] };
  const catalog = buildMisaCatalog(ledger);
  const codes = new Map<string, ReportCodeRow & { prices: Set<number> }>();
  const results = new Map<string, RentResult>();

  const projects: ReportProject[] = contracts.map((c) => {
    const base = { contractId: c.id, label: c.label, misaKho: c.misaKho, isDemo: c.isDemo, period: c.period };
    const sub = byKho.get(normalizeCode(c.misaKho)) ?? empty;
    try {
      const res = computeReportProject(sub, c);
      if (opts.keepResults) results.set(c.id, res);
      const split = computeRentFromLedger(sub, perCodeConfig(c.config!), c.period, rangesForPeriod(c.ranges, c.period));
      for (const it of split.items) {
        const m = catalog.items[it.name];
        let row = codes.get(it.name);
        if (!row) {
          row = {
            maVt: it.name,
            name: m?.name ?? "",
            unit: m?.dvt || it.unit,
            unitPrice: null,
            opening: 0,
            delivered: 0,
            returned: 0,
            closing: 0,
            qtyDays: 0,
            amount: 0,
            projectCount: 0,
            prices: new Set(),
          };
          codes.set(it.name, row);
        }
        row.prices.add(it.unitPrice);
        row.projectCount++;
        for (const l of it.lines) {
          if (l.kind === "ton-dau-ky") row.opening += l.qty;
          else if (l.qty > 0) row.delivered += l.qty;
          else row.returned -= l.qty;
          row.qtyDays += l.qty * l.days;
        }
        row.closing += it.closingQty;
        row.amount += it.amount;
      }
      return { ...base, total: res.totalAmount, error: null, warnings: res.warnings };
    } catch (e) {
      return { ...base, total: null, error: (e as Error).message, warnings: [] };
    }
  });

  projects.sort((a, b) => {
    if (a.total === null || b.total === null) {
      return a.total === b.total ? a.misaKho.localeCompare(b.misaKho) : a.total === null ? 1 : -1;
    }
    return b.total - a.total || a.misaKho.localeCompare(b.misaKho);
  });
  const ok = projects.filter((p) => p.total !== null);
  return {
    projects,
    codes: [...codes.values()]
      .map(({ prices, ...r }) => ({ ...r, unitPrice: prices.size === 1 ? [...prices][0] : null }))
      .sort((a, b) => a.maVt.localeCompare(b.maVt)),
    total: ok.reduce((s, p) => s + p.total!, 0),
    okCount: ok.length,
    errorCount: projects.length - ok.length,
    demoCount: projects.filter((p) => p.isDemo).length,
    ...(opts.keepResults ? { results } : {}),
  };
}
