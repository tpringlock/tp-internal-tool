import { describe, expect, it } from "vitest";
import { computeRentSchema } from "./validation";

const base = {
  contract_id: "7b0c6f3e-2d7e-4f7a-9d3b-1f2e3a4b5c6d",
  upload_ids: ["0f9e8d7c-6b5a-4c3d-8e1f-2a3b4c5d6e7f"],
};
const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.message);

describe("computeRentSchema", () => {
  it("accepts a billing month", () => {
    const r = computeRentSchema.safeParse({ ...base, mode: "month", month: "2026-08" });
    expect(r.success).toBe(true);
  });

  it("rejects a bad month", () => {
    const r = computeRentSchema.safeParse({ ...base, mode: "month", month: "2026-13" });
    expect(messages(r)).toContain("monthInvalid");
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

  it("requires at least one MISA file", () => {
    const r = computeRentSchema.safeParse({ ...base, upload_ids: [], mode: "month", month: "2026-08" });
    expect(messages(r)).toContain("chooseUpload");
  });
});
