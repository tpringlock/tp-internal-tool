import { formatVnDate } from "./dates";
import { formatBillingMonth, nextMonth } from "./periods";
import type { IsoDate, Ledger, Period } from "./types";

// Rules for MISA source files stored by data month (feedback items 1, 1b;
// table billing_misa_month_files, 0035). Pure and client-safe.

/** "YYYY-MM" of an ISO date. */
export function monthOf(date: IsoDate): string {
  return date.slice(0, 7);
}

function lastDayOfMonth(month: string): IsoDate {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(d).padStart(2, "0")}`;
}

/**
 * Row 2 of a MISA "Sổ chi tiết vật tư hàng hóa" export names the warehouse
 * filter, e.g. "Kho: <<Tất cả>>, Tháng 9 năm 2026". Month files must cover
 * every warehouse. Returns an error message, or null when fine.
 */
export function checkMisaScope(title: string): string | null {
  const t = title.normalize("NFC");
  if (/Kho:\s*<<\s*Tất cả\s*>>/i.test(t)) return null;
  const kho = /Kho:\s*([^,]+)/i.exec(t)?.[1]?.trim();
  return kho
    ? `File chỉ có kho "${kho}". Hãy tải lại sổ chi tiết với Kho: <<Tất cả>>.`
    : `Không thấy "Kho: <<Tất cả>>" ở dòng 2 của file ("${title}"). Hãy tải lại sổ chi tiết với Kho: <<Tất cả>>.`;
}

export type MonthCheck = { ok: true; month: string } | { ok: false; error: string };

/**
 * The data month of a file covering [from, to], which must be exactly one
 * calendar month (01 -> last day). Same rule as billing_add_month_file.
 */
export function fullMonthOf(from: IsoDate, to: IsoDate): MonthCheck {
  const month = monthOf(from);
  const span = `${formatVnDate(from)} → ${formatVnDate(to)}`;
  if (from.slice(8) !== "01") {
    return { ok: false, error: `File bắt đầu ngày ${formatVnDate(from)}, không phải ngày 01 (kỳ của file: ${span}). File nguồn phải là trọn 1 tháng.` };
  }
  if (monthOf(to) !== month) {
    return { ok: false, error: `File trải qua nhiều tháng (${span}). Mỗi file nguồn chỉ được chứa đúng 1 tháng.` };
  }
  if (to !== lastDayOfMonth(month)) {
    return { ok: false, error: `File chỉ đến ngày ${formatVnDate(to)}, chưa hết tháng ${formatBillingMonth(month)} (kỳ của file: ${span}). File nguồn phải là trọn 1 tháng.` };
  }
  return { ok: true, month };
}

/** Both checks for an uploaded file: all warehouses, exactly one month. */
export function checkMonthFile(file: { title: string; from: IsoDate; to: IsoDate }): MonthCheck {
  const scope = checkMisaScope(file.title);
  if (scope) return { ok: false, error: scope };
  return fullMonthOf(file.from, file.to);
}

export interface MonthVersion {
  version: number;
  status: "active" | "superseded";
  /** Confirmed calculations that use this version's file. */
  confirmedUses: number;
}

export interface MonthUploadPlan {
  /** Version number the new file will get. */
  version: number;
  /** Version it replaces as the active one, or null for a new month. */
  replaces: number | null;
  /** The active version backs a confirmed calculation: only an admin may replace it. */
  needsAdmin: boolean;
}

/** What uploading one more file for a month does (mirrors billing_add_month_file, 0035). */
export function planMonthUpload(versions: readonly MonthVersion[]): MonthUploadPlan {
  const active = versions.find((v) => v.status === "active");
  return {
    version: Math.max(0, ...versions.map((v) => v.version)) + 1,
    replaces: active?.version ?? null,
    needsAdmin: !!active && active.confirmedUses > 0,
  };
}

/** Months between the first and last given month that have no file, oldest first. */
export function missingMonths(months: readonly string[]): string[] {
  if (months.length === 0) return [];
  const sorted = [...new Set(months)].sort();
  const have = new Set(sorted);
  const out: string[] = [];
  for (let m = sorted[0]; m <= sorted[sorted.length - 1]; m = nextMonth(m)) if (!have.has(m)) out.push(m);
  return out;
}

export interface PickerMonthRow {
  upload_id: string;
  month: string;
  version: number;
  status: "active" | "superseded";
}

/**
 * Files offered on the calculate form: the ACTIVE version of each month and
 * the legacy uploads (not month files); replaced versions are left out.
 * Each file gets its month/version (null for a legacy file) for its label.
 * Order is kept.
 */
export function uploadsForPicker<T extends { id: string }>(
  uploads: readonly T[],
  monthRows: readonly PickerMonthRow[],
): (T & { month: string | null; version: number | null })[] {
  const byUpload = new Map(monthRows.map((m) => [m.upload_id, m]));
  return uploads.flatMap((u) => {
    const m = byUpload.get(u.id);
    if (m && m.status !== "active") return [];
    return [{ ...u, month: m?.month ?? null, version: m?.version ?? null }];
  });
}

/** Distinct voucher numbers (Số chứng từ) in a parsed file. */
export function countVouchers(ledger: Pick<Ledger, "movements">): number {
  return new Set(ledger.movements.map((m) => m.soCt.trim()).filter(Boolean)).size;
}

/** Every month from the month of `from` to the month of `to`, oldest first. */
export function monthsCovering(period: Period): string[] {
  const last = monthOf(period.to);
  const out: string[] = [];
  for (let m = monthOf(period.from); m <= last; m = nextMonth(m)) out.push(m);
  return out;
}

export interface ActiveMonthFile {
  month: string;
  upload_id: string;
  version: number;
}

export interface MonthFilePick<T extends ActiveMonthFile = ActiveMonthFile> {
  /** Months the period needs, oldest first. */
  months: string[];
  /** The active file of each needed month that has one, oldest first. */
  files: T[];
  /** Needed months without an active file. */
  missing: string[];
  /** "Thiếu file tháng 08/2026, 09/2026." or null when complete. */
  error: string | null;
}

/**
 * The month files a period needs (phase 2 merges them with mergeLedgers):
 * the active version of every month from the month containing `from` to the
 * month containing `to`. Missing months are reported, never skipped.
 */
export function pickMonthFiles<T extends ActiveMonthFile>(period: Period, active: readonly T[]): MonthFilePick<T> {
  const months = monthsCovering(period);
  const byMonth = new Map(active.map((f) => [f.month, f]));
  const files: T[] = [];
  const missing: string[] = [];
  for (const m of months) {
    const f = byMonth.get(m);
    if (f) files.push(f);
    else missing.push(m);
  }
  return {
    months,
    files,
    missing,
    error: missing.length > 0 ? `Thiếu file tháng ${missing.map(formatBillingMonth).join(", ")}.` : null,
  };
}
