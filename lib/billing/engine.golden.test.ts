import { describe, expect, it } from "vitest";
import golden from "./__fixtures__/vietpanel-senci-golden.json";
import { calculateRent } from "./engine";
import { billingPeriod } from "./dates";
import { vietpanelSenci } from "./contracts/vietpanel-senci";
import type { DateRange, RentInput } from "./types";

type GLine = (typeof golden.periods)[number]["lines"][number];

/**
 * Kỳ 02/2026 HSTT trừ 15 ngày Tết cho mọi dòng. Khoảng ngày cụ thể CHƯA được anh Dũng xác nhận;
 * mọi phiếu kỳ đó đều trước 09/02 nên bất kỳ khoảng 15 ngày nào trong 09/02–25/02 cũng cho cùng kết quả.
 */
const TET_2026: DateRange = { from: "2026-02-09", to: "2026-02-23", reason: "Nghỉ Tết Nguyên đán 2026 (giả định)" };

function toInput(p: (typeof golden.periods)[number]): RentInput {
  const byItem = new Map<string, GLine[]>();
  for (const l of p.lines) byItem.set(l.item, [...(byItem.get(l.item) ?? []), l]);
  return {
    period: { from: p.from, to: p.to },
    excludedRanges: p.excluded_days_per_line ? [TET_2026] : [],
    items: [...byItem].map(([name, lines]) => {
      const price = new Set(lines.map((l) => l.unit_price));
      expect(price.size).toBe(1);
      return {
        name,
        unit: lines[0].unit,
        unitPrice: lines[0].unit_price,
        opening: lines.filter((l) => l.is_opening).reduce((s, l) => s + l.qty, 0),
        movements: lines.filter((l) => !l.is_opening).map((l) => ({ date: l.date, qty: l.qty, ref: `dòng HSTT` })),
      };
    }),
  };
}

describe("Engine tái tạo đúng HSTT thật của Việt Panel – Senci", () => {
  for (const p of golden.periods) {
    it(`kỳ ${p.label} (${p.from} → ${p.to})`, () => {
      const res = calculateRent(toInput(p));
      const transport = p.transport.reduce((s, t) => s + t.amount, 0);
      expect(res.totalAmount).toBe(p.subtotal - transport);

      for (const item of res.items) {
        const expected = p.lines.filter((l) => l.item === item.name);
        expect(item.lines.map((l) => [l.date, l.qty, l.days, l.amount]).sort()).toEqual(
          expected.map((l) => [l.date, l.qty, l.days, l.amount]).sort(),
        );
      }
    });
  }

  it("đơn giá trong cấu hình hợp đồng khớp với HSTT", () => {
    for (const it of vietpanelSenci.items) {
      expect(golden.unit_prices[it.name as keyof typeof golden.unit_prices]).toBe(it.unitPrice);
    }
  });

  it("kỳ tính 26 → 25, kỳ đầu cắt theo ngày bắt đầu hợp đồng", () => {
    expect(billingPeriod("2026-08")).toEqual({ from: "2026-07-26", to: "2026-08-25" });
    expect(billingPeriod("2026-01")).toEqual({ from: "2025-12-26", to: "2026-01-25" });
    expect(billingPeriod("2025-12", 26, "2025-12-20")).toEqual({ from: "2025-12-20", to: "2025-12-25" });
    for (const p of golden.periods.slice(1)) {
      const [mm, yyyy] = p.label.split("/");
      expect(billingPeriod(`${yyyy}-${mm}`)).toEqual({ from: p.from, to: p.to });
    }
  });

  it("ngày giao được tính, ngày trả không tính", () => {
    const r = calculateRent({
      period: { from: "2026-07-26", to: "2026-08-25" },
      items: [
        {
          name: "X",
          unit: "Cây",
          unitPrice: 100,
          opening: 10,
          movements: [
            { date: "2026-08-25", qty: 5, ref: "giao ngày cuối" },
            { date: "2026-07-26", qty: -10, ref: "trả ngày đầu" },
          ],
        },
      ],
    });
    const [open, giao, tra] = r.items[0].lines;
    expect(open.amount).toBe(10 * 31 * 100);
    expect(giao.days).toBe(1);
    expect(tra.amount).toBe(-10 * 31 * 100);
    expect(r.totalAmount).toBe(5 * 1 * 100);
  });
});
