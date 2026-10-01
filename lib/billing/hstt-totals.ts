/**
 * HSTT totals beyond the engine's equipment amount: transport (section II),
 * VAT, after-VAT deductions, and the debt reconciliation (ĐCCN).
 * Formulas of the hand-made file (docs/hstt/hstt-export-plan.md, section 1):
 *   before tax = equipment + transport
 *   VAT        = ROUND(before tax * rate, 0)
 *   after tax  = before tax + VAT - deductions
 *   closing    = opening + after tax - paid in the period
 */

export type HsttChargeMode = "now" | "end_of_term";

export interface HsttTransport {
  name: string;
  unit: string;
  unitPrice: number;
  /** Column G (trips this period); null = blank cell. */
  trips: number | null;
  /** Column F ("lũy kế"). */
  cumulativeTrips: number | null;
  chargeMode: HsttChargeMode;
  note: string;
}

export interface HsttDeduction {
  label: string;
  amount: number;
}

export interface HsttTotals {
  equipment: number;
  transport: number;
  beforeTax: number;
  vat: number;
  deductions: number;
  afterTax: number;
}

/** Excel ROUND(x, 0): half away from zero. */
export function excelRound(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/** Amount of a transport line, or null when column J stays blank. */
export function transportAmount(t: HsttTransport): number | null {
  if (t.chargeMode !== "now" || t.trips === null || t.trips === 0) return null;
  return t.trips * t.unitPrice;
}

export function computeHsttTotals(input: {
  equipment: number;
  transport: readonly HsttTransport[];
  vatPercent: number;
  deductions: readonly HsttDeduction[];
}): HsttTotals {
  const transport = input.transport.reduce((s, t) => s + (transportAmount(t) ?? 0), 0);
  const beforeTax = input.equipment + transport;
  const vat = excelRound((beforeTax * input.vatPercent) / 100);
  const deductions = input.deductions.reduce((s, d) => s + d.amount, 0);
  return {
    equipment: input.equipment,
    transport,
    beforeTax,
    vat,
    deductions,
    afterTax: beforeTax + vat - deductions,
  };
}

export function closingDebt(d: { opening: number; incurred: number; paid: number }): number {
  return d.opening + d.incurred - d.paid;
}

/** "2026-12" -> "2026-11". */
function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export interface ConfirmedPeriodDebt {
  /** "YYYY-MM". */
  month: string;
  afterTax: number;
  paid: number;
  /** Opening debt typed by hand for that period, if any. */
  openingOverride: number | null;
}

export type OpeningDebtResult =
  | { ok: true; value: number }
  /** missingMonth = the first unconfirmed month in the chain; null = no starting balance at all. */
  | { ok: false; missingMonth: string | null };

/**
 * Opening debt of `month` from the chain of CONFIRMED periods only: the
 * closing debt of the previous month, walking back until the contract's
 * opening balance (debt at the END of opening.month) or a confirmed period
 * whose opening debt was typed by hand. Every month in between must be
 * confirmed. A typed opening debt for `month` itself is the caller's business.
 */
export function openingDebtFor(input: {
  month: string;
  opening: { amount: number; month: string } | null;
  confirmed: readonly ConfirmedPeriodDebt[];
}): OpeningDebtResult {
  const byMonth = new Map(input.confirmed.map((p) => [p.month, p]));
  const hasBase =
    (input.opening !== null && input.opening.month < input.month) ||
    input.confirmed.some((p) => p.month < input.month && p.openingOverride !== null);
  if (!hasBase) return { ok: false, missingMonth: null };

  // Walk back to the base, collecting the periods to replay.
  const chain: ConfirmedPeriodDebt[] = [];
  let base = 0;
  for (let m = previousMonth(input.month); ; m = previousMonth(m)) {
    if (input.opening && m === input.opening.month) {
      base = input.opening.amount;
      break;
    }
    const p = byMonth.get(m);
    if (!p) return { ok: false, missingMonth: m };
    chain.unshift(p);
    if (p.openingOverride !== null) break;
  }

  let debt = base;
  for (const p of chain) {
    const opening = p.openingOverride ?? debt;
    debt = closingDebt({ opening, incurred: p.afterTax, paid: p.paid });
  }
  return { ok: true, value: debt };
}
