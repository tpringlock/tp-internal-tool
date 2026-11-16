import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "./format";

describe("formatDateTime", () => {
  it("uses a numeric day/month/year and 24h time in ICT", () => {
    // 03:00 UTC is 10:00 in Asia/Ho_Chi_Minh.
    expect(formatDateTime("2026-10-06T03:00:00Z")).toBe("06/10/2026, 10:00");
  });

  it("rolls over to the next day in ICT", () => {
    expect(formatDateTime("2026-08-05T17:30:00Z")).toBe("06/08/2026, 00:30");
  });

  it("has no English month name", () => {
    expect(formatDateTime("2026-11-16T17:50:00Z")).not.toMatch(/[A-Za-z]/);
  });

  it("shows the same date as formatDate", () => {
    const iso = "2026-09-23T08:15:00Z";
    expect(formatDateTime(iso).startsWith(formatDate(iso))).toBe(true);
  });
});
