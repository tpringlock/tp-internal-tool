import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import seed from "./seed/gia-dinh-excel-contracts.json";
import expected from "./__fixtures__/excel-tool-expected-2026-06.json";
import { parseMisaLedger } from "./misa-parser";
import { computeRentFromLedger } from "./engine";
import { vietpanelSenci } from "./contracts/vietpanel-senci";
import { buildRentReport, perCodeConfig, splitLedgerByWarehouse, type ReportContract } from "./rent-report";
import type { ContractConfig, Period } from "./types";

// Parses real MISA / Excel files, which is slow on a busy machine: this file
// gets its own timeout instead of raising the global one.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const demo = seed.contracts as ContractConfig[];
const june: Period = { from: "2026-06-01", to: "2026-06-30" };

const asReport = (c: ContractConfig, period: Period = june, over: Partial<ReportContract> = {}): ReportContract => ({
  id: c.id,
  label: `${c.customerName} – ${c.projectName} (${c.misaKho})`,
  misaKho: c.misaKho,
  isDemo: false,
  config: c,
  configError: null,
  period,
  ranges: [],
  ...over,
});

describe("buildRentReport", async () => {
  const ledger = await parseMisaLedger(readFileSync(new URL("./__fixtures__/misa-2026-06-16cot.xlsx", import.meta.url)));

  it("the per-warehouse ledger gives exactly the same results as the whole file", () => {
    const sub = splitLedgerByWarehouse(ledger).get("VIETPANEL-01")!;
    expect(computeRentFromLedger(sub, vietpanelSenci, june)).toEqual(computeRentFromLedger(ledger, vietpanelSenci, june));
  });

  it("per-code lines add up to the normal calculation (merged HSTT lines)", () => {
    const normal = computeRentFromLedger(ledger, vietpanelSenci, june);
    const split = computeRentFromLedger(ledger, perCodeConfig(vietpanelSenci), june);
    expect(vietpanelSenci.items.some((i) => i.maHang.length > 1)).toBe(true);
    expect(split.totalAmount).toBeCloseTo(normal.totalAmount, 6);
    const closing = (r: typeof normal) => r.items.reduce((s, i) => s + i.closingQty, 0);
    // Excluded codes come back as 0đ lines, so only compare priced quantities.
    const pricedSplit = split.items.filter((i) => i.unitPrice > 0);
    expect(pricedSplit.reduce((s, i) => s + i.closingQty, 0)).toBe(closing(normal));
  });

  it("totals per code and per project equal the Excel tool (demo prices, 01–30/06)", () => {
    const p = expected.periods.find((x) => x.from === june.from && x.to === june.to)!;
    const report = buildRentReport(ledger, demo.map((c) => asReport(c)));
    expect(report.errorCount).toBe(0);

    const tienByCode = new Map<string, number>();
    const slNgayByCode = new Map<string, number>();
    const byKho = new Map<string, number>();
    for (const [key, v] of Object.entries(p.combos)) {
      const i = key.lastIndexOf("|");
      const kho = key.slice(0, i);
      const code = key.slice(i + 1);
      tienByCode.set(code, (tienByCode.get(code) ?? 0) + (v.tien ?? 0));
      slNgayByCode.set(code, (slNgayByCode.get(code) ?? 0) + (v.slNgay ?? 0));
      byKho.set(kho, (byKho.get(kho) ?? 0) + (v.tien ?? 0));
    }
    for (const r of report.codes) {
      expect(r.amount, r.maVt).toBeCloseTo(tienByCode.get(r.maVt) ?? 0, 4);
      if (r.unitPrice !== 0) expect(r.qtyDays, r.maVt).toBeCloseTo(slNgayByCode.get(r.maVt) ?? 0, 4);
    }
    for (const pr of report.projects) expect(pr.total, pr.misaKho).toBeCloseTo(byKho.get(pr.misaKho) ?? 0, 6);
    expect(report.total).toBeCloseTo([...byKho.values()].reduce((a, b) => a + b, 0), 4);
    expect(report.codes.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(report.total, 4);
  });

  it("each code's quantities balance: opening + delivered − returned = closing", () => {
    const report = buildRentReport(ledger, demo.map((c) => asReport(c)));
    for (const r of report.codes) expect(r.opening + r.delivered - r.returned, r.maVt).toBeCloseTo(r.closing, 6);
  });

  it("projects by amount, failures last with the reason; prices that differ are null", () => {
    const missing = asReport({ ...vietpanelSenci, id: "x", misaKho: "KHONG-CO-KHO" }, june, { id: "missing" });
    const broken = asReport(vietpanelSenci, june, { id: "broken", config: null, configError: "Bảng giá chưa gộp được." });
    const cheaper: ContractConfig = {
      ...vietpanelSenci,
      items: vietpanelSenci.items.map((i) => ({ ...i, unitPrice: i.unitPrice + 1 })),
    };
    const report = buildRentReport(ledger, [
      missing,
      asReport(vietpanelSenci, june, { id: "vp" }),
      broken,
      asReport(cheaper, june, { id: "vp2", isDemo: true }),
    ]);
    expect(report.projects.map((p) => p.contractId)).toEqual(["vp2", "vp", "missing", "broken"]);
    expect(report.projects[2].error).toMatch(/Không tìm thấy kho/);
    expect(report.projects[3].error).toBe("Bảng giá chưa gộp được.");
    expect([report.okCount, report.errorCount, report.demoCount]).toEqual([2, 2, 1]);
    const priced = report.codes.filter((c) => c.amount > 0);
    expect(priced.length).toBeGreaterThan(0);
    expect(priced.every((c) => c.unitPrice === null && c.projectCount === 2)).toBe(true);
  });

  it("applies each contract's non-billable ranges", () => {
    const ranges = [{ date_from: "2026-06-10", date_to: "2026-06-12", reason: "TEST" }];
    const report = buildRentReport(ledger, [asReport(vietpanelSenci, june, { ranges })]);
    const expectedTotal = computeRentFromLedger(ledger, vietpanelSenci, june, [
      { from: "2026-06-10", to: "2026-06-12", reason: "TEST" },
    ]).totalAmount;
    expect(report.total).toBe(expectedTotal);
    expect(report.total).toBeLessThan(computeRentFromLedger(ledger, vietpanelSenci, june).totalAmount);
  });
});
