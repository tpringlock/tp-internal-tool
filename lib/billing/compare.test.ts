import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import seed from "./seed/gia-dinh-excel-contracts.json";
import expected from "./__fixtures__/excel-tool-expected-2026-06.json";
import { parseMisaLedger } from "./misa-parser";
import { compareContracts } from "./compare";
import type { ContractConfig } from "./types";

const contracts = seed.contracts as ContractConfig[];

describe("compareContracts (Excel report view)", async () => {
  const ledger = await parseMisaLedger(readFileSync(new URL("./__fixtures__/misa-2026-06-16cot.xlsx", import.meta.url)));

  for (const p of expected.periods) {
    it(`${p.from} → ${p.to}: per-warehouse totals equal the Excel tool's`, () => {
      const summary = compareContracts(ledger, contracts, { from: p.from, to: p.to });
      expect(summary.errorCount).toBe(0);

      const excelByKho = new Map<string, number>();
      for (const [key, v] of Object.entries(p.combos)) {
        const kho = key.slice(0, key.lastIndexOf("|"));
        excelByKho.set(kho, (excelByKho.get(kho) ?? 0) + (v.tien ?? 0));
      }
      for (const r of summary.rows) {
        expect(r.total, r.misaKho).toBeCloseTo(excelByKho.get(r.misaKho) ?? 0, 6);
      }
      const excelPositive = [...excelByKho.values()].filter((v) => v > 0);
      expect(summary.positiveCount).toBe(excelPositive.length);
      expect(summary.positiveTotal).toBeCloseTo(excelPositive.reduce((a, b) => a + b, 0), 4);
    });
  }

  it("sorts by amount descending and puts refused contracts last", () => {
    const missing: ContractConfig = { ...contracts[0], misaKho: "KHONG-CO-KHO" };
    const summary = compareContracts(ledger, [missing, ...contracts], { from: "2026-06-01", to: "2026-06-30" });
    const totals = summary.rows.filter((r) => r.total !== null).map((r) => r.total!);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
    const last = summary.rows[summary.rows.length - 1];
    expect(last.misaKho).toBe("KHONG-CO-KHO");
    expect(last.error).toMatch(/Không tìm thấy kho/);
    expect(summary.errorCount).toBe(1);
    expect(summary.rows[0].misaKho).toBe("VIETPANEL-01");
  });
});
