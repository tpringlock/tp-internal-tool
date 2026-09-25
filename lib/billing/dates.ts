import type { IsoDate, Period } from "./types";

const DAY_MS = 86_400_000;

function toUtcMs(d: IsoDate): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`Ngày không hợp lệ: "${d}" (cần YYYY-MM-DD)`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function isoFromParts(y: number, m: number, d: number): IsoDate {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new Error(`Ngày không tồn tại: ${d}/${m}/${y}`);
  }
  return date.toISOString().slice(0, 10);
}

/** Số ngày tính cả hai đầu: daysInclusive("2026-07-26","2026-08-25") = 31. */
export function daysInclusive(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS) + 1;
}

/** Số ngày giao nhau (tính cả hai đầu) giữa [a1,a2] và [b1,b2]; 0 nếu không giao. */
export function overlapDays(a1: IsoDate, a2: IsoDate, b1: IsoDate, b2: IsoDate): number {
  const from = a1 > b1 ? a1 : b1;
  const to = a2 < b2 ? a2 : b2;
  return from > to ? 0 : daysInclusive(from, to);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return new Date(toUtcMs(d) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Kỳ tính tiền của tháng `month` ("YYYY-MM"): từ ngày `startDay` tháng trước đến ngày `startDay − 1` tháng này.
 * TP dùng startDay = 26 → "08/2026" = 26/07/2026 – 25/08/2026.
 * `contractStart` (ngày giao đầu tiên) sẽ cắt ngắn kỳ đầu tiên, ví dụ 20/12 – 25/12/2025.
 */
export function billingPeriod(month: string, startDay = 26, contractStart?: IsoDate): Period {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error(`Tháng không hợp lệ: "${month}" (cần YYYY-MM)`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const to = isoFromParts(y, mo, startDay - 1);
  const prevY = mo === 1 ? y - 1 : y;
  const prevM = mo === 1 ? 12 : mo - 1;
  let from = isoFromParts(prevY, prevM, startDay);
  if (contractStart && contractStart > from) from = contractStart;
  return { from, to };
}

/** Excel/exceljs trả về Date ở UTC 00:00; cũng chấp nhận chuỗi "dd/mm/yyyy". */
export function toIsoDate(v: unknown): IsoDate | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return isoFromParts(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === "string") {
    const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(v);
    if (m) return isoFromParts(Number(m[3]), Number(m[2]), Number(m[1]));
  }
  return null;
}

export function formatVnDate(d: IsoDate): string {
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}
