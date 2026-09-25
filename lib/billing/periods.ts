import { addDays, billingPeriod } from "./dates";
import type { DateRange, IsoDate, Period } from "./types";

/**
 * The month to preselect on the calculate form: the latest billing period
 * that has already ended. With startDay 26, on 25/09 the September period
 * (26/08 - 25/09) is still running, so August is suggested; from 26/09 on,
 * September is.
 */
export function defaultBillingMonth(today: IsoDate, startDay = 26): string {
  const [y, m, d] = today.split("-").map(Number);
  const back = d >= startDay ? 0 : 1;
  const date = new Date(Date.UTC(y, m - 1 - back, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Billing period for a contract row (start day + first delivery date). */
export function contractPeriod(month: string, startDay: number, contractStart: IsoDate | null): Period {
  return billingPeriod(month, startDay, contractStart ?? undefined);
}

export interface RangeRow {
  date_from: IsoDate;
  date_to: IsoDate;
  reason: string;
}

/** Non-billable ranges (global + contract) that overlap the period, oldest first. */
export function rangesForPeriod(rows: RangeRow[], period: Period): DateRange[] {
  return rows
    .filter((r) => r.date_from <= period.to && r.date_to >= period.from)
    .sort((a, b) => (a.date_from < b.date_from ? -1 : a.date_from > b.date_from ? 1 : 0))
    .map((r) => ({ from: r.date_from, to: r.date_to, reason: r.reason }));
}

export interface UploadSpan {
  id: string;
  file_from: IsoDate;
  file_to: IsoDate;
  created_at: string;
}

/**
 * Pick uploaded files that together cover the period, for preselection:
 * start with the file that begins on/before the period start and reaches
 * furthest, then chain files that start the day after the previous one ends
 * (what mergeLedgers requires). Ties go to the newest upload. Returns [] when
 * no chain covers the whole period.
 */
export function suggestUploads(uploads: UploadSpan[], period: Period): string[] {
  const better = (a: UploadSpan, b: UploadSpan | undefined) =>
    !b || a.file_to > b.file_to || (a.file_to === b.file_to && a.created_at > b.created_at);

  let current: UploadSpan | undefined;
  for (const u of uploads) {
    if (u.file_from <= period.from && better(u, current)) current = u;
  }
  const chain: string[] = [];
  while (current) {
    chain.push(current.id);
    if (current.file_to >= period.to) return chain;
    const nextStart = addDays(current.file_to, 1);
    let next: UploadSpan | undefined;
    for (const u of uploads) {
      if (u.file_from === nextStart && better(u, next)) next = u;
    }
    current = next;
  }
  return [];
}

/** Whether a file's date span overlaps the period at all (for list badges). */
export function overlapsPeriod(u: Pick<UploadSpan, "file_from" | "file_to">, period: Period): boolean {
  return u.file_from <= period.to && u.file_to >= period.from;
}
