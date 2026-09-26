/**
 * Message namespaces that Client Components read via useTranslations, per
 * area of the app. Only these are serialized into the page payload; the rest
 * of messages/*.json stays on the server (getTranslations).
 *
 * The root layout provides SHELL (header, module switcher, breadcrumb, toast).
 * Each module layout nests a provider with SHELL plus its own list, because a
 * nested NextIntlClientProvider replaces (does not merge) its parent's
 * messages. client-namespaces.test.ts walks the import graph and fails if a
 * Client Component uses a namespace its area does not provide.
 */
export const SHELL_NAMESPACES = [
  "Common",
  "Nav",
  "AppModules",
  "Breadcrumb",
  "Profile",
] as const;

export const MODULE_NAMESPACES = {
  auth: ["Auth"],
  documents: ["Admin", "DocTypes", "DocWorkspace", "Documents", "Shares"],
  academy: ["Academy", "AcademyAdmin", "AcademyNav", "DocWorkspace"],
  admin: [
    "AcademyAdmin",
    "Admin",
    "AdminNav",
    "DocWorkspace",
    "MisaData",
    "MisaSync",
    "MisaTest",
  ],
  billing: ["Billing", "BillingNav", "DocWorkspace"],
} as const satisfies Record<string, readonly string[]>;

export type ClientModule = keyof typeof MODULE_NAMESPACES;

/** Shell namespaces plus the module's own, deduplicated. */
export function moduleNamespaces(module: ClientModule): string[] {
  return [...new Set<string>([...SHELL_NAMESPACES, ...MODULE_NAMESPACES[module]])];
}

/** The subset of `messages` under the given top-level namespaces. */
export function pickMessages<T extends Record<string, unknown>>(
  messages: T,
  namespaces: readonly string[],
): Partial<T> {
  const out: Partial<T> = {};
  for (const ns of namespaces) {
    if (ns in messages) out[ns as keyof T] = messages[ns as keyof T];
  }
  return out;
}
