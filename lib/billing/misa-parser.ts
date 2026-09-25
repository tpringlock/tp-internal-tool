import ExcelJS from "exceljs";
import { isoFromParts, toIsoDate } from "./dates";
import type { IsoDate, Ledger, LedgerMovement, LedgerOpening } from "./types";

/**
 * Đọc file "Sổ chi tiết vật tư hàng hóa" tải từ MISA (Kho: <<Tất cả>>).
 *
 * Cấu trúc file:
 *   Dòng 1–3 tiêu đề (dòng 2: "Kho: <<Tất cả>>, Tháng 9 năm 2026" hoặc "Từ ngày … đến ngày …")
 *   Header 2 tầng: "Tên kho | Tên hàng | Ngày hạch toán | … | Nhập | Xuất | Tồn | TK Kho | TK đối ứng"
 *   Dữ liệu: "Mã kho: X" → "Mã hàng: Y" → dòng "Số dư đầu kỳ" → các dòng phát sinh → … → "Tổng cộng"
 *
 * Hỗ trợ cả bản 13 cột (chỉ Số lượng) và 16 cột (Số lượng + Giá trị): cột được tìm theo tên header,
 * không cố định vị trí.
 */
export async function parseMisaLedger(
  data: ArrayBuffer | Buffer | Uint8Array,
  opts: { from?: IsoDate; to?: IsoDate } = {},
): Promise<Ledger> {
  const wb = new ExcelJS.Workbook();
  // exceljs nhận Buffer; Uint8Array/ArrayBuffer được bọc lại cho an toàn ở cả Node và Edge.
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets.find((s) => s.state === "visible") ?? wb.worksheets[0];
  if (!ws) throw new MisaParseError("File không có sheet nào.");

  const text = (r: number, c: number) => cellText(ws.getRow(r).getCell(c).value);
  const raw = (r: number, c: number) => cellRaw(ws.getRow(r).getCell(c).value);

  // 1) Tìm dòng header
  let headerRow = 0;
  for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
    if (text(r, 1) === "Tên kho") {
      headerRow = r;
      break;
    }
  }
  if (!headerRow) {
    throw new MisaParseError('Không tìm thấy dòng tiêu đề "Tên kho". Đây có phải file Sổ chi tiết vật tư hàng hóa của MISA?');
  }
  const header: string[] = [];
  const sub: string[] = [];
  const colCount = Math.max(ws.columnCount, 16);
  for (let c = 1; c <= colCount; c++) {
    header[c] = text(headerRow, c);
    sub[c] = text(headerRow + 1, c);
  }
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 1) throw new MisaParseError(`Thiếu cột "${name}" trong file MISA.`);
    return i;
  };
  const qtyCol = (name: string) => {
    const start = col(name);
    for (let c = start; c <= colCount && (c === start || header[c] === name); c++) {
      if (sub[c] === "Số lượng") return c;
    }
    return start;
  };
  const C = {
    tenKho: 1,
    tenHang: col("Tên hàng"),
    ngayHt: col("Ngày hạch toán"),
    soCt: col("Số chứng từ"),
    dienGiai: col("Diễn giải"),
    dvt: col("ĐVT"),
    nhap: qtyCol("Nhập"),
    xuat: qtyCol("Xuất"),
    ton: qtyCol("Tồn"),
  };
  const valueCols = header.filter((h, i) => i > 0 && (h === "Nhập" || h === "Xuất" || h === "Tồn")).length;
  const layout: Ledger["layout"] = valueCols === 3 ? "13-cot" : valueCols === 6 ? "16-cot" : "khac";

  // 2) Khoảng ngày của file
  const range = parsePeriodText(text(2, 1));
  const from = opts.from ?? range?.from;
  const to = opts.to ?? range?.to;
  if (!from || !to) {
    throw new MisaParseError(`Không đọc được kỳ của file từ dòng 2 ("${text(2, 1)}"). Hãy nhập Từ ngày / Đến ngày.`);
  }

  // 3) Duyệt dữ liệu
  const openings: LedgerOpening[] = [];
  const movements: LedgerMovement[] = [];
  const warehouses: Record<string, string> = {};
  const warnings: string[] = [];
  let kho = "";
  let maHang = "";
  let running = 0;
  let runningMismatch = 0;
  const dataStart = sub.includes("Số lượng") ? headerRow + 2 : headerRow + 1;

  for (let r = dataStart; r <= ws.rowCount; r++) {
    const a = text(r, 1);
    if (!a) continue;
    if (a.startsWith("Mã kho:")) {
      kho = a.slice(7).trim();
      maHang = "";
      continue;
    }
    if (a.startsWith("Mã hàng:")) {
      maHang = a.slice(8).trim();
      running = 0;
      continue;
    }
    if (a === "Tổng cộng") break;
    if (!kho || !maHang) {
      warnings.push(`Dòng ${r}: dữ liệu nằm ngoài nhóm Mã kho/Mã hàng, đã bỏ qua.`);
      continue;
    }
    warehouses[kho] ??= a;
    const tenHang = text(r, C.tenHang);
    const dvt = text(r, C.dvt);

    if (text(r, C.dienGiai) === "Số dư đầu kỳ") {
      const qty = num(raw(r, C.ton));
      openings.push({ kho, khoName: a, maHang, tenHang, dvt, qty });
      running = qty;
      continue;
    }
    const date = toIsoDate(raw(r, C.ngayHt));
    if (!date) {
      warnings.push(`Dòng ${r}: không đọc được Ngày hạch toán, đã bỏ qua.`);
      continue;
    }
    const nhap = num(raw(r, C.nhap));
    const xuat = num(raw(r, C.xuat));
    movements.push({
      kho,
      maHang,
      tenHang,
      date,
      soCt: text(r, C.soCt),
      dienGiai: text(r, C.dienGiai),
      nhap,
      xuat,
      sourceRow: r,
    });
    running += nhap - xuat;
    const tonFile = raw(r, C.ton);
    if (typeof tonFile === "number" && Math.abs(tonFile - running) > 1e-6 && runningMismatch++ < 20) {
      warnings.push(`Dòng ${r} (${kho}/${maHang}): tồn trong file ${tonFile} ≠ tồn cộng dồn ${running}.`);
    }
    if (date < from || date > to) {
      warnings.push(`Dòng ${r}: ngày ${date} nằm ngoài kỳ của file (${from} → ${to}).`);
    }
  }

  if (layout === "khac") warnings.push("Cấu trúc cột lạ (không phải bản 13 hoặc 16 cột), hãy kiểm tra lại kết quả.");
  return { from, to, layout, openings, movements, warehouses, warnings };
}

