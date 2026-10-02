/**
 * HSTT export: fill docs/hstt/hstt-template.xlsx (4 sheets: ĐNTT, ĐCCN,
 * Giá trị, Khối lượng) with one period of one contract.
 * Plan: docs/hstt/hstt-export-plan.md, sections 3–4.
 *
 * The template keeps every font, border, merge, width and print setting of
 * the hand-made file. Text cells carry {{placeholders}}; the hidden column Z
 * marks the template rows of the equipment / transport tables, which are
 * cloned per data row (style + height), with the merges rebuilt and the rows
 * below shifted down. Numbers are written as formulas WITH their computed
 * results (and fullCalcOnLoad), so the file shows the amounts at once and the
 * accountant can still edit it like the old Excel file.
 */
import ExcelJS from "exceljs";
import type { BillingCustomer, CompanyProfile } from "@/lib/db/types";
import {
  closingDebt,
  computeHsttTotals,
  transportAmount,
  type HsttDeduction,
  type HsttTotals,
  type HsttTransport,
} from "./hstt-totals";
import { amountInWords } from "./number-to-words";
import { canCuText, dmy, hsttFileName, monthLabel } from "./hstt-text";
import type { IsoDate, RentItemResult, RentLine } from "./types";

export { canCuText, hsttFileName } from "./hstt-text";

export type HsttCompany = Pick<
  CompanyProfile,
  | "ten_in_hoa"
  | "ten_2_dong"
  | "ten_thuong"
  | "ten_thu_huong"
  | "dia_chi"
  | "dia_chi_ngan"
  | "dien_thoai"
  | "so_tk"
  | "ngan_hang"
  | "mst"
  | "dai_dien"
  | "chuc_vu"
  | "noi_lap"
>;

export type HsttCustomer = Pick<
  BillingCustomer,
  | "ten_in_hoa"
  | "ten_thuong"
  | "ten_rut_gon"
  | "dia_chi"
  | "dien_thoai"
  | "so_tk"
  | "ngan_hang"
  | "mst"
  | "dai_dien"
  | "chuc_vu"
>;

export interface HsttInput {
  /** "YYYY-MM". */
  month: string;
  period: { from: IsoDate; to: IsoDate };
  company: HsttCompany;
  customer: HsttCustomer;
  contract: {
    type: string;
    no: string;
    date: IsoDate | null;
    duAnTen: string;
    duAnDiaChi: string;
    canCuOverride: string | null;
    vatPercent: number;
  };
  /** Equipment lines as computed by the engine. */
  items: RentItemResult[];
  /** Reason of the exempt days, for the K note ("lễ tết nguyên đán 2026"). */
  excludedReason: string;
  transport: HsttTransport[];
  deductions: HsttDeduction[];
  debt: {
    /** Advances (ĐCCN line 1), written as =a+b+... */
    advances: number[];
    advancesNote: string;
    /** ĐCCN line 2. */
    opening: number;
    /** ĐCCN line 4. */
    paid: number;
  };
}

export interface HsttResult {
  buffer: Buffer;
  totals: HsttTotals;
  closingDebt: number;
  fileName: string;
}

// ───────────── Text helpers ─────────────

const excelDate = (iso: IsoDate) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));

function exemptNote(days: number, reason: string): string {
  return `Đã giảm ${days} ngày nghỉ${reason.trim() ? ` ${reason.trim()}` : ""}`;
}

// ───────────── Row rebuilding ─────────────

type Values = Partial<Record<string, ExcelJS.CellValue>>;
/** One generated row: the template row it copies (style, height, text) and the values to write. */
interface OutRow {
  tpl: number;
  values?: Values;
  /** Extra merges on this row, as column ranges ("A:I"). */
  merges?: string[];
}

const LAST_COL = 26; // Z (markers)

interface CellSnap {
  value: ExcelJS.CellValue;
  style: Partial<ExcelJS.Style>;
}
interface RowSnap {
  height: number | undefined;
  cells: CellSnap[];
}

