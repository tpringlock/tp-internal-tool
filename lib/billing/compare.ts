import { computeRentFromLedger } from "./engine";
import type { ContractConfig, Ledger, Period } from "./types";

export interface CompareRow {
  misaKho: string;
  projectName: string;
  /** Rent for the period; null when the engine refused (see error). */
  total: number | null;
  error: string | null;
  warningCount: number;
}

export interface CompareSummary {
  rows: CompareRow[];
  /** Σ totals of warehouses with a positive amount (the Excel report's total). */
  positiveTotal: number;
  positiveCount: number;
  errorCount: number;
}

/**
 * Run the engine for every (demo) contract over one period, to compare with
 * the Excel tool's "BÁO CÁO TIỀN THUÊ" sheet. No non-billable ranges: the
 * Excel tool has none. A contract the engine refuses (warehouse missing from
 * the file, undeclared code, …) is reported with the engine's message.
 * Rows: amount descending, refused contracts last.
 */
export function compareContracts(ledger: Ledger, contracts: ContractConfig[], period: Period): CompareSummary {
  const rows: CompareRow[] = contracts.map((c) => {
    try {
      const res = computeRentFromLedger(ledger, c, period);
      return { misaKho: c.misaKho, projectName: c.projectName, total: res.totalAmount, error: null, warningCount: res.warnings.length };
    } catch (e) {
      return { misaKho: c.misaKho, projectName: c.projectName, total: null, error: (e as Error).message, warningCount: 0 };
    }
  });
  rows.sort((a, b) => {
    if (a.total === null || b.total === null) {
      return a.total === b.total ? a.misaKho.localeCompare(b.misaKho) : a.total === null ? 1 : -1;
    }
    return b.total - a.total || a.misaKho.localeCompare(b.misaKho);
  });
  const positive = rows.filter((r) => r.total !== null && r.total > 0);
  return {
    rows,
    positiveTotal: positive.reduce((s, r) => s + r.total!, 0),
    positiveCount: positive.length,
    errorCount: rows.filter((r) => r.error).length,
  };
}
