import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { vietpanelSenci } from "./contracts/vietpanel-senci";
import { parseMisaLedger } from "./misa-parser";
import { buildRentInput, BillingError } from "./engine";
import {
  findDuplicateCodes,
  findUnknownCodes,
  parseCodeList,
  toContractConfig,
  warningsForWarehouse,
} from "./contract-config";
import { mergeLedgers } from "./merge-ledgers";
import type { ContractConfig } from "./types";

const load = (f: string) => parseMisaLedger(readFileSync(new URL(`./__fixtures__/${f}`, import.meta.url)));

describe("toContractConfig", () => {
  it("rebuilds the verified Viet Panel config from DB-shaped rows", () => {
    const rows = vietpanelSenci.items.map((i, idx) => ({
      name: i.name,
      unit: i.unit,
      unit_price: i.unitPrice,
      ma_hang: i.maHang,
      sort_order: idx + 1,
    }));
    const config = toContractConfig(
      {
        code: "vietpanel-senci",
        customer_name: vietpanelSenci.customerName,
        project_name: vietpanelSenci.projectName,
        contract_no: vietpanelSenci.contractNo,
        misa_kho: vietpanelSenci.misaKho,
      },
      [...rows].reverse(), // DB order is not guaranteed
      ["VT0094", "PALLET"],
    );
    expect(config).toEqual({ ...vietpanelSenci, excludedMaHang: ["PALLET", "VT0094"] });
  });
});

describe("findUnknownCodes", () => {
  const period = { from: "2026-06-01", to: "2026-06-25" };

  it("is empty when the contract covers every code", async () => {
    const ledger = await load("misa-2026-06-16cot.xlsx");
    expect(findUnknownCodes(ledger, vietpanelSenci, period)).toEqual([]);
    expect(() => buildRentInput(ledger, vietpanelSenci, period)).not.toThrow();
  });

  it("lists exactly the codes the engine rejects", async () => {
    const ledger = await load("misa-2026-06-16cot.xlsx");
    const partial: ContractConfig = {
      ...vietpanelSenci,
      items: vietpanelSenci.items.filter((i) => !i.maHang.includes("VT0022")),
      excludedMaHang: [],
    };
    const unknown = findUnknownCodes(ledger, partial, period);
    expect(unknown.map((u) => u.maHang)).toEqual(expect.arrayContaining(["VT0022"]));
    expect(() => buildRentInput(ledger, partial, period)).toThrow(BillingError);
    let message = "";
    try {
      buildRentInput(ledger, partial, period);
    } catch (e) {
      message = (e as Error).message;
    }
    for (const u of unknown) expect(message).toContain(u.maHang);
  });
});

describe("parseCodeList", () => {
  it("splits on commas, semicolons and whitespace, dropping blanks and repeats", () => {
    expect(parseCodeList(" VT0022, VT0090;\nVT0091  VT0022 ,")).toEqual(["VT0022", "VT0090", "VT0091"]);
    expect(parseCodeList("   ")).toEqual([]);
  });
});

describe("findDuplicateCodes", () => {
  it("finds codes used by two lines or both priced and excluded", () => {
    expect(findDuplicateCodes([["VT1", "VT2"], ["VT3"]], ["PALLET"])).toEqual([]);
    expect(findDuplicateCodes([["VT1", "VT2"], ["VT2"]], ["VT1"])).toEqual(["VT1", "VT2"]);
  });
});

describe("warningsForWarehouse", () => {
  it("keeps this warehouse's and general warnings only", () => {
    const ws = [
      "Dòng 10 (VIETPANEL-01/VT0022): tồn trong file 5 ≠ tồn cộng dồn 4.",
      "Dòng 11 (APTV/VT0008): tồn trong file 5 ≠ tồn cộng dồn 4.",
      "Dòng 12: không đọc được Ngày hạch toán, đã bỏ qua.",
      "Tồn đầu 01/09/2026 của VIETPANEL-01/VT0021 trong file sau là 1, nhưng cộng từ file trước ra 2.",
      "Tồn đầu 01/09/2026 của HARMONY/VT0021 trong file sau là 1, nhưng cộng từ file trước ra 2.",
      "Tồn đầu 01/07/2026 của 319.5 - 1/VT0008 trong file sau là 39, nhưng cộng từ file trước ra 38.",
    ];
    expect(warningsForWarehouse(ws, "VIETPANEL-01")).toEqual([ws[0], ws[2], ws[3]]);
    expect(warningsForWarehouse(ws, "319.5 - 1")).toEqual([ws[2], ws[5]]);
  });

  it("matches the real merge warning format", async () => {
    const a = await load("misa-2026-06-16cot.xlsx");
    // merge-ledgers reports at most 20 mismatches, so keep two warehouses only.
    const other = a.openings.find((o) => o.kho !== "VIETPANEL-01")!.kho;
    const openings = a.openings
      .filter((o) => o.kho === "VIETPANEL-01" || o.kho === other)
      .map((o) => ({ ...o, qty: o.qty + 1 }));
    const b = { ...a, from: "2026-07-01", to: "2026-07-31", openings, movements: [], warnings: [] };
    const merged = mergeLedgers([a, b]);
    const mergeWarnings = merged.warnings.filter((w) => w.startsWith("Tồn đầu"));
    expect(mergeWarnings.length).toBeGreaterThan(1);
    const mine = warningsForWarehouse(mergeWarnings, "VIETPANEL-01");
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.length).toBeLessThan(mergeWarnings.length);
    expect(mine.every((w) => w.includes("của VIETPANEL-01/"))).toBe(true);
  });
});