function snapshotRow(ws: ExcelJS.Worksheet, r: number): RowSnap {
  const row = ws.getRow(r);
  const cells: CellSnap[] = [];
  for (let c = 1; c <= LAST_COL; c++) {
    const cell = row.getCell(c);
    const slave = cell.isMerged && cell.master.address !== cell.address;
    cells.push({ value: slave ? null : cell.value, style: structuredClone(cell.style ?? {}) });
  }
  return { height: row.height, cells };
}

function writeRow(ws: ExcelJS.Worksheet, r: number, snap: RowSnap | null, values: Values = {}) {
  const row = ws.getRow(r);
  row.height = snap?.height as number;
  for (let c = 1; c <= LAST_COL; c++) {
    const cell = row.getCell(c);
    const s = snap?.cells[c - 1];
    cell.value = null;
    cell.style = structuredClone(s?.style ?? {});
    const col = cell.address.replace(/\d+/g, "");
    const v = col in values ? values[col] : (s?.value ?? null);
    cell.value = v ?? null;
  }
}

function rowsOf(range: string): [number, number] {
  const [a, b] = range.match(/\d+/g)!.map(Number);
  return [a, b ?? a];
}

/**
 * Replace template rows [start, end] by `plan`, shifting everything below.
 * Single-row merges of a template row are repeated on every row cloned from
 * it; merges below the region move with it. Returns the row shift.
 */
function rebuildRegion(ws: ExcelJS.Worksheet, start: number, end: number, plan: OutRow[]): number {
  const printArea = ws.pageSetup.printArea ?? "";
  const printEnd = Number(/(\d+)$/.exec(printArea)?.[1] ?? 0);
  const maxRow = Math.max(ws.rowCount, printEnd);
  const snaps = new Map<number, RowSnap>();
  for (let r = start; r <= maxRow; r++) snaps.set(r, snapshotRow(ws, r));

  const merges = [...ws.model.merges];
  for (const m of merges) ws.unMergeCells(m);

  const delta = plan.length - (end - start + 1);
  plan.forEach((p, i) => writeRow(ws, start + i, snaps.get(p.tpl)!, p.values));
  for (let r = end + 1; r <= maxRow; r++) writeRow(ws, r + delta, snaps.get(r)!);
  for (let r = maxRow + delta + 1; r <= maxRow; r++) writeRow(ws, r, null);

  const rowMerges = new Map<number, string[]>(); // template row -> column ranges
  for (const m of merges) {
    const [top, bottom] = rowsOf(m);
    if (bottom < start) ws.mergeCellsWithoutStyle(m);
    else if (top > end) ws.mergeCellsWithoutStyle(m.replace(/\d+/g, (n) => String(Number(n) + delta)));
    else if (top === bottom) {
      const cols = m.replace(/\d+/g, "");
      rowMerges.set(top, [...(rowMerges.get(top) ?? []), cols]);
    }
  }
  plan.forEach((p, i) => {
    const r = start + i;
    for (const cols of [...(rowMerges.get(p.tpl) ?? []), ...(p.merges ?? [])]) {
      const [a, b] = cols.split(":");
      ws.mergeCellsWithoutStyle(`${a}${r}:${b}${r}`);
    }
  });

  if (printEnd) ws.pageSetup.printArea = printArea.replace(/\d+$/, String(printEnd + delta));
  return delta;
}

function markers(ws: ExcelJS.Worksheet): Map<string, number> {
  const out = new Map<string, number>();
  ws.getColumn(LAST_COL).eachCell((cell, r) => {
    if (typeof cell.value === "string") out.set(cell.value.trim(), r);
  });
  return out;
}

function marker(m: Map<string, number>, key: string, sheet: string): number {
  const r = m.get(key);
  if (!r) throw new Error(`File mẫu HSTT thiếu dòng "${key}" ở sheet ${sheet}.`);
  return r;
}

// ───────────── Equipment table (Giá trị / Khối lượng) ─────────────

interface TableRows {
  /** First row of each item ... its "Cộng" row. */
  items: { first: number; cong: number }[];
  transport: number[];
  /** Last row before the totals (end of the SUBTOTAL ranges). */
  last: number;
}

