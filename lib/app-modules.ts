import type { UserRole } from "@/lib/db/types";
import { canManageContent, canUseBilling } from "@/lib/auth/roles";

/**
 * The apps ("modules") inside this project, shown in the header's module
 * switcher. Pure and client-safe: the server decides which modules a user may
 * see and passes the ids down; the client only maps ids to icons and labels.
 *
 * Hiding a module here is UI only. Access is enforced server-side by each
 * module's guards (e.g. requireContentManager in app/(app)/admin/layout.tsx,
 * requireAdmin in admin-only actions) and by RLS.
 */
export type AppModuleId = "documents" | "academy" | "billing" | "admin";

export interface AppModuleLink {
  id: AppModuleId;
  href: string;
}

/** The route prefix that marks each module as active. */
const MODULE_PREFIX: Record<AppModuleId, string> = {
  documents: "/documents",
  academy: "/academy",
  billing: "/billing",
  admin: "/admin",
};

/** Where the logo points: the document workspace. */
export const HOME_HREF = "/documents";

/** Modules the given role may open, in switcher order. */
export function getModulesForRole(role: UserRole): AppModuleLink[] {
  const modules: AppModuleLink[] = [
    { id: "documents", href: "/documents" },
    { id: "academy", href: "/academy" },
  ];
  if (canUseBilling(role)) {
    modules.push({ id: "billing", href: "/billing" });
  }
  if (canManageContent(role)) {
    // There is no /admin index page. Managers can't open /admin/users, so they
    // land on a section they can use (same targets the old user menu used).
    modules.push({
      id: "admin",
      href: role === "admin" ? "/admin/users" : "/admin/clients",
    });
  }
  return modules;
}

/**
 * The module the pathname belongs to, matched on the FIRST segment only, so
 * /admin/academy and /admin/docs stay under Admin instead of matching Academy
 * or Documents. Returns undefined for pages outside any module (/, /profile).
 */
export function getActiveModuleId(pathname: string): AppModuleId | undefined {
  const first = "/" + (pathname.split("/").filter(Boolean)[0] ?? "");
  return (Object.keys(MODULE_PREFIX) as AppModuleId[]).find(
    (id) => MODULE_PREFIX[id] === first,
  );
}
