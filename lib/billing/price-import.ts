import ExcelJS from "exceljs";
import { foldSearchText } from "@/lib/search";
import type { MisaCatalog } from "./misa-catalog";
import { groupPriceLines, type PriceGroupConflict, type PriceLineFields } from "./price-lines";
import {
  PRICE_SHEET,
  REQUIRED_COLUMNS,
  columnHeader,
  matchPriceHeader,
  type PriceColumnKey,
} from "./price-sheet";
import { cleanText, normalizeCode, sameText } from "./text";

/**
 * Excel import of the flat price table (feedback items 2, 3).
 *
 *   readPriceSheet(buffer)          xlsx -> rows (exceljs, server side)
 *   validatePriceImport(sheet, ctx) rows + current DB state -> preview: per-row
 *                                   errors (block) / warnings (don't), and the
 *                                   change of every cell (old -> new)
 *   buildImportPayload(preview, …)  preview -> p_import of the
 *                                   billing_import_price_lines RPC (0036)
 *
 * Missing column vs empty cell (only Mã kho, Mã VT, Đơn giá are required):
 *   a column NOT in the file keeps the stored value; a column IN the file with
 *   an empty cell clears it. The diff here follows exactly the RPC's rules, so
 *   the preview counts can be sent as "expected" and the RPC refuses if the
 *   table changed in between.
 */

export type PriceImportMode = "upsert" | "replace";

// ---------------------------------------------------------------------------
// Reading the file
// ---------------------------------------------------------------------------

export interface PriceSheetRow {
  /** Excel row number (header = 1). */
  row: number;
  /** Text of every column present in the file ("" for an empty cell), except unit_price. */
  values: Partial<Record<PriceColumnKey, string>>;
  /** Raw Đơn giá cell (number, string, null…), checked by parseUnitPrice. */
  price: unknown;
}

export interface PriceSheet {
  /** Recognised columns present in the file, in file order. */
  columns: PriceColumnKey[];
  unknownHeaders: string[];
  rows: PriceSheetRow[];
  /** File-level problems (no DON_GIA sheet, duplicate column…). */
  errors: string[];
}

/** Hard cap so a wrong file can't make the preview huge. */
export const MAX_PRICE_ROWS = 20000;

function cellRaw(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return v.result ?? null;
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
    if ("error" in v) return String(v.error);
  }
  return v;
}

function cellString(v: ExcelJS.CellValue): string {
  const r = cellRaw(v);
  if (r === null || r === undefined) return "";
  if (r instanceof Date) return r.toISOString().slice(0, 10);
  return String(r);
}