export class MisaParseError extends Error {}

/** "Kho: <<Tất cả>>, Tháng 9 năm 2026" | "…, Quý 3 năm 2026" | "…, Năm 2026" | "…Từ ngày 26/08/2026 đến ngày 25/09/2026" */
export function parsePeriodText(s: string): { from: IsoDate; to: IsoDate } | null {
  const range = /(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (range) {
    const [, d1, m1, y1, d2, m2, y2] = range.map(Number);
    return { from: isoFromParts(y1, m1, d1), to: isoFromParts(y2, m2, d2) };
  }
  const month = /Tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i.exec(s);
  if (month) {
    const m = Number(month[1]);
    const y = Number(month[2]);
    return { from: isoFromParts(y, m, 1), to: isoFromParts(y, m, lastDay(y, m)) };
  }
  const quarter = /Quý\s+(\d)\s+năm\s+(\d{4})/i.exec(s);
  if (quarter) {
    const q = Number(quarter[1]);
    const y = Number(quarter[2]);
    return { from: isoFromParts(y, q * 3 - 2, 1), to: isoFromParts(y, q * 3, lastDay(y, q * 3)) };
  }
  const year = /Năm\s+(\d{4})/i.exec(s);
  if (year) {
    const y = Number(year[1]);
    return { from: isoFromParts(y, 1, 1), to: isoFromParts(y, 12, 31) };
  }
  return null;
}

function lastDay(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function cellRaw(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return (v as ExcelJS.CellFormulaValue).result;
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in v) return (v as ExcelJS.CellHyperlinkValue).text;
  }
  return v;
}

function cellText(v: ExcelJS.CellValue): string {
  const r = cellRaw(v);
  if (r === null || r === undefined) return "";
  if (r instanceof Date) return r.toISOString().slice(0, 10);
  return String(r).trim();
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
