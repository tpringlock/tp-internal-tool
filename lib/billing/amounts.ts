import type { RentResult } from "./types";

/**
 * numeric columns may come back from PostgREST as a string or a number;
 * normalise to number before rendering or passing to client components.
 * (numeric(20,4) totals in VND stay far below 2^53, so number is exact enough.)
 */
export function toAmount(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

/**
 * Total as sent to the numeric(20,4) column: rounded to 4 decimals to drop
 * binary floating-point noise (0.1 + 0.2), never to whole dong. Sent as a
 * string so no float conversion happens on the way in.
 */
export function amountForDb(total: number): string {
  const s = total.toFixed(4);
  return s === "-0.0000" ? "0.0000" : s;
}

/**
 * Whether any line has a fractional quantity, which is what makes an amount
 * fractional (unit prices are whole VND). The engine also adds a "số lượng
 * lẻ" warning for each such line. For a real contract this usually means a
 * raw material (kg, m…) sits in the rental warehouse, so the calculation may
 * be saved as a draft but not confirmed until the codes are checked.
 */
export function hasFractionalQuantities(result: Pick<RentResult, "items">): boolean {
  return result.items.some((it) => it.lines.some((l) => !Number.isInteger(l.qty)));
}
