/**
 * Pure functions that map raw MISA records into the normalized row shapes used
 * by our tables (see supabase/migrations/0024). No secrets, no I/O — unit
 * tested against masked real fixtures in normalize.test.ts.
 *
 * Field names were mapped from real get_dictionary / get_list_inventory_balance
 * responses (data_type 1=customers, 2=inventory items, 3=stocks). The full
 * record is always preserved in `raw` for audit.
 *
 * Money/quantity are returned as strings (never float) so numeric precision
 * survives all the way into Postgres numeric columns. Dates are converted from
 * MISA's ICT (+07:00) wall-clock values into ISO-8601 UTC instants.
 */

import type { Database } from "@/lib/db/types";
import type { MisaRawRecord } from "@/lib/misa/types";

type Tables = Database["public"]["Tables"];
type CustomerInsert = Tables["misa_customers"]["Insert"];
type ProductInsert = Tables["misa_products"]["Insert"];
type StockInsert = Tables["misa_stocks"]["Insert"];
type InventoryBalanceInsert = Tables["misa_inventory_balances"]["Insert"];

/** Thrown when a record lacks the id needed to upsert it. */
export class MisaNormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MisaNormalizeError";
  }
}

/** First non-empty string value among the given keys, else null. */
function pickString(record: MisaRawRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

/** Convert a MISA timestamp string into an ISO-8601 UTC instant, or null. */
export function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Represent a numeric value as a string for a Postgres numeric column, without
 * going through float rounding. Returns null for missing/invalid input.
 */
export function toNumericString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function requireId(record: MisaRawRecord, key: string): string {
  const id = record[key];
  if (typeof id !== "string" || !id) {
    throw new MisaNormalizeError(`MISA record missing "${key}"`);
  }
  return id;
}

/** Derive a comma-separated object role from MISA's boolean flags. */
function customerObjectType(record: MisaRawRecord): string | null {
  const roles: string[] = [];
  if (record.is_customer === true) roles.push("customer");
  if (record.is_vendor === true) roles.push("vendor");
  if (record.is_employee === true) roles.push("employee");
  return roles.length ? roles.join(",") : null;
}

/** Accounting object (data_type 1) → misa_customers row. */
export function normalizeCustomer(record: MisaRawRecord): CustomerInsert {
  return {
    misa_id: requireId(record, "account_object_id"),
    code: pickString(record, "account_object_code"),
    name: pickString(record, "account_object_name") ?? "",
    tax_code: pickString(record, "company_tax_code", "tax_code"),
    phone: pickString(record, "tel", "mobile", "phone", "contact_mobile"),
    address: pickString(record, "address"),
    object_type: customerObjectType(record),
    raw: record,
    misa_modified_at: toIsoOrNull(record.modified_date),
  };
}

/** Inventory item (data_type 2) → misa_products row. */
export function normalizeProduct(record: MisaRawRecord): ProductInsert {
  return {
    misa_id: requireId(record, "inventory_item_id"),
    code: pickString(record, "inventory_item_code"),
    name: pickString(record, "inventory_item_name") ?? "",
    unit: pickString(record, "unit_name"),
    category: pickString(record, "inventory_item_category_name_list"),
    raw: record,
    misa_modified_at: toIsoOrNull(record.modified_date),
  };
}

/** Stock/warehouse (data_type 3) → misa_stocks row. */
export function normalizeStock(record: MisaRawRecord): StockInsert {
  return {
    misa_id: requireId(record, "stock_id"),
    code: pickString(record, "stock_code"),
    name: pickString(record, "stock_name") ?? "",
    raw: record,
    misa_modified_at: toIsoOrNull(record.modified_date),
  };
}

/** get_list_inventory_balance row → misa_inventory_balances row. */
export function normalizeInventoryBalance(
  record: MisaRawRecord,
): InventoryBalanceInsert {
  return {
    stock_misa_id: pickString(record, "stock_id"),
    product_misa_id: pickString(record, "inventory_item_id"),
    quantity: toNumericString(record.quantity_balance),
    value: toNumericString(record.amount_balance),
    as_of: null,
    raw: record,
  };
}

/** get_dictionary_delete row → the misa_id of the deleted record. */
export function parseDeletedMisaId(record: MisaRawRecord): string {
  return requireId(record, "id");
}
