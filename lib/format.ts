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