function lineValues(l: RentLine, r: number, reason: string, withMoney: boolean): Values {
  const opening = l.kind === "ton-dau-ky";
  const h = `E${r}-D${r}+1${l.excludedDays ? `-${l.excludedDays}` : ""}`;
  const note = l.excludedDays ? exemptNote(l.excludedDays, reason) : null;
  const v: Values = {
    D: excelDate(l.date),
    E: excelDate(l.endDate),
    F: opening ? (l.openingQty ?? l.qty) : null,
    G: opening ? { formula: `F${r}`, result: l.qty } : l.qty,
    H: { formula: h, result: l.days },
  };
  if (withMoney) {
    v.I = l.unitPrice;
    v.J = { formula: `I${r}*H${r}*G${r}`, result: l.amount };
    v.K = note;
  } else {
    v.I = note;
  }
  return v;
}

/** Plan of the equipment + transport rows, from the section-I row on. */
function tablePlan(
  ws: ExcelJS.Worksheet,
  input: HsttInput,
  withMoney: boolean,
): { plan: OutRow[]; rows: TableRows; m: Map<string, number> } {
  const m = markers(ws);
  const secI = marker(m, "section:thiet-bi", ws.name);
  const tplFirst = marker(m, "row:dong-dau", ws.name);
  const tplNext = marker(m, "row:dong-tiep", ws.name);
  const tplCong = marker(m, "row:cong", ws.name);
  const secII = marker(m, "section:van-chuyen", ws.name);
  const tplTransport = marker(m, "row:van-chuyen", ws.name);

  const plan: OutRow[] = [{ tpl: secI }];
  let r = secI + 1;
  const rows: TableRows = { items: [], transport: [], last: 0 };

  input.items.forEach((item, idx) => {
    const first = r;
    item.lines.forEach((l, n) => {
      plan.push({
        tpl: n === 0 ? tplFirst : tplNext,
        values: { A: n === 0 ? idx + 1 : null, B: item.name, C: item.unit, ...lineValues(l, r, input.excludedReason, withMoney) },
      });
      r++;
    });
    const last = r - 1;
    const cong: Values = {
      B: "Cộng",
      G: { formula: `SUM(G${first}:G${last})`, result: item.closingQty },
    };
    if (withMoney) cong.J = { formula: `SUBTOTAL(109,J${first}:J${last})`, result: item.amount };
    plan.push({ tpl: tplCong, values: cong });
    rows.items.push({ first, cong: r });
    r++;
  });

  plan.push({ tpl: secII });
  r++;
  input.transport.forEach((t, idx) => {
    const amount = transportAmount(t);
    const note = t.note.trim() || (t.chargeMode === "end_of_term" ? "Tính cuối kỳ" : null);
    const v: Values = { A: idx + 1, B: t.name, C: t.unit, F: t.cumulativeTrips, G: t.trips };
    if (withMoney) {
      v.I = t.unitPrice;
      v.J = amount === null ? null : { formula: `G${r}*I${r}`, result: amount };
      v.K = note;
    } else {
      v.I = note;
    }
    plan.push({ tpl: tplTransport, values: v });
    rows.transport.push(r);
    r++;
  });
  rows.last = r - 1;
  return { plan, rows, m };
}

function itemMerges(ws: ExcelJS.Worksheet, rows: TableRows) {
  for (const { first, cong } of rows.items) {
    ws.mergeCellsWithoutStyle(`A${first}:A${cong}`);
  }
}

