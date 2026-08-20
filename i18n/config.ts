// Server-free locale constants — safe to import from client components and
// server actions alike. Keep this module free of "next/headers" or other
// server-only imports. The app is Vietnamese-only.
export const LOCALES = ["vi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "vi";
