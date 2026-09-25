import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import golden from "./__fixtures__/vietpanel-senci-golden.json";
import { parseMisaLedger, parsePeriodText } from "./misa-parser";
import { buildRentInput, calculateRent, computeRentFromLedger, BillingError } from "./engine";
import { vietpanelSenci } from "./contracts/vietpanel-senci";

const load = (f: string) => parseMisaLedger(readFileSync(new URL(`./__fixtures__/${f}`, import.meta.url)));

describe("Đọc file MISA", () => {
  it("bản 13 cột (tải tháng 9/2026)", async () => {
    const l = await load("misa-2026-09-13cot.xlsx");
    expect(l.layout).toBe("13-cot");
    expect(l.from).toBe("2026-09-01");
    expect(l.to).toBe("2026-09-30");
    expect(Object.keys(l.warehouses).length).toBe(216);
    expect(l.movements.length).toBe(419);
    expect(l.warnings.filter((w) => w.includes("tồn cộng dồn"))).toEqual([]);
    const vp = l.openings.filter((o) => o.kho === "VIETPANEL-01");
    expect(vp.find((o) => o.maHang === "VT0008")?.qty).toBe(25210);
    // "xuất hàng APTV …" là NHẬP vào kho công trình APTV
    const aptv = l.movements.find((m) => m.soCt === "APTV-BN-G07" && m.maHang === "VT0008");
    expect(aptv).toMatchObject({ nhap: 1500, xuat: 0, date: "2026-09-12" });
  });

  it("bản 16 cột (có cột Giá trị) cho cùng kiểu dữ liệu", async () => {
    const l = await load("misa-2026-06-16cot.xlsx");
    expect(l.layout).toBe("16-cot");
    expect(l.from).toBe("2026-06-01");
    const vp = l.movements.filter((m) => m.kho === "VIETPANEL-01");
    expect(vp.length).toBe(39);
    expect(vp[0]).toMatchObject({ maHang: "VT0008", date: "2026-06-01", soCt: "VIETPANEL-HD-N14", nhap: 0, xuat: 1260 });
  });

  it("đọc được các kiểu dòng kỳ", () => {
    expect(parsePeriodText("Kho: <<Tất cả>>, Tháng 2 năm 2028")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(parsePeriodText("Kho: <<Tất cả>>, Từ ngày 26/08/2026 đến ngày 25/09/2026")).toEqual({
      from: "2026-08-26",
      to: "2026-09-25",
    });
    expect(parsePeriodText("Kho: <<Tất cả>>, Quý 3 năm 2026")).toEqual({ from: "2026-07-01", to: "2026-09-30" });
  });
});

describe("Từ file MISA ra tiền thuê", () => {
  it("dựng lại HSTT kỳ 06/2026 từ dữ liệu MISA tháng 6 – khớp từng đồng", async () => {
    const ledger = await load("misa-2026-06-16cot.xlsx");
    const jun = golden.periods.find((p) => p.label === "06/2026")!;

    // File tháng 6 bắt đầu từ 01/06: phần 26/05–31/05 lấy từ HSTT, phần 01/06–25/06 lấy từ MISA.
    const fromMisa = buildRentInput(ledger, vietpanelSenci, { from: "2026-06-01", to: jun.to });
    const before = jun.lines.filter((l) => l.is_opening || l.date < "2026-06-01");

    // Kiểm tra chéo: tồn MISA 01/06 = tồn HSTT 26/05 + phát sinh trước 01/06
    for (const it of fromMisa.items) {
      const hstt = before.filter((l) => l.item === it.name).reduce((s, l) => s + l.qty, 0);
      expect(it.opening, it.name).toBe(hstt);
    }

    const res = calculateRent({
      period: { from: jun.from, to: jun.to },
      items: vietpanelSenci.items.map((ci) => ({
        name: ci.name,
        unit: ci.unit,
        unitPrice: ci.unitPrice,
        opening: before.filter((l) => l.item === ci.name && l.is_opening).reduce((s, l) => s + l.qty, 0),
        movements: [
          ...before.filter((l) => l.item === ci.name && !l.is_opening).map((l) => ({ date: l.date, qty: l.qty, ref: "HSTT" })),
          ...(fromMisa.items.find((i) => i.name === ci.name)?.movements ?? []),
        ],
      })),
    });
    expect(res.totalAmount).toBe(1_045_798_558);
    expect(res.totalAmount + 75_000_000).toBe(jun.subtotal); // + vận chuyển 15 chuyến
  });

  it("tồn đầu tháng 9 của MISA khớp tồn cuối HSTT 08/2026 (trừ 1 chuyến trả hàng 26–31/08 cần xác nhận)", async () => {
    const ledger = await load("misa-2026-09-13cot.xlsx");
    const input = buildRentInput(ledger, vietpanelSenci, { from: "2026-09-01", to: "2026-09-25" });
    const aug = golden.periods.find((p) => p.label === "08/2026")!;
    const diff: Record<string, number> = {};
    for (const it of input.items) {
      const hstt = aug.lines.filter((l) => l.item === it.name).reduce((s, l) => s + l.qty, 0);
      if (hstt !== it.opening) diff[it.name] = it.opening - hstt;
    }
    expect(diff).toEqual({
      "Giáo ringlock 1.5m Kẽm": -600,
      "Giáo ringlock 2.0m Kẽm": -500,
      "Giáo ringlock 2.5m Kẽm": -700,
      "Giằng ngang ringlock 1.2m": -2772,
    });
  });

  it("chặn khi file không bao phủ đầu kỳ (tải theo tháng dương lịch)", async () => {
    const ledger = await load("misa-2026-09-13cot.xlsx");
    expect(() => computeRentFromLedger(ledger, vietpanelSenci, { from: "2026-08-26", to: "2026-09-25" })).toThrow(
      BillingError,
    );
  });

  it("chặn khi kho có mã hàng chưa có đơn giá", async () => {
    const ledger = await load("misa-2026-09-13cot.xlsx");
    const thieu = { ...vietpanelSenci, items: vietpanelSenci.items.filter((i) => !i.maHang.includes("VT0008")) };
    expect(() => buildRentInput(ledger, thieu, { from: "2026-09-01", to: "2026-09-25" })).toThrow(/VT0008/);
  });

  it("gộp mã, bỏ pallet và cộng các phiếu", async () => {
    const ledger = await load("misa-2026-09-13cot.xlsx");
    const res = computeRentFromLedger(ledger, vietpanelSenci, { from: "2026-09-01", to: "2026-09-25" });
    const g25 = res.items.find((i) => i.name === "Giáo ringlock 2.5m Kẽm")!;
    expect(g25.lines[0]).toMatchObject({ kind: "ton-dau-ky", qty: 18483 + 5171, days: 25 }); // VT0022 + VT0090
    expect(g25.closingQty).toBe(9183 + 5171);
    expect(res.items.some((i) => /pallet/i.test(i.name))).toBe(false);
    expect(res.totalAmount).toBe(res.items.reduce((s, i) => s + i.lines.reduce((a, l) => a + l.amount, 0), 0));
  });
});
