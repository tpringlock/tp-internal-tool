import type { UserRole } from "@/lib/db/types";

/**
 * Whether a role may create/edit clients, projects and academy content.
 * Pure and client-safe (unlike the `server-only` guards in ./dal), so it can
 * gate UI in client components and server pages alike.
 */
export function canManageContent(role: UserRole): boolean {
  return role === "admin" || role === "manager";
}