/** Giá trị: table + totals. Returns the row of the after-tax total. */
function fillGiaTri(ws: ExcelJS.Worksheet, input: HsttInput, totals: HsttTotals): number {
  const { plan, rows, m } = tablePlan(ws, input, true);
  const secI = marker(m, "section:thiet-bi", ws.name);
  const tplBefore = marker(m, "total:truoc-thue", ws.name);
  const tplVat = marker(m, "total:vat", ws.name);
  const tplAfter = marker(m, "total:sau-thue", ws.name);

  const firstData = secI + 1;
  const range = `J${firstData}:J${rows.last}`;
  plan[0].values = { J: { formula: `SUBTOTAL(9,${range})`, result: totals.beforeTax } };

  let r = secI + plan.length;
  const before = r++;
  plan.push({ tpl: tplBefore, values: { J: { formula: `SUBTOTAL(9,${range})`, result: totals.beforeTax } } });
  const vat = r++;
  plan.push({
    tpl: tplVat,
    values: { J: { formula: `ROUND(J${before}*${String(input.contract.vatPercent)}%,0)`, result: totals.vat } },
  });
  const deductionRows: number[] = [];
  for (const d of input.deductions) {
    deductionRows.push(r++);
    plan.push({ tpl: tplVat, values: { A: d.label, J: d.amount } });
  }
  const after = r++;
  plan.push({
    tpl: tplAfter,
    values: {
      J: {
        formula: `J${before}+J${vat}${deductionRows.map((x) => `-J${x}`).join("")}`,
        result: totals.afterTax,
      },
    },
  });

  rebuildRegion(ws, secI, tplAfter, plan);
  itemMerges(ws, rows);
  return after;
}

function fillKhoiLuong(ws: ExcelJS.Worksheet, input: HsttInput) {
  const { plan, rows, m } = tablePlan(ws, input, false);
  rebuildRegion(ws, marker(m, "section:thiet-bi", ws.name), marker(m, "row:van-chuyen", ws.name), plan);
  itemMerges(ws, rows);
}

// ───────────── Placeholders ─────────────

const PLACEHOLDER = /\{\{([^}]+)\}\}/g;

function eachMaster(ws: ExcelJS.Worksheet, fn: (cell: ExcelJS.Cell) => void) {
  ws.eachRow({ includeEmpty: false }, (row) =>
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      fn(cell);
    }),
  );
}

/** Address of the first cell holding exactly {{key}}. */
function placeholderCell(ws: ExcelJS.Worksheet, key: string): string {
  let found = "";
  eachMaster(ws, (cell) => {
    if (!found && cell.value === `{{${key}}}`) found = cell.address;
  });
  if (!found) throw new Error(`File mẫu HSTT thiếu ô {{${key}}} ở sheet ${ws.name}.`);
  return found;
}

/**
 * Replace the placeholders of a sheet. Returns the wrapped text cells whose
 * content came from the data (their row height must follow the text).
 */
function fillPlaceholders(
  ws: ExcelJS.Worksheet,
  text: Record<string, string>,
  cells: Record<string, ExcelJS.CellValue>,
): WrappedCell[] {
  const wrapped: WrappedCell[] = [];
  eachMaster(ws, (cell) => {
    if (typeof cell.value !== "string" || !cell.value.includes("{{")) return;
    if (cell.alignment?.wrapText) wrapped.push({ cell, minLines: cell.value.includes("{{can_cu_hd}}") ? 2 : 1 });
    const whole = /^\{\{([^}]+)\}\}$/.exec(cell.value);
    if (whole && whole[1] in cells) {
      cell.value = cells[whole[1]];
      return;
    }
    cell.value = cell.value.replace(PLACEHOLDER, (_, key: string) => {
      if (!(key in text)) throw new Error(`Placeholder không có dữ liệu: {{${key}}} (${ws.name}!${cell.address}).`);
      return text[key];
    });
  });
  return wrapped;
}

// ───────────── Row heights of wrapped text ─────────────

interface WrappedCell {
  cell: ExcelJS.Cell;
  /** The "Căn cứ" sentence always gets at least 2 lines, like the hand-made files. */
  minLines: number;
}

/** Excel's row height (points) of one line of Times New Roman at a font size. */
const LINE_HEIGHT: Record<number, number> = { 10: 12.75, 11: 15, 12: 15.75, 13: 16.5, 14: 18.75, 16: 20.25 };
const lineHeight = (size: number) => LINE_HEIGHT[size] ?? Math.ceil(size * 1.3 * 4) / 4;

