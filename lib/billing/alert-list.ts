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

export type NegativeGroup = "new" | "opening";

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
  /** negative_stock: "new" = went below 0 during the period, "opening" = already below 0 at its start. */
  negativeGroup?: NegativeGroup;
  /** negative_stock: balance at the period start. */
  openingBalance?: number;
}

/**
 * What the page and the Excel group by: negative stock split in two
 * ("negative_new" shown by default, "negative_opening" collapsed), then the
 * other kinds.
 */
export type AlertCategory = "negative_new" | "negative_opening" | Exclude<AlertKind, "negative_stock">;

export const ALERT_CATEGORIES: readonly AlertCategory[] = [
  "negative_new",
  "negative_opening",
  "missing_price",
  "no_contract",
  "not_in_misa",
  "name_mismatch",
];

export function alertCategory(a: Pick<BillingAlert, "kind" | "negativeGroup">): AlertCategory {
  if (a.kind !== "negative_stock") return a.kind;
  return a.negativeGroup === "opening" ? "negative_opening" : "negative_new";
}

/** Negative-stock alerts already below 0 at the period start (shown collapsed). */
export function isOpeningNegative(a: Pick<BillingAlert, "kind" | "negativeGroup">): boolean {
  return a.kind === "negative_stock" && a.negativeGroup === "opening";
}

/** Count per category (project and company warehouses together). */
export function countAlerts(alerts: readonly BillingAlert[]): Record<AlertCategory, number> {
  const out = Object.fromEntries(ALERT_CATEGORIES.map((k) => [k, 0])) as Record<AlertCategory, number>;
  for (const a of alerts) out[alertCategory(a)]++;
  return out;
}

export interface AlertFilter {
  category?: AlertCategory | "";
  /** Accent-insensitive words over warehouse, contract, code and names. */
  q?: string;
  /** Include company warehouses (default true). */
  company?: boolean;
}

/** The alerts the page shows and the Excel exports for the same filter. */
export function filterAlerts(alerts: readonly BillingAlert[], f: AlertFilter): BillingAlert[] {
  return alerts.filter(
    (a) =>
      (!f.category || alertCategory(a) === f.category) &&
      (f.company !== false || a.company === null) &&
      (!f.q || matchesSearch([a.kho, a.khoName, a.contractLabel, a.maVt, a.tenVt], f.q)),
  );
}
