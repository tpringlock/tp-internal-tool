import ExcelJS from "exceljs";
import {
  GUIDE_LINES,
  GUIDE_SAMPLE_LINE,
  GUIDE_SHEET,
  GUIDE_TITLE,
  PRICE_COLUMNS,
  PRICE_SHEET,
  type PriceColumn,
} from "./price-sheet";

/**
 * Excel export of the flat price table, in exactly the import layout
 * (docs/mau-nhap-don-gia.xlsx): export, edit, import again. Also builds the
 * template itself (scripts/make-price-template.mts). Server side (exceljs).
 */

export interface PriceExportRow {
  misa_kho: string;
  misa_kho_name: string;
  contract_no: string;
  customer_name: string;
  ma_vt: string;
  ten_vt: string;
  dvt: string;
  unit_price: number;
  print_name: string | null;
  print_dvt: string | null;
  note: string;
}

/** Header colours: required (dark), required for a new warehouse (medium), optional (light). */
export const HEADER_FILL: Record<PriceColumn["need"], string> = {
  required: "FF1F4E79",
  "new-warehouse": "FF2E75B6",
  optional: "FF5B7FA6",
};

const BORDER_COLOR = { argb: "FF999999" };
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: BORDER_COLOR },
  left: { style: "thin", color: BORDER_COLOR },
  bottom: { style: "thin", color: BORDER_COLOR },
  right: { style: "thin", color: BORDER_COLOR },
};
/** Data validation on Đơn giá reaches at least this row, so new rows typed in Excel are checked too. */
const VALIDATION_ROWS = 5000;

export interface PriceWorkbookOptions {
  /** The downloadable template: keeps the guide line that describes its sample rows. */
  template?: boolean;
}

export function buildPriceWorkbook(rows: readonly PriceExportRow[], opts: PriceWorkbookOptions = {}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();

  // --- HUONG_DAN ---------------------------------------------------------------
  const guide = wb.addWorksheet(GUIDE_SHEET);
  guide.columns = [{ width: 140 }];
  guide.getCell("A1").value = GUIDE_TITLE;
  guide.getCell("A1").font = { bold: true, size: 13 };
  const lines = GUIDE_LINES.filter((_, i) => opts.template || i !== GUIDE_SAMPLE_LINE);
  lines.forEach((text, i) => {
    const cell = guide.getCell(i + 3, 1);
    cell.value = text;
    cell.font = { size: 11 };
  });

  // --- DON_GIA -------------------------------------------------------------------
  const ws = wb.addWorksheet(PRICE_SHEET, { views: [{ state: "frozen", ySplit: 1, topLeftCell: "A2", activeCell: "A1" }] });
  ws.columns = PRICE_COLUMNS.map((c) => ({ width: c.width }));

  const header = ws.getRow(1);
  header.height = 32;
  PRICE_COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL[c.need] } };
    cell.border = THIN;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  rows.forEach((r, i) => {
    const row = ws.getRow(i + 2);
    PRICE_COLUMNS.forEach((c, j) => {
      const cell = row.getCell(j + 1);
      const v = r[c.key];
      cell.value = v === "" || v === null ? null : v;
      cell.border = THIN;
      if (c.key === "unit_price") cell.numFmt = "#,##0";
    });
  });

  const last = rows.length + 1;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: PRICE_COLUMNS.length } };
  const priceCol = String.fromCharCode(65 + PRICE_COLUMNS.findIndex((c) => c.key === "unit_price"));
  // Range validation (one rule for H2:H5000, like the template). exceljs
  // supports it at runtime but its type definitions don't declare it.
  const validations = (ws as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } })
    .dataValidations;
  validations.add(`${priceCol}2:${priceCol}${Math.max(VALIDATION_ROWS, last)}`, {
    type: "whole",
    operator: "greaterThanOrEqual",
    formulae: [0],
    allowBlank: false,
    showErrorMessage: true,
    error: "Đơn giá phải là số nguyên ≥ 0",
  });

  return wb;
}

export async function priceWorkbookBuffer(rows: readonly PriceExportRow[], opts?: PriceWorkbookOptions): Promise<Buffer> {
  return Buffer.from(await buildPriceWorkbook(rows, opts).xlsx.writeBuffer());
}

/** Rows sorted for export: by warehouse, then the table's own order. */
export function sortExportRows<T extends PriceExportRow & { sort_order: number }>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      a.misa_kho.localeCompare(b.misa_kho, "vi") ||
      a.sort_order - b.sort_order ||
      a.ma_vt.localeCompare(b.ma_vt, "vi"),
  );
}