/** Pixel width of a column as Excel draws it (7px per unit of the default font + 5px padding). */
const columnPx = (width: number) => Math.trunc(width * 7 + 5);

/**
 * Approximate advance of Times New Roman, in em: capitals are wide, spaces
 * narrow, everything else (lower case, digits, punctuation) average. Errs on
 * the wide side so a line never overflows: cut text is worse than spare space.
 */
function textEm(text: string): number {
  let em = 0;
  for (const ch of text) em += ch === " " ? 0.25 : ch !== ch.toLowerCase() ? 0.7 : 0.45;
  return em;
}

/**
 * Estimated number of lines of `text` (wrapped, explicit line breaks kept) in
 * a cell or merge made of columns of the given widths, at a font size in pt.
 */
export function estimateLines(text: string, columnWidths: readonly number[], fontSize: number): number {
  const boxPx = columnWidths.reduce((s, w) => s + columnPx(w), 0) - 6; // cell margins
  const emPx = (fontSize * 96) / 72;
  return text
    .split("\n")
    .reduce((n, part) => n + Math.max(1, Math.ceil((textEm(part.trimEnd()) * emPx) / boxPx)), 0);
}

/**
 * Give each row holding data-driven wrapped text the height of its estimated
 * line count (never lower than the template's). Merges spanning several rows
 * already have room for their lines and are left alone.
 */
function fitWrappedRows(ws: ExcelJS.Worksheet, wrapped: WrappedCell[]) {
  const merges = ws.model.merges.map((m) => m.split(":").map((a) => ws.getCell(a)));
  const need = new Map<number, number>();
  for (const { cell, minLines } of wrapped) {
    if (typeof cell.value !== "string") continue;
    const m = merges.find(([tl]) => tl.address === cell.address);
    if (m && Number(m[1].row) !== Number(m[0].row)) continue;
    const widths: number[] = [];
    const lastCol = Number(m ? m[1].col : cell.col);
    for (let c = Number(cell.col); c <= lastCol; c++) widths.push(ws.getColumn(c).width ?? 8.43);
    const size = cell.font?.size ?? 11;
    const lines = Math.max(minLines, estimateLines(cell.value, widths, size));
    const row = Number(cell.row);
    need.set(row, Math.max(need.get(row) ?? 0, lines * lineHeight(size)));
  }
  for (const [r, h] of need) {
    const row = ws.getRow(r);
    if (h > (row.height ?? 0)) row.height = h;
  }
}

/** Start the print area at the first row whose column A is `text`. */
function printFromRow(ws: ExcelJS.Worksheet, text: string) {
  let start = 0;
  ws.eachRow((row, r) => {
    if (!start && String(row.getCell(1).value ?? "").trim() === text) start = r;
  });
  const area = ws.pageSetup.printArea;
  if (start && area) ws.pageSetup.printArea = area.replace(/^([A-Z]+)\d+:/, `$1${start}:`);
}

function sumFormula(values: number[]): ExcelJS.CellValue {
  const total = values.reduce((s, v) => s + v, 0);
  if (values.length <= 1) return total;
  const formula = values.map((v, i) => (i === 0 ? String(v) : v < 0 ? `-${-v}` : `+${v}`)).join("");
  return { formula, result: total };
}

// ───────────── Entry point ─────────────