export async function readPriceSheet(data: ArrayBuffer | Buffer | Uint8Array): Promise<PriceSheet> {
  const out: PriceSheet = { columns: [], unknownHeaders: [], rows: [], errors: [] };
  const wb = new ExcelJS.Workbook();
  try {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    out.errors.push("Không đọc được file. Hãy lưu lại dưới dạng .xlsx (Excel Workbook) rồi thử lại.");
    return out;
  }
  const ws = wb.getWorksheet(PRICE_SHEET);
  if (!ws) {
    out.errors.push(
      `Không tìm thấy sheet "${PRICE_SHEET}". Hãy dùng file mẫu (sheet ${PRICE_SHEET}, dòng 1 là tiêu đề cột).`,
    );
    return out;
  }

  const colOf = new Map<PriceColumnKey, number>();
  const header = ws.getRow(1);
  for (let c = 1; c <= Math.max(ws.columnCount, header.cellCount); c++) {
    const text = cleanText(cellString(header.getCell(c).value));
    if (!text) continue;
    const key = matchPriceHeader(text);
    if (!key) {
      out.unknownHeaders.push(text);
    } else if (colOf.has(key)) {
      out.errors.push(`Cột "${columnHeader(key)}" xuất hiện 2 lần ở dòng tiêu đề.`);
    } else {
      colOf.set(key, c);
    }
  }
  out.columns = [...colOf.keys()].sort((a, b) => colOf.get(a)! - colOf.get(b)!);

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values: PriceSheetRow["values"] = {};
    let price: unknown = null;
    let empty = true;
    for (const [key, c] of colOf) {
      const v = row.getCell(c).value;
      if (key === "unit_price") {
        price = cellRaw(v);
        if (price !== null && price !== undefined && String(price).trim() !== "") empty = false;
      } else {
        values[key] = cellString(v).trim();
        if (values[key]) empty = false;
      }
    }
    if (empty) continue;
    if (out.rows.length >= MAX_PRICE_ROWS) {
      out.errors.push(`File có hơn ${MAX_PRICE_ROWS} dòng. Hãy chia nhỏ file.`);
      break;
    }
    out.rows.push({ row: r, values, price });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/** Largest value of the Postgres integer column. */
const MAX_PRICE = 2_147_483_647;

export type PriceParse = { ok: true; value: number } | { ok: false; error: string };

/** Đơn giá cell -> whole VND >= 0. "1.500" is refused (dot = thousands or decimals?). */
export function parseUnitPrice(raw: unknown): PriceParse {
  let n: number;
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
    return { ok: false, error: "Thiếu đơn giá." };
  }
  if (typeof raw === "number") {
    n = raw;
  } else if (typeof raw === "string") {
    const s = raw.trim();
    if (/^-?\d+$/.test(s)) n = Number(s);
    else if (/^-?[\d.,\s]+$/.test(s)) {
      return { ok: false, error: `Đơn giá "${s}" phải là số nguyên, không gõ dấu chấm/phẩy (ví dụ 1500, không phải 1.500).` };
    } else return { ok: false, error: `Đơn giá "${s}" không phải là số.` };
  } else {
    return { ok: false, error: "Đơn giá không phải là số." };
  }
  if (!Number.isFinite(n)) return { ok: false, error: "Đơn giá không phải là số." };
  if (n < 0) return { ok: false, error: `Đơn giá âm (${n}).` };
  if (!Number.isInteger(n)) return { ok: false, error: `Đơn giá ${n} có phần lẻ; đơn giá phải là số nguyên đồng.` };
  if (n > MAX_PRICE) return { ok: false, error: `Đơn giá ${n} quá lớn.` };
  return { ok: true, value: n };
}

