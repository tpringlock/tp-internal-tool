import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import seed from "./seed/gia-dinh-excel-contracts.json";
import expected from "./__fixtures__/excel-tool-expected-2026-06.json";
import { parseMisaLedger } from "./misa-parser";
import { computeRentFromLedger } from "./engine";
import type { ContractConfig } from "./types";

/**
 * Đối chiếu với tool Excel "Tính tiền thuê tự động TP": nạp ĐƠN GIÁ GIẢ ĐỊNH của Excel,
 * chạy engine cho MỌI kho, so SL-ngày và tiền thuê từng tổ hợp kho–mã với số Excel đã tính sẵn.
 */
describe("Tương thích với tool Excel (đơn giá giả định, dữ liệu tháng 6/2026)", async () => {
  const ledger = await parseMisaLedger(readFileSync(new URL("./__fixtures__/misa-2026-06-16cot.xlsx", import.meta.url)));
  const contracts = seed.contracts as ContractConfig[];

  for (const p of expected.periods) {
    it(`kỳ ${p.from} → ${p.to}: khớp từng tổ hợp kho–mã`, () => {
      const ours: Record<string, { slNgay: number; tien: number }> = {};
      for (const c of contracts) {
        const res = computeRentFromLedger(ledger, c, { from: p.from, to: p.to });
        for (const it of res.items) {
          const ma = c.items.find((i) => i.name === it.name)!.maHang[0];
          ours[`${c.misaKho}|${ma}`] = {
            slNgay: it.lines.reduce((s, l) => s + l.qty * l.days, 0),
            tien: it.amount,
          };
        }
      }
      const mismatches: string[] = [];
      let compared = 0;
      for (const [key, ex] of Object.entries(p.combos)) {
        const o = ours[key] ?? { slNgay: 0, tien: 0 };
        compared++;
        if (Math.abs(o.slNgay - (ex.slNgay ?? 0)) > 1e-6 || Math.abs(o.tien - (ex.tien ?? 0)) > 1e-6) {
          mismatches.push(`${key}: web ${o.slNgay} SL-ngày / ${o.tien}đ ≠ Excel ${ex.slNgay} / ${ex.tien}đ`);
        }
      }
      // tổ hợp web có tiền mà Excel không có
      for (const [key, o] of Object.entries(ours)) if (!(key in p.combos) && o.tien !== 0) mismatches.push(`${key}: chỉ có trên web (${o.tien}đ)`);
      expect(mismatches).toEqual([]);
      expect(compared).toBeGreaterThan(1500);
      const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
      expect(sum(Object.values(ours).map((v) => v.tien))).toBeCloseTo(sum(Object.values(p.combos).map((v) => v.tien ?? 0)), 6);
    });
  }

  it("VIETPANEL-01 tháng 6 = 1.055.061.425đ như màn hình Excel", () => {
    const c = contracts.find((x) => x.misaKho === "VIETPANEL-01")!;
    expect(computeRentFromLedger(ledger, c, { from: "2026-06-01", to: "2026-06-30" }).totalAmount).toBe(1_055_061_425);
  });
});
