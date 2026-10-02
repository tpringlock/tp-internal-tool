import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { vietpanelSenci } from "./contracts/vietpanel-senci";
import { computeRentFromLedger } from "./engine";
import { parseMisaLedger } from "./misa-parser";
import {
  PriceLinesError,
  flattenContractConfig,
  groupPriceLines,
  printedName,
  printedUnit,
  toContractConfigFromLines,
  type PriceLineFields,
} from "./price-lines";
import { PRICE_TEMPLATE_ROWS } from "./price-template";

// Parses real MISA / Excel files, which is slow on a busy machine: this file
// gets its own timeout instead of raising the global one.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const VP_CONTRACT = {
  code: vietpanelSenci.id,
  customer_name: vietpanelSenci.customerName,
  project_name: vietpanelSenci.projectName,
  contract_no: vietpanelSenci.contractNo,
  misa_kho: vietpanelSenci.misaKho,
};

const line = (p: Partial<PriceLineFields> & Pick<PriceLineFields, "ma_vt">): PriceLineFields => ({
  ten_vt: "",
  dvt: "",
  unit_price: 10,
  print_name: null,
  print_dvt: null,
  sort_order: 0,
  ...p,
});

/** The template rows as price lines, in file order. */
const templateLines = PRICE_TEMPLATE_ROWS.map((r, i) => ({ ...r, sort_order: i + 1 }));

describe("printed name / unit", () => {
  it("print override, else MISA value, else the code", () => {
    expect(printedName(line({ ma_vt: "A", ten_vt: "Tên MISA", print_name: "Tên in" }))).toBe("Tên in");
    expect(printedName(line({ ma_vt: "A", ten_vt: "Tên MISA" }))).toBe("Tên MISA");
    expect(printedName(line({ ma_vt: "A" }))).toBe("A");
    expect(printedUnit(line({ ma_vt: "A", dvt: "cây", print_dvt: "Cái" }))).toBe("Cái");
    expect(printedUnit(line({ ma_vt: "A", dvt: "cây" }))).toBe("cây");
    expect(printedUnit(line({ ma_vt: "A" }))).toBeNull();
  });
});

describe("Viet Panel keeps exactly the same contract config", () => {
  it("rows written by the 0037 cutover regroup to the verified config", () => {
    const cfg = toContractConfigFromLines(VP_CONTRACT, flattenContractConfig(vietpanelSenci));
    expect(cfg).toEqual(vietpanelSenci);
  });

  it("the import template (MISA names + print overrides) regroups to the verified config", () => {
    const cfg = toContractConfigFromLines(VP_CONTRACT, templateLines);
    expect(cfg.items).toEqual(vietpanelSenci.items);
    expect(cfg.excludedMaHang).toEqual(vietpanelSenci.excludedMaHang);
  });

  it("…so the engine gives identical results on both real MISA files", async () => {
    for (const [file, period] of [
      ["misa-2026-06-16cot.xlsx", { from: "2026-06-01", to: "2026-06-25" }],
      ["misa-2026-09-13cot.xlsx", { from: "2026-09-01", to: "2026-09-25" }],
    ] as const) {
      const ledger = await parseMisaLedger(readFileSync(new URL(`./__fixtures__/${file}`, import.meta.url)));
      const expected = computeRentFromLedger(ledger, vietpanelSenci, period);
      expect(computeRentFromLedger(ledger, toContractConfigFromLines(VP_CONTRACT, templateLines), period)).toEqual(expected);
      expect(
        computeRentFromLedger(ledger, toContractConfigFromLines(VP_CONTRACT, flattenContractConfig(vietpanelSenci)), period),
      ).toEqual(expected);
      expect(expected.totalAmount).toBeGreaterThan(0);
    }
  });
});

describe("grouping rules", () => {
  it("price 0 means not billed (excluded), never an HSTT line", () => {
    const g = groupPriceLines([
      line({ ma_vt: "PALLET", unit_price: 0, print_name: "Pallet" }),
      line({ ma_vt: "A", unit_price: 5 }),
    ]);
    expect(g.excluded).toEqual(["PALLET"]);
    expect(g.items.map((i) => i.maHang)).toEqual([["A"]]);
  });

  it("orders lines by their first row, codes inside a line by sort_order, ties by name", () => {
    const g = groupPriceLines([
      line({ ma_vt: "B1", print_name: "Yankee", sort_order: 2 }),
      line({ ma_vt: "C1", print_name: "Mike", sort_order: 1 }),
      line({ ma_vt: "A9", print_name: "Bravo", sort_order: 1 }),
      line({ ma_vt: "B2", print_name: "Yankee", sort_order: 1 }),
    ]);
    expect(g.items.map((i) => [i.name, i.maHang])).toEqual([
      ["Bravo", ["A9"]],
      ["Mike", ["C1"]],
      ["Yankee", ["B2", "B1"]],
    ]);
  });

  it("an empty unit in a group takes the others'", () => {
    const g = groupPriceLines([
      line({ ma_vt: "VT0064", dvt: "cây", print_name: "Giằng 1.2m", print_dvt: "Cái", sort_order: 1 }),
      line({ ma_vt: "VT0091", dvt: "", print_name: "Giằng 1.2m", sort_order: 2 }),
    ]);
    expect(g.conflicts).toEqual([]);
    expect(g.items[0]).toMatchObject({ unit: "Cái", maHang: ["VT0064", "VT0091"] });
  });

  it("reports rows of one HSTT line with different prices or units", () => {
    const g = groupPriceLines([
      line({ ma_vt: "A", print_name: "X", unit_price: 10, print_dvt: "Cái", sort_order: 1 }),
      line({ ma_vt: "B", print_name: "X", unit_price: 12, dvt: "cây", sort_order: 2 }),
    ]);
    expect(g.conflicts).toEqual([{ name: "X", codes: ["A", "B"], prices: [10, 12], units: ["Cái", "cây"] }]);
    expect(() => toContractConfigFromLines(VP_CONTRACT, [
      line({ ma_vt: "A", print_name: "X", unit_price: 10 }),
      line({ ma_vt: "B", print_name: "X", unit_price: 12 }),
    ])).toThrow(PriceLinesError);
  });
});
