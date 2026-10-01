import type { UserRole } from "@/lib/db/types";

/**
 * Whether a role may create/edit clients, projects and academy content.
 * Pure and client-safe (unlike the `server-only` guards in ./dal), so it can
 * gate UI in client components and server pages alike.
 */
export function canManageContent(role: UserRole): boolean {
  return role === "admin" || role === "manager";
}

/**
 * Whether a role may open the billing app ("Tính hóa đơn tự động") and read
 * everything in it: contracts, price table, source files, calculations,
 * Excel downloads. Admins, accountants and "Chỉ xem" (billing_viewer);
 * managers are NOT included. Same rule as private.is_billing_viewer() (0034).
 */
export function canViewBilling(role: UserRole): boolean {
  return role === "admin" || role === "accountant" || role === "billing_viewer";
}

/**
 * Whether a role may change billing data: upload source files, calculate and
 * save drafts, confirm, edit or import prices, edit contracts and
 * non-billable ranges. Admins and accountants. Same rule as
 * private.is_billing_user() (0027). Deleting data, voiding confirmed
 * calculations and replacing a file used by a confirmed calculation stay
 * admin-only on top of this.
 */
export function canEditBilling(role: UserRole): boolean {
  return role === "admin" || role === "accountant";
}
