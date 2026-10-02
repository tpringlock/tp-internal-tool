import { matchesSearch } from "@/lib/search";
import type { IsoDate } from "./types";

// Alert center types and list helpers, client-safe (the checks themselves
// live in alerts.ts, server-side because the MISA parser pulls in exceljs).

export type AlertKind = "negative_stock" | "missing_price" | "no_contract" | "not_in_misa" | "name_mismatch";

export const ALERT_KINDS: readonly AlertKind[] = [
  "negative_stock",
  "missing_price",
  "no_contract",
  "not_in_misa",
  "name_mismatch",
];

export interface BillingAlert {
  kind: AlertKind;
  kho: string;
  khoName: string;
  /** Company warehouse rule that matched, or null for a project warehouse. */
  company: string | null;
  contractId: string | null;
  contractLabel: string | null;
  isDemo: boolean;
  maVt: string | null;
  tenVt: string | null;
  /** Vietnamese explanation (also the Excel "Chi tiết" column). */
  message: string;
  /** negative_stock: first negative day, lowest balance, vouchers taking stock out that day. */
  date?: IsoDate;
  balance?: number;
  refs?: string[];
}

/** Count per kind (project and company warehouses together). */
export function countAlerts(alerts: readonly BillingAlert[]): Record<AlertKind, number> {
  const out = Object.fromEntries(ALERT_KINDS.map((k) => [k, 0])) as Record<AlertKind, number>;
  for (const a of alerts) out[a.kind]++;
  return out;
}

export interface AlertFilter {
  kind?: AlertKind | "";
  /** Accent-insensitive words over warehouse, contract, code and names. */
  q?: string;
  /** Include company warehouses (default true). */
  company?: boolean;
}

/** The alerts the page shows and the Excel exports for the same filter. */
export function filterAlerts(alerts: readonly BillingAlert[], f: AlertFilter): BillingAlert[] {
  return alerts.filter(
    (a) =>
      (!f.kind || a.kind === f.kind) &&
      (f.company !== false || a.company === null) &&
      (!f.q || matchesSearch([a.kho, a.khoName, a.contractLabel, a.maVt, a.tenVt], f.q)),
  );
}
