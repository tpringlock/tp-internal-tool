import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { billingPeriod } from "./dates";
import { matchContractMonth, presetPeriod, presetPeriodFor, presetUsage } from "./period-presets";

describe("presetPeriod", () => {
  it("26 -> 25, 1 month = billingPeriod", () => {
    expect(presetPeriod({ start_day: 26, months: 1 }, "2026-08")).toEqual({ from: "2026-07-26", to: "2026-08-25" });
    for (const d of [2, 15, 26, 28]) {
      for (const m of ["2026-01", "2026-03", "2028-03", "2026-12"]) {
        expect(presetPeriod({ start_day: d, months: 1 }, m)).toEqual(billingPeriod(m, d));
      }
    }
  });

  it("calendar month", () => {
    expect(presetPeriod({ start_day: 1, months: 1 }, "2026-09")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetPeriod({ start_day: 1, months: 1 }, "2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("February with start day 1, leap and common years", () => {
    expect(presetPeriod({ start_day: 1, months: 1 }, "2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(presetPeriod({ start_day: 1, months: 1 }, "2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetPeriod({ start_day: 1, months: 3 }, "2028-03")).toEqual({ from: "2028-01-01", to: "2028-03-31" });
  });

  it("26 x 3 months ending 09/2026", () => {
    expect(presetPeriod({ start_day: 26, months: 3 }, "2026-09")).toEqual({ from: "2026-06-26", to: "2026-09-25" });
  });

  it("1 x 12 months ending 12/2026", () => {
    expect(presetPeriod({ start_day: 1, months: 12 }, "2026-12")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("crosses the year", () => {
    expect(presetPeriod({ start_day: 26, months: 6 }, "2027-02")).toEqual({ from: "2026-08-26", to: "2027-02-25" });
    expect(presetPeriod({ start_day: 26, months: 12 }, "2026-12")).toEqual({ from: "2025-12-26", to: "2026-12-25" });
  });

  it("rejects bad input", () => {
    expect(() => presetPeriod({ start_day: 0, months: 1 }, "2026-09")).toThrow();
    expect(() => presetPeriod({ start_day: 29, months: 1 }, "2026-09")).toThrow();
    expect(() => presetPeriod({ start_day: 26, months: 2 as 1 }, "2026-09")).toThrow();
    expect(() => presetPeriod({ start_day: 26, months: 1 }, "2026-13")).toThrow();
  });
});

describe("matchContractMonth / presetPeriodFor", () => {
  const vietpanel = { period_start_day: 26, contract_start: "2025-12-20" };

  it("only the contract's own period is a billing month", () => {
    expect(matchContractMonth({ from: "2026-07-26", to: "2026-08-25" }, vietpanel)).toBe("2026-08");
    expect(matchContractMonth({ from: "2026-08-01", to: "2026-08-31" }, vietpanel)).toBeNull();
    expect(matchContractMonth({ from: "2026-07-26", to: "2026-08-24" }, vietpanel)).toBeNull();
    // First period is shortened by the contract start.
    expect(matchContractMonth({ from: "2025-12-20", to: "2025-12-25" }, vietpanel)).toBe("2025-12");
    expect(matchContractMonth({ from: "2025-11-26", to: "2025-12-25" }, vietpanel)).toBeNull();
  });

  it("the contract's preset keeps the contract-start shortening and is confirmable", () => {
    expect(presetPeriodFor({ start_day: 26, months: 1 }, "2025-12", vietpanel)).toEqual({
      period: { from: "2025-12-20", to: "2025-12-25" },
      periodMonth: "2025-12",
    });
    expect(presetPeriodFor({ start_day: 26, months: 1 }, "2026-08", vietpanel)).toEqual({
      period: { from: "2026-07-26", to: "2026-08-25" },
      periodMonth: "2026-08",
    });
  });

  it("other presets are custom ranges", () => {
    expect(presetPeriodFor({ start_day: 1, months: 1 }, "2026-08", vietpanel)).toEqual({
      period: { from: "2026-08-01", to: "2026-08-31" },
      periodMonth: null,
    });
    expect(presetPeriodFor({ start_day: 26, months: 3 }, "2026-09", vietpanel).periodMonth).toBeNull();
    // A contract on another start day: the 26 -> 25 preset is not its period.
    expect(presetPeriodFor({ start_day: 26, months: 1 }, "2026-08", { period_start_day: 21, contract_start: null }).periodMonth).toBeNull();
    expect(presetPeriodFor({ start_day: 26, months: 1 }, "2026-08", null).periodMonth).toBeNull();
  });
});

describe("deleting a preset in use", () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

  it("counts the contracts using each preset", () => {
    const used = presetUsage([{ preset_id: "a" }, { preset_id: "b" }, { preset_id: "a" }]);
    expect(used.get("a")).toBe(2);
    expect(used.get("b")).toBe(1);
    expect(used.get("c")).toBeUndefined();
  });

  it("the DB refuses it (0040: preset_id ... on delete restrict)", () => {
    const sql = read("supabase/migrations/0040_billing_period_presets.sql");
    const table = sql.slice(sql.indexOf("create table public.billing_contract_period_presets"));
    expect(table).toMatch(/preset_id\s+uuid not null references public\.billing_period_presets \(id\) on delete restrict/);
    expect(table.slice(0, table.indexOf(");"))).not.toMatch(/billing_period_presets \(id\) on delete cascade/);
  });

  it("the action checks usage before deleting and maps the FK error to the same message", () => {
    const src = read("app/actions/billing-periods.ts");
    const fn = src.slice(src.indexOf("export async function deletePeriodPreset"));
    const body = fn.slice(0, fn.indexOf("\nexport async function"));
    expect(body.indexOf('t("errInUse"')).toBeGreaterThan(-1);
    expect(body.indexOf('t("errInUse"')).toBeLessThan(body.indexOf(".delete()"));
    expect(body).toContain("FK_VIOLATION");
  });
});
