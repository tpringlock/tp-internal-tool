import { describe, expect, it } from "vitest";
import {
  confirmedDebts,
  hsttMissing,
  hsttTransportRows,
  openingDebtInfo,
  parseMoney,
  periodEditBlock,
  type HsttContextData,
} from "./hstt-data";
import type { BillingTransportPrice } from "@/lib/db/types";

describe("parseMoney", () => {
  it("reads Vietnamese-formatted amounts", () => {
    expect(parseMoney("1.550.000.000")).toBe(1_550_000_000);
    expect(parseMoney(" 1 550 000 000 ")).toBe(1_550_000_000);
    expect(parseMoney("1,550,000,000")).toBe(1_550_000_000);
    expect(parseMoney("-25.000")).toBe(-25_000);
    expect(parseMoney("0")).toBe(0);
  });

  it("is null when empty and NaN when not a whole amount", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("  ")).toBeNull();
    expect(parseMoney("12a")).toBeNaN();
    expect(parseMoney("1.5")).toBe(15); // dots are thousand separators
  });
});

describe("periodEditBlock (period data lock)", () => {
  const base = { canEdit: true, status: "draft" as const, periodMonth: "2026-09", isDemo: false, confirmedForPeriod: false };

  it("lets accountants edit a draft month whose period is not confirmed", () => {
    expect(periodEditBlock(base)).toBeNull();
  });

  it("locks the period once ANY calculation of it is confirmed", () => {
    expect(periodEditBlock({ ...base, confirmedForPeriod: true })).toBe("locked");
    expect(periodEditBlock({ ...base, status: "confirmed", confirmedForPeriod: true })).toBe("locked");
  });

  it("refuses viewers, custom ranges, demo contracts and voided calculations", () => {
    expect(periodEditBlock({ ...base, canEdit: false })).toBe("viewer");
    expect(periodEditBlock({ ...base, periodMonth: null })).toBe("notMonth");
    expect(periodEditBlock({ ...base, isDemo: true })).toBe("demo");
    expect(periodEditBlock({ ...base, status: "voided" })).toBe("voided");
  });
});

const price = (over: Partial<BillingTransportPrice>): BillingTransportPrice => ({
  id: "p1",
  contract_id: "c",
  name: "Vận chuyển xe sơ mi 30 tấn",
  unit: "Chuyến",
  unit_price: 5_000_000,
  sort_order: 1,
  active: true,
  updated_by: null,
  created_at: "",
  updated_at: "",
  ...over,
});

describe("hsttTransportRows", () => {
  const prices = [
    price({ id: "p2", name: "Xe thùng 15 tấn", unit_price: 4_500_000, sort_order: 2 }),
    price({ id: "p1" }),
    price({ id: "p3", name: "Cẩu", sort_order: 3, active: false }),
  ];

  it("lists every active vehicle in price-list order, blank when nothing was entered", () => {
    const rows = hsttTransportRows(prices, [
      { transport_price_id: "p1", trips: 4, cumulative_trips: 68, unit_price: 5_000_000, charge_mode: "now", note: "" },
    ]);
    expect(rows.map((r) => [r.priceId, r.name, r.trips, r.cumulativeTrips, r.unitPrice])).toEqual([
      ["p1", "Vận chuyển xe sơ mi 30 tấn", 4, 68, 5_000_000],
      ["p2", "Xe thùng 15 tấn", null, null, 4_500_000],
    ]);
  });

  it("keeps an inactive vehicle that has data for the period, at its saved price", () => {
    const rows = hsttTransportRows(prices, [
      { transport_price_id: "p3", trips: 1, cumulative_trips: null, unit_price: 3_000_000, charge_mode: "end_of_term", note: "x" },
    ]);
    expect(rows.map((r) => [r.priceId, r.unitPrice, r.chargeMode])).toEqual([
      ["p1", 5_000_000, "now"],
      ["p2", 4_500_000, "now"],
      ["p3", 3_000_000, "end_of_term"],
    ]);
  });
});

