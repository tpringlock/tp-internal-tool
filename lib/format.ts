/** Human-readable file size, e.g. 1.4 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

// Pin the locale and timezone so server and client render identical strings
// (otherwise dates cause React hydration mismatches). ICT is the company's
// timezone; change DISPLAY_TIME_ZONE if the org operates elsewhere.
const DISPLAY_LOCALE = "en-GB";
const DISPLAY_TIME_ZONE = "Asia/Ho_Chi_Minh";

/**
 * Vietnamese Dong for display, e.g. 1.234.567 ₫. Accepts a string (numeric
 * columns come back as strings from supabase-js) or number; returns "—" for
 * missing/invalid values. VND has no minor unit, so no decimals are shown.
 */
export function formatVND(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(DISPLAY_LOCALE, {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Deterministic date-time for display, e.g. 6 Aug 2026, 14:30 (ICT). */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(DISPLAY_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  });
}
