// Text helpers for billing data that must stay client-safe (no exceljs).

/**
 * Same rule as normalizeCode() in misa-parser.ts (trim + collapse runs of
 * whitespace, like Excel's TRIM). Duplicated on purpose: misa-parser pulls
 * in exceljs, which must not end up in client bundles. text.test.ts checks
 * that both stay identical.
 */
export function normalizeCode(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Trimmed text with single spaces, in NFC (Excel files may hold NFD Vietnamese). */
export function cleanText(s: string | null | undefined): string {
  return (s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Whether two names/units mean the same thing: compared after cleanText and
 * case-insensitively ("cây" = "Cây"). Used for the MISA name checks, which
 * only warn.
 */
export function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return cleanText(a).toLocaleLowerCase("vi") === cleanText(b).toLocaleLowerCase("vi");
}
