import { describe, expect, it } from "vitest";
import { computeRentSchema } from "./validation";

const base = {
  contract_id: "7b0c6f3e-2d7e-4f7a-9d3b-1f2e3a4b5c6d",
  source: "months",
  upload_ids: [],
};
const preset = { mode: "preset", start_day: "26", months: "1" };
const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.message);

describe("computeRentSchema", () => {
  it("accepts a preset + month, without picked files", () => {
    const r = computeRentSchema.safeParse({ ...base, ...preset, month: "2026-08" });
    expect(r.success).toBe(true);
    if (r.success && r.data.mode === "preset") expect([r.data.start_day, r.data.months]).toEqual([26, 1]);
  });

  it("rejects a bad month or preset", () => {
    expect(messages(computeRentSchema.safeParse({ ...base, ...preset, month: "2026-13" }))).toContain("monthInvalid");
    expect(
      messages(computeRentSchema.safeParse({ ...base, ...preset, start_day: "29", month: "2026-08" })),
    ).toContain("presetStartDayRange");
    expect(
      messages(computeRentSchema.safeParse({ ...base, ...preset, months: "2", month: "2026-08" })),
    ).toContain("presetMonthsInvalid");
  });

  it("accepts a custom range, including a single day", () => {
    for (const [from, to] of [
      ["2026-09-01", "2026-09-24"],
      ["2026-09-24", "2026-09-24"],
    ]) {
      const r = computeRentSchema.safeParse({ ...base, mode: "range", date_from: from, date_to: to });
      expect(r.success).toBe(true);
    }
  });

  it("rejects reversed or overly long ranges", () => {
    const reversed = computeRentSchema.safeParse({
      ...base,
      mode: "range",
      date_from: "2026-09-10",
      date_to: "2026-09-01",
    });
    expect(messages(reversed)).toContain("rangeOrder");
    const long = computeRentSchema.safeParse({
      ...base,
      mode: "range",
      date_from: "2025-01-01",
      date_to: "2026-09-01",
    });
    expect(messages(long)).toContain("rangeTooLong");
  });

  it("requires at least one file only for the legacy-file fallback", () => {
    const r = computeRentSchema.safeParse({ ...base, source: "files", ...preset, month: "2026-08" });
    expect(messages(r)).toContain("chooseUpload");
    const ok = computeRentSchema.safeParse({
      ...base,
      source: "files",
      upload_ids: ["0f9e8d7c-6b5a-4c3d-8e1f-2a3b4c5d6e7f"],
      ...preset,
      month: "2026-08",
    });
    expect(ok.success).toBe(true);
  });
});
