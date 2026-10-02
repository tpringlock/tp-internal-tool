import ExcelJS from "exceljs";
import { formatVnDate } from "./dates";
import type { RentReport } from "./rent-report";
import type { Period, RentResult } from "./types";

// Excel of the rent report (plan section 4, feedback item 9): "Tổng hợp"
// (per MISA code), "Danh sách dự án" (projects by amount, failures last) and
// one detail sheet per project. Numbers are formulas WITH their computed
// results (+ fullCalcOnLoad), like the HSTT export, so the file shows the
// amounts at once and the accountant can check every one:
//   H (days)   = E − D + 1 (− non-billable days)
//   J (amount) = I × H × G
//   "Cộng"     = SUBTOTAL(109, …) per line, the sheet total = SUBTOTAL(9, …)
// The project list links each amount to its detail sheet's total.

export interface ReportExportInput {
  report: RentReport;
  /** Engine result of every project that calculated, by contract id. */
  results: Map<string, RentResult>;
  /** The report period (union of the projects' periods). */
  period: Period;
  /** "Tháng 08/2026 · v4" style labels of the MISA files used. */
  files: string[];
  /** Header line, e.g. the preset and month. */
  title: string;
}

const NUM_INT = "#,##0;[Red]-#,##0";
const NUM_DEC = "#,##0.0###;[Red]-#,##0.0###";
const DATE = "dd/mm/yyyy";

type Cell = ExcelJS.CellValue;

function excelDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Round away float noise (4 decimals, like the stored totals). */
function num(v: number): number {
  return Number(v.toFixed(4));
}

function f(formula: string, result: number): Cell {
  return { formula, result: num(result) };
}

/** Sheet name rules: at most 31 characters, none of []:*?/\, unique (case-insensitive). */
export function sheetNameFor(base: string, taken: Set<string>): string {
  const clean = base.replace(/[[\]:*?/\\]/g, "-").replace(/^'+|'+$/g, "").trim() || "Du an";
  let name = clean.slice(0, 31);
  for (let i = 2; taken.has(name.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    name = clean.slice(0, 31 - suffix.length) + suffix;
  }
  taken.add(name.toLowerCase());
  return name;
}

/** Quote a sheet name for a formula reference. */
function ref(sheet: string, cell: string): string {
  return `'${sheet.replace(/'/g, "''")}'!${cell}`;
}

function formatNumbers(row: ExcelJS.Row, cols: number[]) {
  for (const c of cols) {
    const cell = row.getCell(c);
    const v = cell.value;
    const n = typeof v === "number" ? v : v && typeof v === "object" && "result" in v ? Number(v.result) : null;
    if (n === null || Number.isNaN(n)) continue;
    cell.numFmt = Number.isInteger(num(n)) ? NUM_INT : NUM_DEC;
  }
}

function header(ws: ExcelJS.Worksheet, labels: string[]) {
  const row = ws.addRow(labels);
  row.font = { bold: true };
  row.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  row.height = 36;
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F1F8" } };
    c.border = { bottom: { style: "thin" } };
  });
  return row;
}

/**
 * One project's detail, in the BB đối chiếu column layout (A–K). Returns the
 * address of the total cell.
 */
