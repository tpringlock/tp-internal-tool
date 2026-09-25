import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMisaLedger } from "./misa-parser";
import { mergeLedgers } from "./merge-ledgers";
import { computeRentFromLedger } from "./engine";
import { vietpanelSenci } from "./contracts/vietpanel-senci";
import type { Ledger } from "./types";

/** Cắt 1 file thành 2 file liên tiếp (như tải tháng riêng lẻ), rồi ghép lại phải ra đúng như cũ. */
function split(l: Ledger, lastDayOfFirst: string): [Ledger, Ledger] {
  const bal = new Map(l.openings.map((o) => [`${o.kho}|${o.maHang}`, o.qty]));
  for (const m of l.movements) if (m.date <= lastDayOfFirst) bal.set(`${m.kho}|${m.maHang}`, (bal.get(`${m.kho}|${m.maHang}`) ?? 0) + m.nhap - m.xuat);
  const first: Ledger = { ...l, to: lastDayOfFirst, movements: l.movements.filter((m) => m.date <= lastDayOfFirst), warnings: [] };
  const second: Ledger = {
    ...l,
    from: "2026-09-16",
    openings: l.openings.map((o) => ({ ...o, qty: bal.get(`${o.kho}|${o.maHang}`)! })),
    movements: l.movements.filter((m) => m.date > lastDayOfFirst),
    warnings: [],
  };
  return [first, second];
}

describe("Ghép nhiều file MISA", () => {
  it("ghép 2 nửa tháng 9 cho kết quả giống hệt file gốc", async () => {
    const full = await parseMisaLedger(readFileSync(new URL("./__fixtures__/misa-2026-09-13cot.xlsx", import.meta.url)));
    const [a, b] = split(full, "2026-09-15");
    const merged = mergeLedgers([b, a]); // thứ tự tải lên không quan trọng
    expect(merged.warnings).toEqual([]);
    const period = { from: "2026-09-01", to: "2026-09-25" };
    expect(computeRentFromLedger(merged, vietpanelSenci, period).totalAmount).toBe(
      computeRentFromLedger(full, vietpanelSenci, period).totalAmount,
    );
  });

  it("báo lỗi khi file không nối tiếp, cảnh báo khi tồn đầu lệch", async () => {
    const full = await parseMisaLedger(readFileSync(new URL("./__fixtures__/misa-2026-09-13cot.xlsx", import.meta.url)));
    const [a, b] = split(full, "2026-09-15");
    expect(() => mergeLedgers([a, { ...b, from: "2026-09-17" }])).toThrow(/không nối tiếp/);
    const lech = { ...b, openings: b.openings.map((o, i) => (i === 0 ? { ...o, qty: o.qty + 1 } : o)) };
    expect(mergeLedgers([a, lech]).warnings.length).toBe(1);
  });
});