/** "A", "A và B", "A, B và C". */
function joinVi(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} và ${items[items.length - 1]}`;
}

/**
 * Error for a row whose code prints on the same HSTT line as other codes
 * with a different price or unit, telling the user how to fix it, e.g.
 * "VT0053 và VT0067 đang in chung dòng 'Kích U…'. Muốn đổi giá: đổi cả hai
 * mã, hoặc đổi/xóa 'Tên in trên HSTT' của VT0053 để tách thành dòng riêng."
 * `lines` are the warehouse's rows after the import (for the current values).
 */
export function conflictFixMessage(
  c: PriceGroupConflict,
  code: string,
  lines: readonly Pick<PriceLineFields, "ma_vt" | "unit_price" | "print_name" | "print_dvt" | "dvt">[],
): string {
  const what =
    c.prices.length > 1 && c.units.length > 1 ? "giá và ĐVT in" : c.prices.length > 1 ? "giá" : "ĐVT in";
  const all = c.codes.length === 2 ? "cả hai mã" : `cả ${c.codes.length} mã`;
  const row = lines.find((l) => l.ma_vt === code);
  const split = row?.print_name
    ? `đổi/xóa 'Tên in trên HSTT' của ${code}`
    : `đặt 'Tên in trên HSTT' khác cho ${code}`;
  const now = c.codes
    .map((m) => {
      const l = lines.find((x) => x.ma_vt === m);
      if (!l) return m;
      const unit = l.print_dvt || l.dvt;
      return c.prices.length > 1 ? `${m} ${l.unit_price}đ` : `${m} ${unit || "(trống)"}`;
    })
    .join(", ");
  return (
    `${joinVi(c.codes)} đang in chung dòng '${c.name}'. Muốn đổi ${what}: đổi ${all}, hoặc ${split} để tách thành dòng riêng.` +
    ` (Hiện tại: ${now}.)`
  );
}

/** Readable, unique contract code for a new warehouse ("HÀ MINH chothue" -> "ha-minh-chothue"). */
export function contractCodeForKho(kho: string, taken: Set<string>): string {
  const base = foldSearchText(kho).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "kho";
  let code = base;
  for (let i = 2; taken.has(code); i++) code = `${base}-${i}`;
  taken.add(code);
  return code;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface ExistingPriceLine extends PriceLineFields {
  note: string;
}

export interface ExistingPriceContract {
  id: string;
  code: string;
  misa_kho: string;
  misa_kho_name: string;
  contract_no: string;
  customer_name: string;
  lines: ExistingPriceLine[];
}

export interface PriceImportContext {
  mode: PriceImportMode;
  /** Every REAL contract (is_demo = false) with its price rows. */
  existing: readonly ExistingPriceContract[];
  /** Merged catalog of the active month files, or null when there is none. */
  catalog: MisaCatalog | null;
  /** Every contract code in use (real and demo), to keep new codes unique. */
  takenCodes?: readonly string[];
}

export interface PriceImportIssue {
  /** Excel row, or null for the whole file. */
  row: number | null;
  column?: PriceColumnKey;
  level: "error" | "warning";
  message: string;
}

export type FieldValue = string | number | null;

export interface FieldChange {
  field: PriceColumnKey;
  old: FieldValue;
  new: FieldValue;
  /** The file had the column but an empty cell, and a value was stored. */
  cleared: boolean;
}

type LineKey = "ten_vt" | "dvt" | "unit_price" | "print_name" | "print_dvt" | "note";
const LINE_TEXT_KEYS = ["ten_vt", "dvt", "note"] as const;
const LINE_PRINT_KEYS = ["print_name", "print_dvt"] as const;
const LINE_KEYS: readonly LineKey[] = ["ten_vt", "dvt", "unit_price", "print_name", "print_dvt", "note"];
const HEADER_KEYS = ["contract_no", "customer_name", "misa_kho_name"] as const;
type HeaderKey = (typeof HEADER_KEYS)[number];

export type LineValues = Pick<ExistingPriceLine, LineKey>;

export interface LineDiff {
  /** Excel row (null for a row deleted in replace mode). */
  row: number | null;
  maVt: string;
  op: "insert" | "update" | "delete" | "unchanged";
  changes: FieldChange[];
  /** Values after the import (before them, for a delete). */
  values: LineValues;
}

export interface ContractDiff {
  misaKho: string;
  /** Existing contract code, or the code a new warehouse will get. */
  code: string;
  isNew: boolean;
  headerChanges: FieldChange[];
  header: Record<HeaderKey, string>;
  lines: LineDiff[];
}

export interface PriceImportCounts {
  contracts_created: number;
  contracts_updated: number;
  lines_inserted: number;
  lines_updated: number;
  lines_deleted: number;
  lines_unchanged: number;
}

/** One warehouse of the RPC payload: optional keys only for columns in the file. */
export interface PriceImportPayloadContract {
  misa_kho: string;
  code: string;
  misa_kho_name?: string;
  contract_no?: string;
  customer_name?: string;
  lines: ({ ma_vt: string; unit_price: number; sort_order: number } & Partial<
    Record<"ten_vt" | "dvt" | "print_name" | "print_dvt" | "note", string>
  >)[];
}

export interface PriceImportPreview {
  mode: PriceImportMode;
  columns: PriceColumnKey[];
  rowCount: number;
  issues: PriceImportIssue[];
  errorCount: number;
  warningCount: number;
  contracts: ContractDiff[];
  counts: PriceImportCounts;
  /** No errors and at least one row. */
  canImport: boolean;
  payloadContracts: PriceImportPayloadContract[];
}

const ZERO_COUNTS: PriceImportCounts = {
  contracts_created: 0,
  contracts_updated: 0,
  lines_inserted: 0,
  lines_updated: 0,
  lines_deleted: 0,
  lines_unchanged: 0,
};

interface ParsedRow {
  row: number;
  kho: string;
  maVt: string;
  price: number | null;
  values: PriceSheetRow["values"];
  valid: boolean;
}

export function validatePriceImport(sheet: PriceSheet, ctx: PriceImportContext): PriceImportPreview {
  const issues: PriceImportIssue[] = [];
  const err = (row: number | null, message: string, column?: PriceColumnKey) =>
    issues.push({ row, column, level: "error", message });
  const warn = (row: number | null, message: string, column?: PriceColumnKey) =>
    issues.push({ row, column, level: "warning", message });
  const has = (k: PriceColumnKey) => sheet.columns.includes(k);

  const finish = (contracts: ContractDiff[], counts: PriceImportCounts, payload: PriceImportPayloadContract[]) => {
    issues.sort((a, b) => (a.row ?? 0) - (b.row ?? 0) || (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
    const errorCount = issues.filter((i) => i.level === "error").length;
    return {
      mode: ctx.mode,
      columns: sheet.columns,
      rowCount: sheet.rows.length,
      issues,
      errorCount,
      warningCount: issues.length - errorCount,
      contracts,
      counts,
      canImport: errorCount === 0 && sheet.rows.length > 0,
      payloadContracts: payload,
    };
  };

  // --- file level ----------------------------------------------------------
  for (const e of sheet.errors) err(null, e);
  const missing = REQUIRED_COLUMNS.filter((k) => !has(k));
  if (sheet.errors.length === 0 && missing.length > 0) {
    err(null, `Thiếu cột bắt buộc: ${missing.map(columnHeader).join(", ")}.`);
  }
  if (sheet.unknownHeaders.length > 0) {
    warn(null, `Bỏ qua các cột không có trong mẫu: ${sheet.unknownHeaders.join(", ")}.`);
  }
  if (sheet.errors.length > 0 || missing.length > 0) return finish([], { ...ZERO_COUNTS }, []);
  if (sheet.rows.length === 0) {
    err(null, `Sheet ${PRICE_SHEET} không có dòng dữ liệu nào.`);
    return finish([], { ...ZERO_COUNTS }, []);
  }
  if (!ctx.catalog) {
    warn(null, "Chưa có file nguồn MISA theo tháng nào: chưa đối chiếu được mã kho, mã VT, tên và ĐVT với MISA.");
  }

  // --- rows ----------------------------------------------------------------
  const rows: ParsedRow[] = sheet.rows.map((r) => {
    const kho = normalizeCode(r.values.misa_kho ?? "");
    const maVt = normalizeCode(r.values.ma_vt ?? "");
    let valid = true;
    if (!kho) {
      err(r.row, "Thiếu Mã kho.", "misa_kho");
      valid = false;
    }
    if (!maVt) {
      err(r.row, "Thiếu Mã VT.", "ma_vt");
      valid = false;
    }
    const p = parseUnitPrice(r.price);
    if (!p.ok) {
      err(r.row, p.error, "unit_price");
      valid = false;
    }
    return { row: r.row, kho, maVt, price: p.ok ? p.value : null, values: r.values, valid };
  });

  // Duplicate (kho, mã) after normalising spaces.
  const seen = new Map<string, ParsedRow[]>();
  for (const r of rows) {
    if (!r.kho || !r.maVt) continue;
    const k = `${r.kho}\u0000${r.maVt}`;
    seen.set(k, [...(seen.get(k) ?? []), r]);
  }
  for (const dup of seen.values()) {
    if (dup.length < 2) continue;
    for (const r of dup) {
      const others = dup.filter((o) => o !== r).map((o) => o.row).join(", ");
      err(r.row, `Trùng Mã kho "${r.kho}" + Mã VT "${r.maVt}" với dòng ${others}.`, "ma_vt");
      r.valid = false;
    }
  }

  // --- warehouses ------------------------------------------------------------
  const byKho = new Map<string, ParsedRow[]>();
  for (const r of rows) if (r.kho) byKho.set(r.kho, [...(byKho.get(r.kho) ?? []), r]);

  const existingByKho = new Map<string, ExistingPriceContract[]>();
  for (const c of ctx.existing) {
    const k = normalizeCode(c.misa_kho);
    existingByKho.set(k, [...(existingByKho.get(k) ?? []), c]);
  }
  const taken = new Set(ctx.takenCodes ?? ctx.existing.map((c) => c.code));

  const contracts: ContractDiff[] = [];
  const payload: PriceImportPayloadContract[] = [];
  const counts: PriceImportCounts = { ...ZERO_COUNTS };

  for (const [kho, khoRows] of byKho) {
    const first = khoRows[0].row;
    const matches = existingByKho.get(kho) ?? [];
    if (matches.length > 1) {
      for (const r of khoRows) err(r.row, `Có ${matches.length} hợp đồng cùng mã kho "${kho}". Hãy gộp lại trước khi nhập.`, "misa_kho");
      continue;
    }
    const existing = matches[0];

    // Header values: one value per warehouse. Compared ignoring case and
    // extra spaces; only a real difference blocks (Số HĐ, Khách hàng) or
    // warns (Tên kho). The value stored is the first row's.
    const header = {} as Record<HeaderKey, string>;
    for (const key of HEADER_KEYS) {
      const old = existing?.[key] ?? "";
      if (!has(key)) {
        header[key] = old;
        continue;
      }
      const filled = khoRows
        .map((r) => ({ v: cleanText(r.values[key]), row: r.row }))
        .filter((x) => x.v);
      const distinct = filled.filter((x, i) => filled.findIndex((y) => sameText(y.v, x.v)) === i);
      if (distinct.length > 1 && key !== "misa_kho_name") {
        const list = distinct.map((d) => `"${d.v}" (dòng ${d.row})`).join(", ");
        for (const r of khoRows) {
          err(r.row, `Kho "${kho}" có nhiều ${columnHeader(key)} khác nhau: ${list}. Một kho chỉ thuộc 1 hợp đồng.`, key);
        }
      } else if (distinct.length > 1) {
        warn(first, `Kho "${kho}" có nhiều Tên kho khác nhau; dùng "${distinct[0].v}" (dòng ${distinct[0].row}).`, key);
      } else {
        const spellings = filled.filter((x, i) => filled.findIndex((y) => y.v === x.v) === i);
        if (spellings.length > 1) {
          const list = spellings.map((s) => `"${s.v}" (dòng ${s.row})`).join(", ");
          warn(
            spellings[1].row,
            `Kho "${kho}": ${columnHeader(key)} ghi khác nhau về chữ hoa/thường hoặc khoảng trắng: ${list}. Lưu theo dòng ${spellings[0].row}.`,
            key,
          );
        }
      }
      header[key] = filled[0]?.v ?? "";
    }

    if (!existing) {
      const need = (["contract_no", "customer_name"] as const).filter((k) => !header[k]);
      if (need.length > 0) {
        for (const r of khoRows) {
          err(r.row, `Kho mới "${kho}" (chưa có trên hệ thống) cần ${need.map(columnHeader).join(" và ")}.`, need[0]);
        }
      }
    }

    // MISA cross-check (warnings only).
    if (ctx.catalog) {
      const misaKhoName = ctx.catalog.warehouses[kho];
      if (misaKhoName === undefined) {
        warn(first, `Mã kho "${kho}" không có trong các file MISA tháng đã tải.`, "misa_kho");
      } else if (has("misa_kho_name") && header.misa_kho_name && !sameText(header.misa_kho_name, misaKhoName)) {
        warn(first, `Tên kho "${header.misa_kho_name}" khác MISA: "${misaKhoName}".`, "misa_kho_name");
      }
      for (const r of khoRows) {
        if (!r.maVt) continue;
        const item = ctx.catalog.items[r.maVt];
        if (!item) {
          warn(r.row, `Mã VT "${r.maVt}" không có trong danh mục MISA (các file tháng đã tải).`, "ma_vt");
          continue;
        }
        const ten = cleanText(r.values.ten_vt);
        if (has("ten_vt") && ten && item.name && !sameText(ten, item.name)) {
          warn(r.row, `Tên VT "${ten}" khác MISA: "${item.name}".`, "ten_vt");
        }
        const dvt = cleanText(r.values.dvt);
        if (has("dvt") && dvt && item.dvt && !sameText(dvt, item.dvt)) {
          warn(r.row, `ĐVT "${dvt}" khác MISA: "${item.dvt}".`, "dvt");
        }
      }
    }

    // --- diff ----------------------------------------------------------------
    const code = existing?.code ?? contractCodeForKho(kho, taken);
    const headerChanges: FieldChange[] = [];
    if (existing) {
      for (const key of HEADER_KEYS) {
        if (has(key) && header[key] !== existing[key]) {
          headerChanges.push({ field: key, old: existing[key], new: header[key], cleared: !header[key] && !!existing[key] });
        }
      }
    }

    const oldLines = new Map((existing?.lines ?? []).map((l) => [normalizeCode(l.ma_vt), l]));
    const validRows = khoRows.filter((r) => r.valid);
    let nextSort = Math.max(0, ...(existing?.lines ?? []).map((l) => l.sort_order));
    const lineDiffs: LineDiff[] = [];
    const payloadLines: PriceImportPayloadContract["lines"] = [];

    validRows.forEach((r, i) => {
      const old = oldLines.get(r.maVt);
      const values: LineValues = {
        ten_vt: has("ten_vt") ? cleanText(r.values.ten_vt) : (old?.ten_vt ?? ""),
        dvt: has("dvt") ? cleanText(r.values.dvt) : (old?.dvt ?? ""),
        unit_price: r.price!,
        print_name: has("print_name") ? cleanText(r.values.print_name) || null : (old?.print_name ?? null),
        print_dvt: has("print_dvt") ? cleanText(r.values.print_dvt) || null : (old?.print_dvt ?? null),
        note: has("note") ? cleanText(r.values.note) : (old?.note ?? ""),
      };
      const sortOrder = ctx.mode === "replace" ? i + 1 : (old?.sort_order ?? ++nextSort);
      const changes: FieldChange[] = old
        ? LINE_KEYS.filter((k) => values[k] !== old[k]).map((k) => ({
            field: k,
            old: old[k],
            new: values[k],
            cleared: (values[k] === "" || values[k] === null) && old[k] !== "" && old[k] !== null,
          }))
        : [];
      const op = !old ? "insert" : changes.length > 0 ? "update" : "unchanged";
      lineDiffs.push({ row: r.row, maVt: r.maVt, op, changes, values });

      const line: PriceImportPayloadContract["lines"][number] = {
        ma_vt: r.maVt,
        unit_price: r.price!,
        sort_order: sortOrder,
      };
      for (const k of [...LINE_TEXT_KEYS, ...LINE_PRINT_KEYS]) {
        if (has(k)) line[k] = cleanText(r.values[k]);
      }
      payloadLines.push(line);
    });

    if (ctx.mode === "replace" && existing) {
      const inFile = new Set(khoRows.map((r) => r.maVt));
      for (const l of existing.lines) {
        if (inFile.has(normalizeCode(l.ma_vt))) continue;
        const { ten_vt, dvt, unit_price, print_name, print_dvt, note } = l;
        lineDiffs.push({
          row: null,
          maVt: l.ma_vt,
          op: "delete",
          changes: [],
          values: { ten_vt, dvt, unit_price, print_name, print_dvt, note },
        });
      }
    }

    // Rows that will print as one HSTT line must agree on price and unit.
    const finalLines: PriceLineFields[] = [
      ...(ctx.mode === "replace"
        ? []
        : (existing?.lines ?? []).filter((l) => !validRows.some((r) => r.maVt === normalizeCode(l.ma_vt)))),
      ...lineDiffs
        .filter((d) => d.op !== "delete")
        .map((d, i) => ({ ma_vt: d.maVt, ...d.values, sort_order: payloadLines[i]?.sort_order ?? 0 })),
    ];
    for (const c of groupPriceLines(finalLines).conflicts) {
      const inFile = khoRows.filter((r) => c.codes.includes(r.maVt));
      if (inFile.length === 0) {
        err(khoRows[0].row, conflictFixMessage(c, c.codes[0], finalLines), "print_name");
      }
      const column = c.prices.length > 1 ? "unit_price" : "print_dvt";
      for (const r of inFile) err(r.row, conflictFixMessage(c, r.maVt, finalLines), column);
    }

    contracts.push({ misaKho: kho, code, isNew: !existing, headerChanges, header, lines: lineDiffs });
    const pc: PriceImportPayloadContract = { misa_kho: kho, code, lines: payloadLines };
    for (const key of HEADER_KEYS) if (has(key)) pc[key] = header[key];
    payload.push(pc);

    if (!existing) counts.contracts_created++;
    else if (headerChanges.length > 0) counts.contracts_updated++;
    for (const d of lineDiffs) {
      if (d.op === "insert") counts.lines_inserted++;
      else if (d.op === "update") counts.lines_updated++;
      else if (d.op === "delete") counts.lines_deleted++;
      else counts.lines_unchanged++;
    }
  }

  return finish(contracts, counts, payload);
}

// ---------------------------------------------------------------------------
// RPC payload
// ---------------------------------------------------------------------------

/** Row of billing_save_price_lines (manual editor, always every field). */
export interface PriceLinePayload {
  ma_vt: string;
  ten_vt: string;
  dvt: string;
  unit_price: number;
  print_name: string | null;
  print_dvt: string | null;
  note: string;
}

export interface PriceImportPayload {
  mode: PriceImportMode;
  file: { file_name: string; size_bytes: number; sha256: string; storage_path: string; row_count: number };
  columns: PriceColumnKey[];
  warnings: string[];
  expected: PriceImportCounts;
  contracts: PriceImportPayloadContract[];
}

/** One entry of billing_price_imports.changes (written by the RPC). */
export interface PriceImportChange {
  op: "contract_created" | "contract_updated" | "line_inserted" | "line_updated" | "line_deleted";
  misa_kho: string;
  ma_vt?: string;
  before?: Record<string, FieldValue>;
  after?: Record<string, FieldValue>;
}

export function issueText(i: PriceImportIssue): string {
  return i.row === null ? i.message : `Dòng ${i.row}: ${i.message}`;
}

export function buildImportPayload(
  preview: PriceImportPreview,
  file: Omit<PriceImportPayload["file"], "row_count">,
): PriceImportPayload {
  if (!preview.canImport) throw new Error("File còn lỗi, không thể nhập.");
  return {
    mode: preview.mode,
    file: { ...file, row_count: preview.rowCount },
    columns: preview.columns,
    warnings: preview.issues.filter((i) => i.level === "warning").map(issueText),
    expected: preview.counts,
    contracts: preview.payloadContracts,
  };
}

