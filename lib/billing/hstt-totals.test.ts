import { describe, expect, it } from "vitest";
import {
  closingDebt,
  computeHsttTotals,
  excelRound,
  openingDebtFor,
  transportAmount,
  type HsttTransport,
} from "./hstt-totals";

const truck = (over: Partial<HsttTransport> = {}): HsttTransport => ({
  name: "Vận chuyển xe sơ mi 30 tấn",
  unit: "Chuyến",
  unitPrice: 5_000_000,
  trips: 4,
  cumulativeTrips: 68,
  chargeMode: "now",
  note: "",
  ...over,
});

describe("transportAmount", () => {
  it("bills trips x price when charged now", () => {
    expect(transportAmount(truck())).toBe(20_000_000);
  });

  it("is blank (null) without trips, with 0 trips, or when billed at the end of the term", () => {
    expect(transportAmount(truck({ trips: null }))).toBeNull();
    expect(transportAmount(truck({ trips: 0 }))).toBeNull();
    expect(transportAmount(truck({ chargeMode: "end_of_term" }))).toBeNull();
  });
});

describe("excelRound", () => {
  it("rounds half away from zero like Excel ROUND(x, 0)", () => {
    expect(excelRound(2.5)).toBe(3);
    expect(excelRound(-2.5)).toBe(-3);
    expect(excelRound(65_963_390.32)).toBe(65_963_390);
  });
});

describe("computeHsttTotals", () => {
  it("matches the T08/2026 Việt Panel HSTT", () => {
    const t = computeHsttTotals({
      equipment: 804_542_379,
      transport: [truck(), truck({ name: "Vận chuyển xe thùng 15 tấn", unitPrice: 4_500_000, trips: null, cumulativeTrips: 1 })],
      vatPercent: 8,
      deductions: [],
    });
    expect(t).toEqual({
      equipment: 804_542_379,
      transport: 20_000_000,
      beforeTax: 824_542_379,
      vat: 65_963_390,
      deductions: 0,
      afterTax: 890_505_769,
    });
  });

  it("subtracts after-VAT deductions from the total (02/2026 style)", () => {
    const t = computeHsttTotals({
      equipment: 100_000_000,
      transport: [],
      vatPercent: 8,
      deductions: [{ label: "Cty TP gửi tặng quà hội nghị NCC", amount: 10_000_000 }],
    });
    expect(t.vat).toBe(8_000_000);
    expect(t.deductions).toBe(10_000_000);
    expect(t.afterTax).toBe(98_000_000);
  });

  it("rounds VAT on a fractional base", () => {
    const t = computeHsttTotals({ equipment: 1_000.5, transport: [], vatPercent: 8, deductions: [] });
    expect(t.vat).toBe(80);
  });
});

describe("closingDebt", () => {
  it("is opening + incurred - paid (T08/2026)", () => {
    expect(closingDebt({ opening: 3_565_941_763, incurred: 890_505_769, paid: 1_550_000_000 })).toBe(2_906_447_532);
  });
});

describe("openingDebtFor", () => {
  const opening = { amount: 2_906_447_532, month: "2026-08" };

  it("uses the contract's opening debt for the month right after it", () => {
    expect(openingDebtFor({ month: "2026-09", opening, confirmed: [] })).toEqual({ ok: true, value: 2_906_447_532 });
  });

  it("chains through confirmed periods", () => {
    const confirmed = [
      { month: "2026-09", afterTax: 800_000_000, paid: 1_000_000_000, openingOverride: null },
      { month: "2026-10", afterTax: 700_000_000, paid: 0, openingOverride: null },
    ];
    expect(openingDebtFor({ month: "2026-10", opening, confirmed })).toEqual({ ok: true, value: 2_706_447_532 });
    expect(openingDebtFor({ month: "2026-11", opening, confirmed })).toEqual({ ok: true, value: 3_406_447_532 });
  });

  it("restarts the chain at a confirmed period's typed opening debt", () => {
    const confirmed = [{ month: "2026-09", afterTax: 100, paid: 0, openingOverride: 1_000 }];
    expect(openingDebtFor({ month: "2026-10", opening, confirmed })).toEqual({ ok: true, value: 1_100 });
  });

  it("needs every month between the opening month and the target to be confirmed", () => {
    const confirmed = [{ month: "2026-10", afterTax: 1, paid: 0, openingOverride: null }];
    expect(openingDebtFor({ month: "2026-11", opening, confirmed })).toEqual({ ok: false, missingMonth: "2026-09" });
  });

  it("can start from a typed opening debt without a contract opening", () => {
    const confirmed = [{ month: "2026-09", afterTax: 50, paid: 20, openingOverride: 100 }];
    expect(openingDebtFor({ month: "2026-10", opening: null, confirmed })).toEqual({ ok: true, value: 130 });
    expect(openingDebtFor({ month: "2026-09", opening: null, confirmed: [] })).toEqual({ ok: false, missingMonth: null });
  });

  it("crosses year boundaries", () => {
    const dec = { amount: 10, month: "2026-12" };
    expect(openingDebtFor({ month: "2027-01", opening: dec, confirmed: [] })).toEqual({ ok: true, value: 10 });
  });
});
