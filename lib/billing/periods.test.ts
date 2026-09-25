import { describe, expect, it } from "vitest";
import { contractPeriod, defaultBillingMonth, overlapsPeriod, rangesForPeriod, suggestUploads } from "./periods";

describe("defaultBillingMonth", () => {
  it("suggests the latest period that has ended", () => {
    expect(defaultBillingMonth("2026-09-25")).toBe("2026-08");
    expect(defaultBillingMonth("2026-09-26")).toBe("2026-09");
    expect(defaultBillingMonth("2026-01-10")).toBe("2025-12");
    expect(defaultBillingMonth("2026-12-31")).toBe("2026-12");
  });
});

describe("contractPeriod", () => {
  it("uses the contract start to shorten the first period", () => {
    expect(contractPeriod("2025-12", 26, "2025-12-20")).toEqual({ from: "2025-12-20", to: "2025-12-25" });
    expect(contractPeriod("2026-08", 26, null)).toEqual({ from: "2026-07-26", to: "2026-08-25" });
  });
});

describe("rangesForPeriod", () => {
  it("keeps only overlapping ranges, sorted", () => {
    const rows = [
      { date_from: "2026-03-01", date_to: "2026-03-02", reason: "x" },
      { date_from: "2026-02-09", date_to: "2026-02-23", reason: "Tết" },
      { date_from: "2026-01-20", date_to: "2026-01-26", reason: "edge" },
    ];
    expect(rangesForPeriod(rows, { from: "2026-01-26", to: "2026-02-25" })).toEqual([
      { from: "2026-01-20", to: "2026-01-26", reason: "edge" },
      { from: "2026-02-09", to: "2026-02-23", reason: "Tết" },
    ]);
  });
});

describe("suggestUploads", () => {
  const period = { from: "2026-08-26", to: "2026-09-25" };
  const u = (id: string, file_from: string, file_to: string, created_at = "2026-09-01") => ({
    id,
    file_from,
    file_to,
    created_at,
  });

  it("picks a single custom-range file", () => {
    expect(suggestUploads([u("a", "2026-08-26", "2026-09-25")], period)).toEqual(["a"]);
  });

  it("chains two monthly files", () => {
    const list = [u("sep", "2026-09-01", "2026-09-30"), u("aug", "2026-08-01", "2026-08-31")];
    expect(suggestUploads(list, period)).toEqual(["aug", "sep"]);
  });

  it("prefers the newest of identical files", () => {
    const list = [
      u("old", "2026-08-01", "2026-09-30", "2026-09-01"),
      u("new", "2026-08-01", "2026-09-30", "2026-09-26"),
    ];
    expect(suggestUploads(list, period)).toEqual(["new"]);
  });

  it("returns nothing when there is a gap or the start is missing", () => {
    expect(suggestUploads([u("sep", "2026-09-01", "2026-09-30")], period)).toEqual([]);
    expect(
      suggestUploads([u("aug", "2026-08-01", "2026-08-30"), u("sep", "2026-09-01", "2026-09-30")], period),
    ).toEqual([]);
  });

  it("overlapsPeriod", () => {
    expect(overlapsPeriod(u("x", "2026-09-01", "2026-09-30"), period)).toBe(true);
    expect(overlapsPeriod(u("x", "2026-06-01", "2026-06-30"), period)).toBe(false);
  });
});
