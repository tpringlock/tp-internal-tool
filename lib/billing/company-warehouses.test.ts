import { describe, expect, it } from "vitest";
import { COMPANY_WAREHOUSE_RULES, companyWarehouseReason } from "./company-warehouses";

// Warehouse codes of the MISA month files 08–09/2026 (production).
const COMPANY = [
  "TP/PHÚ THỌ",
  "TP/ĐAN PHƯỢNG",
  "KHO068",
  "TEC-dithue",
  "HÀ MINH dithue",
  "Vinagroup-dithue",
  "ZUHANG-dithue",
  "NCC LINH CƯỜNG",
];
const PROJECTS = [
  "VIETPANEL-01",
  "TUAN LE - 1",
  "HARMONY",
  "319.5 - 1",
  "ZUHANG-chothue",
  "HÀ MINH chothue",
  "TEC-chothue",
  "Vinagroup-chothue",
  "Đức Hòa",
  "HOAN MẠNH",
  "An Phát (Chị Mai)",
  "THĂNG LONG",
  "GAO",
  "LTP",
];

describe("companyWarehouseReason", () => {
  it("recognises exactly the listed company warehouses of 08–09/2026", () => {
    for (const k of COMPANY) expect(companyWarehouseReason(k), k).not.toBeNull();
    for (const k of PROJECTS) expect(companyWarehouseReason(k), k).toBeNull();
  });

  it("matches after normalising spaces and case, never by name", () => {
    expect(companyWarehouseReason("  tp/phú   thọ ")).toBe("Kho tổng TP (Phú Thọ)");
    expect(companyWarehouseReason("abc-DITHUE")).toMatch(/đi thuê/);
    // The prefix keeps its trailing space: "NCCX" is not a supplier warehouse.
    expect(companyWarehouseReason("NCCX")).toBeNull();
    expect(companyWarehouseReason("TP/PHÚ THỌ 2")).toBeNull();
  });

  it("uses the first matching rule and accepts a custom list", () => {
    expect(companyWarehouseReason("X", [{ match: "exact", value: "x", reason: "R" }])).toBe("R");
    expect(COMPANY_WAREHOUSE_RULES.every((r) => r.reason.trim() !== "")).toBe(true);
  });
});
