// Server-free locale constants — safe to import from client components and
// server actions alike. Keep this module free of "next/headers" or other
// server-only imports.
export const LOCALES = ["vi", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "vi";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
