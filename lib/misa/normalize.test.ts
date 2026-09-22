import { describe, it, expect } from "vitest";

import type { MisaRawRecord } from "@/lib/misa/types";
import {
  MisaNormalizeError,
  normalizeCustomer,
  normalizeProduct,
  normalizeStock,
  normalizeInventoryBalance,
  parseDeletedMisaId,
  toIsoOrNull,
  toNumericString,
} from "@/lib/misa/normalize";

// Masked real responses captured with scripts/misa-test.ts.
import customersJson from "./__fixtures__/customers.json";
import productsJson from "./__fixtures__/products.json";
import stocksJson from "./__fixtures__/stocks.json";
import inventoryJson from "./__fixtures__/inventory_balance.json";
import deletedJson from "./__fixtures__/customers_deleted.json";

const customers = customersJson as unknown as MisaRawRecord[];
const products = productsJson as unknown as MisaRawRecord[];
const stocks = stocksJson as unknown as MisaRawRecord[];
const inventory = inventoryJson as unknown as MisaRawRecord[];
const deleted = deletedJson as unknown as MisaRawRecord[];

describe("normalizeCustomer", () => {
  it("maps a real account object", () => {
    const raw = customers[0];
    const row = normalizeCustomer(raw);
    expect(row.misa_id).toBe(raw.account_object_id);
    expect(row.code).toBe("0101162254");
    expect(row.name).toBe(raw.account_object_name);
    expect(row.tax_code).toBe(raw.company_tax_code);
    expect(row.address).toBe(raw.address);
    // Flags is_customer + is_vendor are both true on this record.
    expect(row.object_type).toBe("customer,vendor");
    expect(row.phone).toBeNull();
    expect(row.raw).toBe(raw);
  });

  it("converts modified_date from ICT to a UTC instant", () => {
    // 2026-08-10T15:45:50...+07:00 → 08:45:50 UTC
    const row = normalizeCustomer(customers[0]);
    expect(row.misa_modified_at).toMatch(/^2026-08-10T08:45:50\.\d{3}Z$/);
  });

  it("defaults optional fields to null / empty name", () => {
    const row = normalizeCustomer({ account_object_id: "x" });
    expect(row.misa_id).toBe("x");
    expect(row.name).toBe("");
    expect(row.code).toBeNull();
    expect(row.tax_code).toBeNull();
    expect(row.object_type).toBeNull();
    expect(row.misa_modified_at).toBeNull();
  });

  it("throws when the id is missing", () => {
    expect(() => normalizeCustomer({})).toThrow(MisaNormalizeError);
  });
});

describe("normalizeProduct", () => {
  it("maps inventory items and picks unit / category when present", () => {
    expect(normalizeProduct(products[1]).unit).toBe("Cái");
    expect(normalizeProduct(products[2]).category).toBe("Hàng hóa");
    const first = normalizeProduct(products[0]);
    expect(first.misa_id).toBe(products[0].inventory_item_id);
    expect(first.code).toBe("AXIT");
    expect(first.unit).toBeNull();
    expect(first.category).toBeNull();
  });
});

describe("normalizeStock", () => {
  it("maps a real stock", () => {
    const raw = stocks[0];
    const row = normalizeStock(raw);
    expect(row.misa_id).toBe(raw.stock_id);
    expect(row.code).toBe("319.5");
    expect(row.name).toBe(raw.stock_name);
    expect(row.raw).toBe(raw);
  });
});

describe("normalizeInventoryBalance", () => {
  it("keeps money as strings (no float) and preserves raw", () => {
    const raw = inventory[0];
    const row = normalizeInventoryBalance(raw);
    expect(row.stock_misa_id).toBe(raw.stock_id);
    expect(row.product_misa_id).toBe(raw.inventory_item_id);
    expect(row.product_code).toBe(raw.inventory_item_code);
    expect(row.product_name).toBe(raw.inventory_item_name);
    expect(row.stock_name).toBe(raw.stock_name);
    expect(row.value).toBe("-15632105");
    expect(typeof row.value).toBe("string");
    expect(row.quantity).toBe("0");
    expect(row.as_of).toBeNull();
    // Decimal unit_price stays available in raw for audit.
    expect((row.raw as MisaRawRecord).unit_price).toBe(166053.02);
  });
});

describe("parseDeletedMisaId", () => {
  it("returns the deleted record's id", () => {
    expect(parseDeletedMisaId(deleted[0])).toBe(deleted[0].id);
  });
});

describe("toNumericString", () => {
  it("stringifies numbers without float rounding and handles blanks", () => {
    expect(toNumericString(166053.02)).toBe("166053.02");
    expect(toNumericString(0)).toBe("0");
    expect(toNumericString(-15632105)).toBe("-15632105");
    expect(toNumericString(null)).toBeNull();
    expect(toNumericString("  ")).toBeNull();
    expect(toNumericString(Number.NaN)).toBeNull();
  });
});

describe("toIsoOrNull", () => {
  it("parses ICT timestamps to UTC and rejects junk", () => {
    expect(toIsoOrNull("2026-08-10T15:45:50.9589587+07:00")).toMatch(
      /^2026-08-10T08:45:50\.\d{3}Z$/,
    );
    expect(toIsoOrNull("")).toBeNull();
    expect(toIsoOrNull("not-a-date")).toBeNull();
    expect(toIsoOrNull(null)).toBeNull();
  });
});