export function writeDetailSheet(ws: ExcelJS.Worksheet, label: string, result: RentResult): string {
  ws.columns = [6, 38, 8, 13, 13, 12, 14, 9, 11, 16, 40].map((width) => ({ width }));
  ws.addRow([label]).font = { bold: true, size: 13 };
  ws.addRow([`Giá trị thuê thiết bị từ ngày ${formatVnDate(result.period.from)} đến ngày ${formatVnDate(result.period.to)}`]).font = {
    italic: true,
  };
  ws.addRow([]);
  header(ws, [
    "STT",
    "Tên thiết bị",
    "Đơn vị tính",
    "Ngày nhận/trả trên phiếu",
    "Ngày tính thời gian",
    "Số lượng tồn đầu kỳ",
    "Số lượng phát sinh trong kỳ nhận (+) trả (-)",
    "Thời gian thuê",
    "Đơn giá thuê (vnđ/ngày)",
    "Thành tiền thuê",
    "Ghi chú",
  ]);
  ws.views = [{ state: "frozen", ySplit: 4 }];
  const sectionRow = ws.addRow(["I", "Thiết bị vật tư"]);
  sectionRow.font = { bold: true };
  const firstData = sectionRow.number + 1;

  result.items.forEach((item, idx) => {
    const first = ws.rowCount + 1;
    item.lines.forEach((l, n) => {
      const r = ws.rowCount + 1;
      const opening = l.kind === "ton-dau-ky";
      const row = ws.addRow([
        n === 0 ? idx + 1 : null,
        item.name,
        item.unit,
        excelDate(l.date),
        excelDate(l.endDate),
        opening ? num(l.openingQty ?? l.qty) : null,
        opening ? f(`F${r}`, l.qty) : num(l.qty),
        f(`E${r}-D${r}+1${l.excludedDays ? `-${l.excludedDays}` : ""}`, l.days),
        l.unitPrice,
        f(`I${r}*H${r}*G${r}`, l.amount),
        opening ? null : l.ref + (l.excludedDays ? ` · trừ ${l.excludedDays} ngày miễn tính` : ""),
      ]);
      row.getCell(4).numFmt = row.getCell(5).numFmt = DATE;
      formatNumbers(row, [6, 7, 8, 9, 10]);
    });
    const last = ws.rowCount;
    const cong = ws.addRow([
      null,
      "Cộng",
      null,
      null,
      null,
      null,
      f(`SUM(G${first}:G${last})`, item.closingQty),
      null,
      null,
      f(`SUBTOTAL(109,J${first}:J${last})`, item.amount),
    ]);
    cong.font = { bold: true };
    formatNumbers(cong, [7, 10]);
  });

  const lastData = ws.rowCount;
  const total = ws.addRow([
    null,
    "Tổng tiền thuê thiết bị",
    ...Array(7).fill(null),
    lastData >= firstData ? f(`SUBTOTAL(9,J${firstData}:J${lastData})`, result.totalAmount) : 0,
  ]);
  total.font = { bold: true };
  formatNumbers(total, [10]);
  sectionRow.getCell(10).value = f(`J${total.number}`, result.totalAmount);
  sectionRow.getCell(10).numFmt = Number.isInteger(num(result.totalAmount)) ? NUM_INT : NUM_DEC;

  if (result.warnings.length > 0) {
    ws.addRow([]);
    ws.addRow([null, "Cảnh báo"]).font = { bold: true, color: { argb: "FFC00000" } };
    for (const w of result.warnings) ws.addRow([null, w]);
  }
  return `J${total.number}`;
}