describe("confirmedDebts + openingDebtInfo", () => {
  const opening = { amount: 2_906_447_532, month: "2026-08" };
  const confirmed = confirmedDebts({
    vatPercent: 8,
    calcs: [{ period_month: "2026-09", period_from: "2026-08-26", total_amount: "100000000.0000" }],
    inputs: [
      {
        period_from: "2026-08-26",
        paid_in_period: 50_000_000,
        opening_debt_override: null,
        transport: [{ trips: 2, unit_price: 5_000_000, charge_mode: "now" }],
        deductions: [{ amount: 1_000_000 }],
      },
    ],
  });

  it("turns a confirmed period into its after-tax total and payment", () => {
    // (100.000.000 + 10.000.000) * 1.08 - 1.000.000
    expect(confirmed).toEqual([{ month: "2026-09", afterTax: 117_800_000, paid: 50_000_000, openingOverride: null }]);
  });

  it("says where the opening debt comes from", () => {
    expect(openingDebtInfo({ month: "2026-09", override: null, opening, confirmed: [] })).toEqual({
      value: 2_906_447_532,
      source: { kind: "initial", month: "2026-08" },
    });
    expect(openingDebtInfo({ month: "2026-10", override: null, opening, confirmed })).toEqual({
      value: 2_906_447_532 + 117_800_000 - 50_000_000,
      source: { kind: "previous", month: "2026-09" },
    });
    expect(openingDebtInfo({ month: "2026-10", override: 5, opening, confirmed })).toEqual({
      value: 5,
      source: { kind: "override" },
    });
    expect(openingDebtInfo({ month: "2026-11", override: null, opening, confirmed })).toEqual({
      value: null,
      source: { kind: "missing", month: "2026-10" },
    });
    expect(openingDebtInfo({ month: "2026-09", override: null, opening: null, confirmed: [] })).toEqual({
      value: null,
      source: { kind: "missing", month: null },
    });
  });
});

describe("hsttMissing", () => {
  const ok: HsttContextData = {
    calcStatus: "confirmed",
    periodMonth: "2026-09",
    isDemo: false,
    company: { ten_in_hoa: "TP", mst: "0105204346", so_tk: "1", dai_dien: "Ông A" },
    hstt: { contract_date: "2025-12-04", du_an_ten: "Senci" },
    contractNo: "0412",
    customer: { ten_in_hoa: "VIỆT PANEL", ten_thuong: "Việt Panel", mst: "1" },
    openingValue: 1,
    openingSource: { kind: "initial", month: "2026-08" },
  };

  it("is empty when everything needed is there", () => {
    expect(hsttMissing(ok)).toEqual([]);
  });

  it("only allows confirmed billing-month calculations of real contracts", () => {
    expect(hsttMissing({ ...ok, calcStatus: "draft" }).map((m) => m.key)).toEqual(["notConfirmed"]);
    expect(hsttMissing({ ...ok, calcStatus: "voided" }).map((m) => m.key)).toEqual(["notConfirmed"]);
    expect(hsttMissing({ ...ok, periodMonth: null }).map((m) => m.key)).toContain("notMonth");
    expect(hsttMissing({ ...ok, isDemo: true }).map((m) => m.key)).toContain("demo");
  });

  it("lists every missing piece of data", () => {
    const keys = hsttMissing({
      ...ok,
      company: null,
      hstt: null,
      contractNo: "",
      customer: null,
      openingValue: null,
      openingSource: { kind: "missing", month: "2026-08" },
    }).map((m) => m.key);
    expect(keys).toEqual(["company", "contractHstt", "contractNo", "customer", "openingMissingMonth"]);
  });

  it("names the incomplete fields", () => {
    const missing = hsttMissing({
      ...ok,
      company: { ...ok.company!, mst: " " },
      hstt: { contract_date: null, du_an_ten: "" },
      customer: { ...ok.customer!, ten_thuong: "" },
      openingValue: null,
      openingSource: { kind: "missing", month: null },
    });
    expect(missing).toEqual([
      { key: "companyField", values: { field: "mst" } },
      { key: "contractDate" },
      { key: "projectName" },
      { key: "customerField", values: { field: "ten_thuong" } },
      { key: "openingNone" },
    ]);
  });
});
