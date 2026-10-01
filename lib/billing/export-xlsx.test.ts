import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { exportRentXlsx } from "./export-xlsx";
import { calculateRent } from "./engine";
import { vietpanelSenci } from "./contracts/vietpanel-senci";

describe("exportRentXlsx number formats", () => {
  it("keeps whole numbers plain and shows decimals only when fractional", async () => {
    const result = calculateRent({
      period: { from: "2026-06-01", to: "2026-06-30" },
      items: [
        { name: "Nguyên", unit: "Cây", unitPrice: 85, opening: 100, movements: [] },
        {
          name: "Lẻ",
          unit: "Kg",
          unitPrice: 10,
          opening: 0,
          movements: [{ date: "2026-06-30", qty: -0.2, ref: "PX1" }],
        },
      ],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await exportRentXlsx(result, vietpanelSenci)) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];

    const rowOf = (name: string) => {
      for (let r = 1; r <= ws.rowCount; r++) {
        if (ws.getRow(r).getCell(2).value === name) return ws.getRow(r);
      }
      throw new Error(name);
    };
    const whole = rowOf("Nguyên");
    expect(whole.getCell(10).value).toBe(255_000);
    expect(whole.getCell(10).numFmt).toBe("#,##0;[Red]-#,##0");

    const frac = rowOf("Lẻ");
    expect(frac.getCell(7).value).toBe(-0.2);
    expect(frac.getCell(10).value).toBe(-2);
    expect(frac.getCell(7).numFmt).toBe("#,##0.0###;[Red]-#,##0.0###");
    expect(frac.getCell(10).numFmt).toBe("#,##0;[Red]-#,##0");
  });
});