/** The whole report as an .xlsx buffer. */
export async function exportRentReportXlsx(input: ReportExportInput): Promise<Buffer> {
  const { report, results, period } = input;
  const wb = new ExcelJS.Workbook();
  const taken = new Set<string>();
  const summary = wb.addWorksheet(sheetNameFor("Tổng hợp", taken));
  const list = wb.addWorksheet(sheetNameFor("Danh sách dự án", taken));

  // Detail sheets first, so the list can point at their totals.
  const totalRef = new Map<string, string>();
  for (const p of report.projects) {
    const res = results.get(p.contractId);
    if (p.total === null || !res) continue;
    const name = sheetNameFor(p.misaKho, taken);
    const cell = writeDetailSheet(wb.addWorksheet(name), p.label, res);
    totalRef.set(p.contractId, ref(name, cell));
  }

  const intro = (ws: ExcelJS.Worksheet, title: string) => {
    ws.addRow([title]).font = { bold: true, size: 13 };
    ws.addRow([`${input.title} · từ ngày ${formatVnDate(period.from)} đến ngày ${formatVnDate(period.to)}`]).font = { italic: true };
    ws.addRow([`File MISA: ${input.files.join(", ")}`]);
    if (report.demoCount > 0) {
      ws.addRow([`CÓ ${report.demoCount} HỢP ĐỒNG GIẢ ĐỊNH (đơn giá giả định, chỉ để đối chiếu)`]).font = {
        bold: true,
        color: { argb: "FFC00000" },
      };
    }
    ws.addRow([]);
  };

  // --- Tổng hợp theo mã VT ---------------------------------------------------
  intro(summary, "TỔNG HỢP TIỀN THUÊ THEO MÃ VẬT TƯ");
  summary.columns = [6, 14, 36, 8, 12, 12, 12, 12, 12, 14, 18, 9].map((width) => ({ width }));
  const sh = header(summary, [
    "STT",
    "Mã VT",
    "Tên VT",
    "ĐVT",
    "Đơn giá (vnđ/ngày)",
    "Tồn đầu kỳ",
    "Nhập trong kỳ",
    "Trả trong kỳ",
    "Tồn cuối kỳ",
    "SL × ngày",
    "Tiền thuê",
    "Số dự án",
  ]);
  summary.views = [{ state: "frozen", ySplit: sh.number }];
  const sFirst = summary.rowCount + 1;
  report.codes.forEach((c, i) => {
    const r = summary.rowCount + 1;
    const row = summary.addRow([
      i + 1,
      c.maVt,
      c.name,
      c.unit,
      c.unitPrice ?? "Theo dự án",
      num(c.opening),
      num(c.delivered),
      num(c.returned),
      f(`F${r}+G${r}-H${r}`, c.closing),
      num(c.qtyDays),
      num(c.amount),
      c.projectCount,
    ]);
    formatNumbers(row, [5, 6, 7, 8, 9, 10, 11]);
  });
  const sLast = summary.rowCount;
  const sTotal = summary.addRow([
    null,
    "Tổng cộng",
    ...Array(8).fill(null),
    sLast >= sFirst ? f(`SUBTOTAL(9,K${sFirst}:K${sLast})`, report.codes.reduce((s, c) => s + c.amount, 0)) : 0,
  ]);
  sTotal.font = { bold: true };
  formatNumbers(sTotal, [11]);

  // --- Danh sách dự án ---------------------------------------------------------
  intro(list, "DANH SÁCH TIỀN THUÊ THEO DỰ ÁN");
  list.columns = [6, 16, 48, 12, 12, 18, 60].map((width) => ({ width }));
  const lh = header(list, ["STT", "Mã kho", "Dự án", "Từ ngày", "Đến ngày", "Tiền thuê", "Ghi chú"]);
  list.views = [{ state: "frozen", ySplit: lh.number }];
  const lFirst = list.rowCount + 1;
  report.projects.forEach((p, i) => {
    const link = totalRef.get(p.contractId);
    const row = list.addRow([
      i + 1,
      p.misaKho,
      p.label,
      excelDate(p.period.from),
      excelDate(p.period.to),
      p.total === null ? null : link ? f(link, p.total) : num(p.total),
      p.error ?? (p.warnings.length > 0 ? `${p.warnings.length} cảnh báo (xem sheet chi tiết)` : null),
    ]);
    row.getCell(4).numFmt = row.getCell(5).numFmt = DATE;
    formatNumbers(row, [6]);
    if (p.error) row.getCell(7).font = { color: { argb: "FFC00000" } };
  });
  const lLast = list.rowCount;
  const lTotal = list.addRow([
    null,
    null,
    `Tổng ${report.okCount} dự án tính được${report.errorCount ? ` (${report.errorCount} dự án lỗi không cộng)` : ""}`,
    null,
    null,
    lLast >= lFirst ? f(`SUBTOTAL(9,F${lFirst}:F${lLast})`, report.total) : 0,
  ]);
  lTotal.font = { bold: true };
  formatNumbers(lTotal, [6]);

  wb.calcProperties = { ...wb.calcProperties, fullCalcOnLoad: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
