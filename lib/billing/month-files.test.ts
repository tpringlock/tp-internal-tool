import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseMisaLedger } from "./misa-parser";
import { readMisaTitle } from "./misa-title";
import {
  checkMisaScope,
  checkMonthFile,
  countVouchers,
  missingMonths,
  planMonthUpload,
  uploadsForPicker,
  fullMonthOf,
  monthsCovering,
  pickMonthFiles,
  describeSourceFiles,
} from "./month-files";
import { presetPeriod } from "./period-presets";

// Parses real MISA / Excel files, which is slow on a busy machine: this file
// gets its own timeout instead of raising the global one.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const fixture = (f: string) => readFileSync(new URL(`./__fixtures__/${f}`, import.meta.url));

describe("month file checks (upload)", () => {
  it("accepts the real MISA month exports", async () => {
    for (const [file, month] of [
      ["misa-2026-06-16cot.xlsx", "2026-06"],
      ["misa-2026-09-13cot.xlsx", "2026-09"],
    ] as const) {
      const buf = fixture(file);
      const [title, ledger] = await Promise.all([readMisaTitle(buf), parseMisaLedger(buf)]);
      expect(title).toMatch(/^Kho: <<Tất cả>>/);
      expect(checkMonthFile({ title, from: ledger.from, to: ledger.to })).toEqual({ ok: true, month });
    }
  }, 30_000); // parses two real MISA files

  it("refuses a file filtered to one warehouse", () => {
    expect(checkMisaScope("Kho: VIETPANEL-01, Tháng 9 năm 2026")).toMatch(/chỉ có kho "VIETPANEL-01"/);
    expect(checkMisaScope("Tháng 9 năm 2026")).toMatch(/Không thấy "Kho: <<Tất cả>>"/);
    expect(checkMisaScope("Kho: <<Tất cả>>, Tháng 9 năm 2026")).toBeNull();
    expect(checkMisaScope("Kho: <<Tất cả>>, Tháng 9 năm 2026".normalize("NFD"))).toBeNull();
  });

  it("requires exactly one calendar month and says why not", () => {
    expect(fullMonthOf("2026-09-01", "2026-09-30")).toEqual({ ok: true, month: "2026-09" });
    expect(fullMonthOf("2028-02-01", "2028-02-29")).toEqual({ ok: true, month: "2028-02" }); // leap year
    const r = (from: string, to: string) => {
      const c = fullMonthOf(from, to);
      return c.ok ? "ok" : c.error;
    };
    expect(r("2026-08-26", "2026-09-25")).toMatch(/không phải ngày 01/); // a 26 -> 25 file
    expect(r("2026-09-01", "2026-09-15")).toMatch(/chỉ đến ngày 15\/09\/2026, chưa hết tháng 09\/2026/);
    expect(r("2026-08-01", "2026-09-30")).toMatch(/nhiều tháng/);
    expect(r("2027-02-01", "2027-02-29")).toMatch(/nhiều tháng|chưa hết/); // not a real date: never accepted
    expect(r("2026-07-01", "2026-09-30")).toMatch(/nhiều tháng/); // a quarter
    expect(checkMonthFile({ title: "Kho: X, Tháng 9 năm 2026", from: "2026-09-01", to: "2026-09-30" }).ok).toBe(false);
  });

  it("counts distinct voucher numbers", async () => {
    const l = await parseMisaLedger(fixture("misa-2026-09-13cot.xlsx"));
    const n = countVouchers(l);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(l.movements.length);
    expect(countVouchers({ movements: [{ soCt: "A" }, { soCt: " A " }, { soCt: "" }, { soCt: "B" }] as never })).toBe(2);
  });
});

describe("uploading a new version", () => {
  it("first file of a month is version 1, replacing nothing", () => {
    expect(planMonthUpload([])).toEqual({ version: 1, replaces: null, needsAdmin: false });
  });
  it("next version replaces the active one; admin needed only when a confirmed calculation uses it", () => {
    const versions = [
      { version: 1, status: "superseded" as const, confirmedUses: 2 },
      { version: 2, status: "active" as const, confirmedUses: 0 },
    ];
    expect(planMonthUpload(versions)).toEqual({ version: 3, replaces: 2, needsAdmin: false });
    versions[1].confirmedUses = 1;
    expect(planMonthUpload(versions).needsAdmin).toBe(true);
  });
  it("lists the months missing between the first and the last", () => {
    expect(missingMonths(["2026-09", "2026-06", "2026-08"])).toEqual(["2026-07"]);
    expect(missingMonths(["2026-11", "2027-02"])).toEqual(["2026-12", "2027-01"]);
    expect(missingMonths([])).toEqual([]);
  });
});

