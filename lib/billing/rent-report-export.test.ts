import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import seed from "./seed/gia-dinh-excel-contracts.json";
import { parseMisaLedger } from "./misa-parser";
import { vietpanelSenci } from "./contracts/vietpanel-senci";
import { buildRentReport, type ReportContract } from "./rent-report";
import { exportRentReportXlsx, sheetNameFor } from "./rent-report-export";
import type { ContractConfig, Period } from "./types";

// Parses real MISA / Excel files, which is slow on a busy machine: this file
// gets its own timeout instead of raising the global one.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const june: Period = { from: "2026-06-01", to: "2026-06-30" };
const asReport = (c: ContractConfig, over: Partial<ReportContract> = {}): ReportContract => ({
  id: c.id,
  label: `${c.customerName} – ${c.projectName} (${c.misaKho})`,
  misaKho: c.misaKho,
  isDemo: false,
  config: c,
  configError: null,
  period: june,
  ranges: [],
  ...over,
});

type FormulaValue = { formula: string; result: number };
const isFormula = (v: unknown): v is FormulaValue => !!v && typeof v === "object" && "formula" in v;
// exceljs drops a cached result of 0 when writing (Excel recalculates on open).
const valueOf = (v: unknown): number => (isFormula(v) ? Number(v.result ?? 0) : Number(v ?? 0));
const dayNo = (d: unknown) => Math.round((d as Date).getTime() / 86_400_000);

describe("sheetNameFor", () => {
  it("strips forbidden characters, cuts to 31 and keeps names unique", () => {
    const taken = new Set<string>();
    expect(sheetNameFor("KHO/A:B*C?[1]", taken)).toBe("KHO-A-B-C--1-");
    expect(sheetNameFor("kho/a:b*c?[1]", taken)).toBe("kho-a-b-c--1- (2)");
    const long = sheetNameFor("X".repeat(40), taken);
    expect(long).toHaveLength(31);
    expect(sheetNameFor("X".repeat(40), taken)).toBe(`${"X".repeat(27)} (2)`);
  });
});

describe("exportRentReportXlsx", async () => {
  const ledger = await parseMisaLedger(readFileSync(new URL("./__fixtures__/misa-2026-06-16cot.xlsx", import.meta.url)));
  const demo = (seed.contracts as ContractConfig[]).slice(0, 25);
  const ranges = [{ date_from: "2026-06-10", date_to: "2026-06-11", reason: "TEST" }];
  const report = buildRentReport(
    ledger,
    [
      asReport(vietpanelSenci, { ranges }),
      asReport({ ...vietpanelSenci, misaKho: "KHONG-CO-KHO" }, { id: "missing" }),
      ...demo.map((c) => asReport(c, { isDemo: true })),
    ],
    { keepResults: true },
  );
  const buffer = await exportRentReportXlsx({
    report,
    results: report.results!,
    period: june,
    files: ["Tháng 06/2026 · v1"],
    title: "Tháng dương lịch 06/2026",
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  it("has the summary, the project list and one sheet per calculated project", () => {
    const names = wb.worksheets.map((w) => w.name);
    expect(names.slice(0, 3)).toEqual(["Tổng hợp", "Danh sách dự án", "VIETPANEL-01"]);
    expect(names).toHaveLength(2 + report.okCount);
    expect(names).not.toContain("KHONG-CO-KHO");
  });

  it("detail lines: H = E − D + 1 (− exempt days), J = I × H × G, with matching cached results", () => {
    const ws = wb.getWorksheet("VIETPANEL-01")!;
    let lines = 0;
    let exempt = 0;
    let sumJ = 0;
    ws.eachRow((row, r) => {
      const h = row.getCell(8).value;
      if (!isFormula(h)) return;
      lines++;
      expect(h.formula).toMatch(new RegExp(`^E${r}-D${r}\\+1(-\\d+)?$`));
      const minus = Number(/-(\d+)$/.exec(h.formula)?.[1] ?? 0);
      if (minus) exempt++;
      expect(h.result).toBe(dayNo(row.getCell(5).value) - dayNo(row.getCell(4).value) + 1 - minus);
      const j = row.getCell(10).value as FormulaValue;
      expect(j.formula).toBe(`I${r}*H${r}*G${r}`);
      expect(j.result).toBeCloseTo(valueOf(row.getCell(9).value) * h.result * valueOf(row.getCell(7).value), 4);
      sumJ += j.result;
    });
    expect(lines).toBeGreaterThan(10);
    expect(exempt).toBeGreaterThan(0);
    const vp = report.projects.find((p) => p.misaKho === "VIETPANEL-01")!;
    expect(sumJ).toBeCloseTo(vp.total!, 4);
    // Section row and total both carry the amount; the total is a SUBTOTAL.
    const total = ws.getRow(5).getCell(10).value as FormulaValue;
    expect(total.result).toBeCloseTo(vp.total!, 4);
    const totalCell = ws.getCell(total.formula).value as FormulaValue;
    expect(totalCell.formula).toMatch(/^SUBTOTAL\(9,J6:J\d+\)$/);
  });

  it("project list: amounts point at the detail totals, failures last with the reason, SUBTOTAL total", () => {
    const ws = wb.getWorksheet("Danh sách dự án")!;
    const rows: { kho: string; f: unknown; note: unknown }[] = [];
    ws.eachRow((row) => {
      if (typeof row.getCell(1).value === "number") rows.push({ kho: String(row.getCell(2).value), f: row.getCell(6).value, note: row.getCell(7).value });
    });
    expect(rows.map((r) => r.kho)).toEqual(report.projects.map((p) => p.misaKho));
    expect((rows[0].f as FormulaValue).formula).toBe(`'${rows[0].kho}'!J${(wb.getWorksheet(rows[0].kho)!.getRow(5).getCell(10).value as FormulaValue).formula.slice(1)}`);
    const last = rows[rows.length - 1];
    expect(last.kho).toBe("KHONG-CO-KHO");
    expect(last.f).toBeNull();
    expect(String(last.note)).toMatch(/Không tìm thấy kho/);
    let total: FormulaValue | null = null;
    ws.eachRow((row) => {
      const v = row.getCell(6).value;
      if (isFormula(v) && v.formula.startsWith("SUBTOTAL")) total = v;
    });
    expect(total!.result).toBeCloseTo(report.total, 4);
  });

  it("summary per code: closing = opening + delivered − returned, total = report total", () => {
    const ws = wb.getWorksheet("Tổng hợp")!;
    let sum = 0;
    let codes = 0;
    ws.eachRow((row, r) => {
      const i = row.getCell(9).value;
      if (!isFormula(i)) return;
      codes++;
      expect(i.formula).toBe(`F${r}+G${r}-H${r}`);
      expect(valueOf(i)).toBeCloseTo(valueOf(row.getCell(6).value) + valueOf(row.getCell(7).value) - valueOf(row.getCell(8).value), 4);
      sum += valueOf(row.getCell(11).value);
    });
    expect(codes).toBe(report.codes.length);
    expect(sum).toBeCloseTo(report.total, 4);
  });

  it("flags demo contracts in the header", () => {
    const text: string[] = [];
    wb.getWorksheet("Tổng hợp")!.eachRow((row) => text.push(String(row.getCell(1).value ?? "")));
    expect(text.some((t) => t.includes("HỢP ĐỒNG GIẢ ĐỊNH"))).toBe(true);
  });
});