export async function buildHstt(input: HsttInput, template: Buffer | ArrayBuffer | Uint8Array): Promise<HsttResult> {
  const equipment = input.items.reduce((s, i) => s + i.amount, 0);
  const totals = computeHsttTotals({
    equipment,
    transport: input.transport,
    vatPercent: input.contract.vatPercent,
    deductions: input.deductions,
  });
  const closing = closingDebt({ opening: input.debt.opening, incurred: totals.afterTax, paid: input.debt.paid });

  const wb = new ExcelJS.Workbook();
  const buf = Buffer.isBuffer(template) ? template : Buffer.from(template as ArrayBuffer);
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const sheet = (name: string) => {
    const ws = wb.getWorksheet(name);
    if (!ws) throw new Error(`File mẫu HSTT thiếu sheet "${name}".`);
    return ws;
  };
  const dntt = sheet("ĐNTT");
  const dccn = sheet("ĐCCN");
  const giaTri = sheet("Giá trị");
  const khoiLuong = sheet("Khối lượng");

  const afterRow = fillGiaTri(giaTri, input, totals);
  fillKhoiLuong(khoiLuong, input);

  const { company: b, customer: a } = input;
  const text: Record<string, string> = {
    thang: monthLabel(input.month),
    nam: input.month.slice(0, 4),
    "ky.tu": dmy(input.period.from),
    "ky.den": dmy(input.period.to),
    can_cu_hd: canCuText(input),
    "du_an.ten": input.contract.duAnTen,
    "du_an.dia_chi": input.contract.duAnDiaChi,
    vat_phan_tram: String(input.contract.vatPercent).replace(".", ","),
    bang_chu: amountInWords(totals.afterTax),
    "a.ten_in_hoa": a.ten_in_hoa,
    "a.dia_chi": a.dia_chi,
    "a.dien_thoai": a.dien_thoai,
    "a.so_tk": a.so_tk,
    "a.ngan_hang": a.ngan_hang,
    "a.mst": a.mst,
    "a.dai_dien": a.dai_dien,
    "a.chuc_vu": a.chuc_vu,
    "b.ten_in_hoa": b.ten_in_hoa,
    "b.ten_2_dong": b.ten_2_dong,
    "b.ten_thuong": b.ten_thuong,
    "b.ten_thu_huong": b.ten_thu_huong,
    "b.dia_chi": b.dia_chi,
    "b.dia_chi_ngan": b.dia_chi_ngan,
    "b.dien_thoai": b.dien_thoai,
    "b.so_tk": b.so_tk,
    "b.ngan_hang": b.ngan_hang,
    "b.mst": b.mst,
    "b.dai_dien": b.dai_dien,
    "b.chuc_vu": b.chuc_vu,
    "b.noi_lap": b.noi_lap,
    "cn.bang_chu": amountInWords(closing),
    "dntt.bang_chu": amountInWords(totals.afterTax),
  };
  const afterRef = { formula: `'Giá trị'!J${afterRow}`, result: totals.afterTax };

  // ĐCCN: line 5 = line 2 + line 3 - line 4, by cell reference.
  const noDau = placeholderCell(dccn, "cn.no_dau_ky");
  const phatSinh = placeholderCell(dccn, "cn.phat_sinh");
  const thanhToan = placeholderCell(dccn, "cn.thanh_toan");
  const tamUng = placeholderCell(dccn, "cn.tam_ung");
  const cells: Record<string, ExcelJS.CellValue> = {
    "cn.tam_ung": sumFormula(input.debt.advances),
    "cn.no_dau_ky": input.debt.opening,
    "cn.phat_sinh": afterRef,
    "cn.thanh_toan": input.debt.paid,
    "cn.no_cuoi_ky": { formula: `${noDau}+${phatSinh}-${thanhToan}`, result: closing },
    "dntt.so_tien": afterRef,
  };
  for (const ws of [dntt, dccn, giaTri, khoiLuong]) fitWrappedRows(ws, fillPlaceholders(ws, text, cells));
  // The hand-made Khối lượng prints from its "CỘNG HÒA…" line (no blank rows on top).
  printFromRow(khoiLuong, "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM");
  if (input.debt.advancesNote.trim()) {
    dccn.getCell(`I${rowsOf(tamUng)[0]}`).value = input.debt.advancesNote.trim();
  }

  for (const ws of [dntt, dccn, giaTri, khoiLuong]) {
    ws.getColumn(LAST_COL).eachCell({ includeEmpty: false }, (cell) => {
      cell.value = null;
    });
  }
  wb.calcProperties = { ...wb.calcProperties, fullCalcOnLoad: true };

  const out = await wb.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(out as ArrayBuffer),
    totals,
    closingDebt: closing,
    fileName: hsttFileName(input.month, input.customer.ten_rut_gon || input.customer.ten_in_hoa),
  };
}