describe("files offered on the calculate form", () => {
  it("keeps the active version of each month and legacy files, hides replaced versions, keeps the order", () => {
    const uploads = [{ id: "u8v3" }, { id: "legacy" }, { id: "u8v1" }, { id: "u6v3" }, { id: "u6v1" }];
    const rows = [
      { upload_id: "u8v3", month: "2026-08", version: 3, status: "active" as const },
      { upload_id: "u8v1", month: "2026-08", version: 1, status: "superseded" as const },
      { upload_id: "u6v3", month: "2026-06", version: 3, status: "active" as const },
      { upload_id: "u6v1", month: "2026-06", version: 1, status: "superseded" as const },
    ];
    expect(uploadsForPicker(uploads, rows)).toEqual([
      { id: "u8v3", month: "2026-08", version: 3 },
      { id: "legacy", month: null, version: null },
      { id: "u6v3", month: "2026-06", version: 3 },
    ]);
  });
});

describe("choosing month files for a period", () => {
  const active = [
    { month: "2026-06", upload_id: "u6", version: 2 },
    { month: "2026-07", upload_id: "u7", version: 1 },
    { month: "2026-09", upload_id: "u9", version: 1 },
    { month: "2026-12", upload_id: "u12", version: 1 },
    { month: "2027-01", upload_id: "u1", version: 3 },
  ];

  it("26 -> 25 period takes both months, oldest first", () => {
    const p = pickMonthFiles({ from: "2026-06-26", to: "2026-07-25" }, active);
    expect(p.months).toEqual(["2026-06", "2026-07"]);
    expect(p.files.map((f) => f.upload_id)).toEqual(["u6", "u7"]);
    expect(p.error).toBeNull();
  });

  it("calendar month takes one file", () => {
    expect(pickMonthFiles({ from: "2026-09-01", to: "2026-09-30" }, active).files.map((f) => f.upload_id)).toEqual(["u9"]);
  });

  it("crosses the new year", () => {
    const p = pickMonthFiles({ from: "2026-12-26", to: "2027-01-25" }, active);
    expect(p.months).toEqual(["2026-12", "2027-01"]);
    expect(p.files.map((f) => f.upload_id)).toEqual(["u12", "u1"]);
  });

  it("reports every missing month instead of skipping it", () => {
    const p = pickMonthFiles({ from: "2026-07-26", to: "2026-09-25" }, active);
    expect(p.months).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(p.missing).toEqual(["2026-08"]);
    expect(p.error).toBe("Thiếu file tháng 08/2026.");
    const q = pickMonthFiles({ from: "2026-01-01", to: "2026-03-31" }, active);
    expect(q.error).toBe("Thiếu file tháng 01/2026, 02/2026, 03/2026.");
    expect(q.files).toEqual([]);
  });

  it("monthsCovering handles February and single days", () => {
    expect(monthsCovering({ from: "2028-01-26", to: "2028-02-29" })).toEqual(["2028-01", "2028-02"]);
    expect(monthsCovering({ from: "2026-10-01", to: "2026-10-01" })).toEqual(["2026-10"]);
    expect(monthsCovering({ from: "2026-11-26", to: "2027-05-25" })).toHaveLength(7);
  });
});

describe("month files for preset periods", () => {
  it("26 x 3 months ending 09/2026 needs June to September", () => {
    const p = pickMonthFiles(presetPeriod({ start_day: 26, months: 3 }, "2026-09"), [
      { month: "2026-06", upload_id: "u6", version: 1 },
      { month: "2026-07", upload_id: "u7", version: 1 },
      { month: "2026-09", upload_id: "u9", version: 1 },
    ]);
    expect(p.months).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(p.error).toBe("Thiếu file tháng 08/2026.");
  });

  it("calendar month needs only its own month", () => {
    expect(monthsCovering(presetPeriod({ start_day: 1, months: 1 }, "2028-02"))).toEqual(["2028-02"]);
  });
});

describe("files a calculation used", () => {
  it("keeps upload order, labels month versions, legacy and deleted files", () => {
    const out = describeSourceFiles(
      ["a", "b", "gone"],
      [
        { id: "b", file_name: "T08.xlsx", file_from: "2026-08-01", file_to: "2026-08-31" },
        { id: "a", file_name: "cu.xlsx", file_from: "2026-06-26", file_to: "2026-07-31" },
      ],
      [{ upload_id: "b", month: "2026-08", version: 2, status: "superseded" }],
    );
    expect(out.map((f) => [f.upload_id, f.month, f.version, f.superseded, f.deleted])).toEqual([
      ["a", null, null, false, false],
      ["b", "2026-08", 2, true, false],
      ["gone", null, null, false, true],
    ]);
  });
});
