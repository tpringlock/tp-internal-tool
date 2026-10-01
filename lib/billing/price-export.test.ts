import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { vietpanelSenci } from "./contracts/vietpanel-senci";
import { HEADER_FILL, buildPriceWorkbook, priceWorkbookBuffer, type PriceExportRow } from "./price-export";
import { readPriceSheet, validatePriceImport, type ExistingPriceContract } from "./price-import";
import { flattenContractConfig } from "./price-lines";
import { GUIDE_SHEET, PRICE_COLUMNS, PRICE_SHEET } from "./price-sheet";
import { PRICE_TEMPLATE_ROWS } from "./price-template";

const TEMPLATE = new URL("../../docs/mau-nhap-don-gia.xlsx", import.meta.url);

/** Every non-empty cell value of a sheet as "A1" -> value ("" and null are the same). */
function cellValues(ws: ExcelJS.Worksheet): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  ws.eachRow((row) =>
    row.eachCell((cell) => {
      if (cell.value !== null && cell.value !== "") out[cell.address] = cell.value;
    }),
  );
  return out;
}

async function loadBook(buf: Buffer | ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  return wb;
}

describe("price import template (docs/mau-nhap-don-gia.xlsx)", () => {
  it("the committed file has the same data and guide as make-price-template.mts produces", async () => {
    const committed = await loadBook(readFileSync(TEMPLATE));
    const generated = await loadBook(await priceWorkbookBuffer(PRICE_TEMPLATE_ROWS, { template: true }));
    expect(committed.worksheets.map((w) => w.name)).toEqual([GUIDE_SHEET, PRICE_SHEET]);
    expect(generated.worksheets.map((w) => w.name)).toEqual([GUIDE_SHEET, PRICE_SHEET]);
    for (const name of [GUIDE_SHEET, PRICE_SHEET]) {
      expect(cellValues(generated.getWorksheet(name)!), name).toEqual(cellValues(committed.getWorksheet(name)!));
    }
  });

  it("keeps the template layout: frozen header, filter, widths, price validation", async () => {
    const wb = await loadBook(await priceWorkbookBuffer(PRICE_TEMPLATE_ROWS, { template: true }));
    const ws = wb.getWorksheet(PRICE_SHEET)!;
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.columns.map((c) => c.width)).toEqual(PRICE_COLUMNS.map((c) => c.width));
    expect(ws.getCell("H2").dataValidation).toMatchObject({ type: "whole", operator: "greaterThanOrEqual" });
    expect(ws.getCell("H4999").dataValidation).toMatchObject({ type: "whole" });
    expect(ws.getCell("H2").numFmt).toBe("#,##0");
    expect(wb.getWorksheet(GUIDE_SHEET)!.getColumn(1).width).toBe(140);
  });

  it("header colours: required dark, Số HĐ / Khách hàng lighter, optional lightest", async () => {
    const ws = (await loadBook(await priceWorkbookBuffer([], { template: true }))).getWorksheet(PRICE_SHEET)!;
    const fill = (addr: string) => (ws.getCell(addr).fill as ExcelJS.FillPattern).fgColor?.argb;
    for (const a of ["A1", "E1", "H1"]) expect(fill(a), a).toBe(HEADER_FILL.required);
    for (const a of ["C1", "D1"]) expect(fill(a), a).toBe(HEADER_FILL["new-warehouse"]);
    for (const a of ["B1", "F1", "G1", "I1", "J1", "K1"]) expect(fill(a), a).toBe(HEADER_FILL.optional);
    expect(HEADER_FILL["new-warehouse"]).not.toBe(HEADER_FILL.required);
  });

  it("an export leaves out the guide line about the sample rows", () => {
    const tpl = buildPriceWorkbook([], { template: true }).getWorksheet(GUIDE_SHEET)!;
    const exp = buildPriceWorkbook([]).getWorksheet(GUIDE_SHEET)!;
    expect(tpl.rowCount - exp.rowCount).toBe(1);
    expect(JSON.stringify(cellValues(exp))).not.toMatch(/có sẵn ví dụ/);
  });
});

describe("export -> import round trip", () => {
  it("re-importing an export changes nothing", async () => {
    const existing: ExistingPriceContract = {
      id: "c1",
      code: vietpanelSenci.id,
      misa_kho: "VIETPANEL-01",
      misa_kho_name: "VIETPANEL HẢI DƯƠNG",
      contract_no: vietpanelSenci.contractNo,
      customer_name: vietpanelSenci.customerName,
      // as written by 0037, then partly edited (MISA names, a note)
      lines: flattenContractConfig(vietpanelSenci).map((l, i) => ({
        ...l,
        ten_vt: i === 0 ? "Giáo ringlock 1.0m Kẽm" : "",
        dvt: i === 0 ? "cây" : "",
        note: i === 1 ? "ghi chú" : "",
      })),
    };
    const rows: PriceExportRow[] = existing.lines.map((l) => ({
      misa_kho: existing.misa_kho,
      misa_kho_name: existing.misa_kho_name,
      contract_no: existing.contract_no,
      customer_name: existing.customer_name,
      ma_vt: l.ma_vt,
      ten_vt: l.ten_vt,
      dvt: l.dvt,
      unit_price: l.unit_price,
      print_name: l.print_name,
      print_dvt: l.print_dvt,
      note: l.note,
    }));
    for (const mode of ["upsert", "replace"] as const) {
      const sheet = await readPriceSheet(await priceWorkbookBuffer(rows));
      const p = validatePriceImport(sheet, { mode, existing: [existing], catalog: null });
      expect(p.errorCount).toBe(0);
      expect(p.counts).toEqual({
        contracts_created: 0,
        contracts_updated: 0,
        lines_inserted: 0,
        lines_updated: 0,
        lines_deleted: 0,
        lines_unchanged: rows.length,
      });
    }
  });
});
