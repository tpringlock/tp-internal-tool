/**
 * HSTT template check: does an uploaded .xlsx follow the template convention
 * (hstt-placeholders.ts) well enough for buildHstt? Errors block saving the
 * template; warnings are shown and the template can still be saved.
 * Also builds the "editable standard template" (markers visible + a guide
 * sheet listing the placeholders) offered for download.
 */
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  GUIDE_ROLE,
  MARKERS,
  MARKER_COLUMN,
  NUMBER_PLACEHOLDERS,
  PLACEHOLDERS,
  PLACEHOLDER_KEYS,
  PLACEHOLDER_RE,
  ROLE_EXPECTED_PLACEHOLDERS,
  ROLE_LABELS,
  ROLE_MARKERS,
  ROLE_OPTIONAL_MARKERS,
  ROLE_PREFIX,
  SHEET_ROLES,
  parseRole,
  placeholderKeys,
  type MarkerKey,
  type SheetRole,
} from "./hstt-placeholders";

export const MAX_TEMPLATE_BYTES = 2 * 1024 * 1024;

/** Every issue code; messages: HsttTemplates.issue.<code>. */
export const TEMPLATE_ISSUE_CODES = [
  // errors
  "tooLarge",
  "notXlsx",
  "macro",
  "externalLink",
  "externalFormula",
  "noRoleSheet",
  "unknownRole",
  "duplicateRole",
  "unknownPlaceholder",
  "numberNotAlone",
  "placeholderSplit",
  "missingMarker",
  "duplicateMarker",
  "markerGap",
  // Dropped by exceljs: logo and stamp must be pictures placed over the cells.
  "chartLost",
  "shapeLost",
  "headerImageLost",
  // warnings
  "unmarkedPlaceholders",
  "unknownMarker",
  "brokenPlaceholder",
  "missingPlaceholder",
  "missingSheetRef",
] as const;
export type TemplateIssueCode = (typeof TEMPLATE_ISSUE_CODES)[number];

export interface TemplateIssue {
  level: "error" | "warning";
  code: TemplateIssueCode;
  sheet?: string;
  cell?: string;
  values?: Record<string, string>;
}

export interface TemplateSheetInfo {
  name: string;
  /** null = no role (copied untouched). */
  role: SheetRole | typeof GUIDE_ROLE | null;
}

export interface TemplateReport {
  ok: boolean;
  size: number;
  sha256: string;
  sheets: TemplateSheetInfo[];
  errors: TemplateIssue[];
  warnings: TemplateIssue[];
}

/** Thrown by buildHstt when a template has errors (validate before saving one). */
export class HsttTemplateError extends Error {
  constructor(readonly issues: TemplateIssue[]) {
    super(`File mẫu HSTT không hợp lệ: ${issues.map((i) => [i.code, i.sheet, i.cell].filter(Boolean).join(" ")).join("; ")}`);
    this.name = "HsttTemplateError";
  }
}

// ───────────── Cell helpers ─────────────

/** Text of a string / rich-text cell value, else null. */
export function cellText(v: ExcelJS.CellValue): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "richText" in v) return v.richText.map((t) => t.text).join("");
  return null;
}

export function eachMasterCell(ws: ExcelJS.Worksheet, fn: (cell: ExcelJS.Cell) => void) {
  ws.eachRow({ includeEmpty: false }, (row) =>
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      fn(cell);
    }),
  );
}

/** Sheet name as written in a formula: 'Giá trị'. */
export const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;

function formulaOf(v: ExcelJS.CellValue): string | null {
  if (v && typeof v === "object") {
    if ("formula" in v && typeof v.formula === "string") return v.formula;
    if ("sharedFormula" in v && typeof v.sharedFormula === "string") return null; // the master holds the text
  }
  return null;
}

/** Sheet names referenced by a formula ('Giá trị'!J82, Sheet1!A1). */
function sheetRefs(formula: string): string[] {
  const out: string[] = [];
  for (const m of formula.matchAll(/'((?:[^']|'')+)'!|([A-Za-z_À-ỹ][\wÀ-ỹ.]*)!/g)) {
    out.push(m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]);
  }
  return out;
}

// ───────────── Workbook inspection (shared with buildHstt) ─────────────

export interface WorkbookRoles {
  roles: Map<SheetRole, ExcelJS.Worksheet>;
  guides: ExcelJS.Worksheet[];
  sheets: TemplateSheetInfo[];
  issues: TemplateIssue[];
}

/** Row of each marker in column Z (rows 2+). */
export function readMarkers(ws: ExcelJS.Worksheet): Map<string, number[]> {
  const out = new Map<string, number[]>();
  ws.getColumn(MARKER_COLUMN).eachCell({ includeEmpty: false }, (cell, r) => {
    if (r === 1) return;
    const v = cellText(cell.value)?.trim();
    if (v) out.set(v, [...(out.get(v) ?? []), r]);
  });
  return out;
}

function checkPlaceholders(ws: ExcelJS.Worksheet, issues: TemplateIssue[]): Set<string> {
  const found = new Set<string>();
  eachMasterCell(ws, (cell) => {
    const text = cellText(cell.value);
    if (text === null || (!text.includes("{{") && !text.includes("}}"))) return;
    const at = { sheet: ws.name, cell: cell.address };
    const keys = placeholderKeys(text);
    for (const key of keys) {
      found.add(key);
      if (!PLACEHOLDER_KEYS.has(key)) {
        issues.push({ level: "error", code: "unknownPlaceholder", ...at, values: { key } });
      } else if (NUMBER_PLACEHOLDERS.has(key) && text.trim() !== `{{${key}}}`) {
        issues.push({ level: "error", code: "numberNotAlone", ...at, values: { key } });
      }
    }
    const rest = text.replace(PLACEHOLDER_RE, "");
    if (rest.includes("{{") || rest.includes("}}")) {
      issues.push({ level: "warning", code: "brokenPlaceholder", ...at, values: { text: text.slice(0, 80) } });
    }
    const v = cell.value;
    if (v && typeof v === "object" && "richText" in v) {
      const inRuns = v.richText.reduce((n, run) => n + placeholderKeys(run.text).length, 0);
      if (inRuns < keys.length) issues.push({ level: "error", code: "placeholderSplit", ...at });
    }
  });
  return found;
}

function checkMarkers(ws: ExcelJS.Worksheet, role: SheetRole, issues: TemplateIssue[]) {
  const markers = readMarkers(ws);
  const required = ROLE_MARKERS[role];
  const allowed = new Set<string>([...required, ...ROLE_OPTIONAL_MARKERS[role]]);
  for (const [value, rows] of markers) {
    if (!allowed.has(value)) {
      issues.push({ level: "warning", code: "unknownMarker", sheet: ws.name, cell: `Z${rows[0]}`, values: { marker: value } });
    } else if (rows.length > 1) {
      issues.push({
        level: "error",
        code: "duplicateMarker",
        sheet: ws.name,
        values: { marker: value, rows: rows.join(", ") },
      });
    }
  }
  const missing = required.filter((m) => !markers.has(m));
  for (const m of missing) issues.push({ level: "error", code: "missingMarker", sheet: ws.name, values: { marker: m } });
  if (missing.length) return;
  for (let i = 0; i + 1 < required.length; i++) {
    const a = markers.get(required[i])![0];
    const b = markers.get(required[i + 1])![0];
    if (b !== a + 1) {
      issues.push({
        level: "error",
        code: "markerGap",
        sheet: ws.name,
        values: { from: required[i], to: required[i + 1], fromRow: String(a), toRow: String(b) },
      });
    }
  }
}

function checkFormulas(ws: ExcelJS.Worksheet, names: Set<string>, issues: TemplateIssue[]) {
  const missingRefs = new Set<string>();
  eachMasterCell(ws, (cell) => {
    const f = formulaOf(cell.value);
    if (!f) return;
    if (/\[[^\]]*\]/.test(f)) {
      issues.push({ level: "error", code: "externalFormula", sheet: ws.name, cell: cell.address, values: { formula: f.slice(0, 80) } });
      return;
    }
    for (const ref of sheetRefs(f)) if (!names.has(ref)) missingRefs.add(ref);
  });
  for (const ref of missingRefs) issues.push({ level: "warning", code: "missingSheetRef", sheet: ws.name, values: { ref } });
}

/** Roles of the sheets of a loaded template, and every structural issue. */
export function inspectWorkbook(wb: ExcelJS.Workbook): WorkbookRoles {
  const roles = new Map<SheetRole, ExcelJS.Worksheet>();
  const guides: ExcelJS.Worksheet[] = [];
  const sheets: TemplateSheetInfo[] = [];
  const issues: TemplateIssue[] = [];
  const names = new Set(wb.worksheets.map((w) => w.name));

  for (const ws of wb.worksheets) {
    const z1 = ws.getCell(1, MARKER_COLUMN).value;
    const role = parseRole(cellText(z1));
    checkFormulas(ws, names, issues);
    if (role === GUIDE_ROLE) {
      guides.push(ws);
      sheets.push({ name: ws.name, role });
      continue;
    }
    if (role === "unknown") {
      issues.push({ level: "error", code: "unknownRole", sheet: ws.name, cell: "Z1", values: { value: cellText(z1) ?? "" } });
      sheets.push({ name: ws.name, role: null });
      continue;
    }
    if (role === null) {
      const local: TemplateIssue[] = [];
      const found = checkPlaceholders(ws, local);
      if (found.size) issues.push({ level: "warning", code: "unmarkedPlaceholders", sheet: ws.name, values: { count: String(found.size) } });
      sheets.push({ name: ws.name, role: null });
      continue;
    }
    sheets.push({ name: ws.name, role });
    const other = roles.get(role);
    if (other) {
      issues.push({ level: "error", code: "duplicateRole", sheet: ws.name, values: { role, other: other.name } });
      continue;
    }
    roles.set(role, ws);
    const found = checkPlaceholders(ws, issues);
    checkMarkers(ws, role, issues);
    for (const key of ROLE_EXPECTED_PLACEHOLDERS[role]) {
      if (!found.has(key)) issues.push({ level: "warning", code: "missingPlaceholder", sheet: ws.name, values: { key } });
    }
  }
  if (roles.size === 0) issues.push({ level: "error", code: "noRoleSheet" });
  return { roles, guides, sheets, issues };
}

// ───────────── Package-level checks ─────────────

export type ZipFiles = Record<string, { content?: Uint8Array | string }>;

function zipEntries(buf: Buffer): ZipFiles | null {
  try {
    const wb = XLSX.read(buf, { type: "buffer", bookFiles: true }) as unknown as { files?: ZipFiles };
    const files = wb.files ?? null;
    return files && "[Content_Types].xml" in files ? files : null;
  } catch {
    return null;
  }
}

const entryText = (f: ZipFiles[string] | undefined) =>
  !f?.content ? "" : typeof f.content === "string" ? f.content : Buffer.from(f.content).toString("utf8");

/** Issues visible in the package itself (macro, external links, drawings exceljs drops). All errors. */
export function packageIssues(files: ZipFiles): TemplateIssue[] {
  const names = Object.keys(files);
  const issues: TemplateIssue[] = [];
  const contentTypes = entryText(files["[Content_Types].xml"]);
  if (names.some((n) => /vbaProject\.bin$/i.test(n)) || /macroEnabled/i.test(contentTypes)) {
    issues.push({ level: "error", code: "macro" });
  }
  if (names.some((n) => n.startsWith("xl/externalLinks/"))) issues.push({ level: "error", code: "externalLink" });
  if (names.some((n) => n.startsWith("xl/charts/"))) issues.push({ level: "error", code: "chartLost" });
  if (names.some((n) => /^xl\/drawings\/drawing\d+\.xml$/.test(n) && /<xdr:sp[\s>]/.test(entryText(files[n])))) {
    issues.push({ level: "error", code: "shapeLost" });
  }
  if (names.some((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n) && /<legacyDrawingHF[\s/>]/.test(entryText(files[n])))) {
    issues.push({ level: "error", code: "headerImageLost" });
  }
  return issues;
}

function report(size: number, sha256: string, sheets: TemplateSheetInfo[], issues: TemplateIssue[]): TemplateReport {
  const errors = issues.filter((i) => i.level === "error");
  return { ok: errors.length === 0, size, sha256, sheets, errors, warnings: issues.filter((i) => i.level === "warning") };
}

/** Full check of an uploaded template file. Never throws. */
export async function validateTemplate(input: Buffer | ArrayBuffer | Uint8Array): Promise<TemplateReport> {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input as ArrayBuffer);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  if (buf.length > MAX_TEMPLATE_BYTES) {
    return report(buf.length, sha256, [], [
      { level: "error", code: "tooLarge", values: { size: String(buf.length), max: String(MAX_TEMPLATE_BYTES) } },
    ]);
  }
  const files = zipEntries(buf);
  if (!files) return report(buf.length, sha256, [], [{ level: "error", code: "notXlsx" }]);
  const issues = packageIssues(files);
  if (issues.some((i) => i.code === "macro")) return report(buf.length, sha256, [], issues);

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    return report(buf.length, sha256, [], [...issues, { level: "error", code: "notXlsx" }]);
  }
  const inspected = inspectWorkbook(wb);
  return report(buf.length, sha256, inspected.sheets, [...issues, ...inspected.issues]);
}

// ───────────── Editable standard template ─────────────

export const GUIDE_SHEET_NAME = "HUONG_DAN";

/**
 * The standard template prepared for editing: column Z (roles + row markers)
 * visible on the role sheets, plus a HUONG_DAN sheet (role "huong-dan", left
 * out of generated files) listing the convention and every placeholder.
 */
export async function buildEditableTemplate(standard: Buffer | ArrayBuffer | Uint8Array): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const buf = Buffer.isBuffer(standard) ? standard : Buffer.from(standard as ArrayBuffer);
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const { roles } = inspectWorkbook(wb);
  for (const ws of roles.values()) {
    const col = ws.getColumn(MARKER_COLUMN);
    col.hidden = false;
    col.width = 20;
  }

  const old = wb.getWorksheet(GUIDE_SHEET_NAME);
  if (old) wb.removeWorksheet(old.id);
  const g = wb.addWorksheet(GUIDE_SHEET_NAME);
  g.getCell(1, MARKER_COLUMN).value = `${ROLE_PREFIX}${GUIDE_ROLE}`;
  g.getColumn(1).width = 26;
  g.getColumn(2).width = 24;
  g.getColumn(3).width = 52;
  g.getColumn(4).width = 52;
  const bold = { name: "Times New Roman", size: 12, bold: true };
  const normal = { name: "Times New Roman", size: 12 };
  let r = 1;
  const line = (values: string[], font: Partial<ExcelJS.Font> = normal) => {
    const row = g.getRow(r++);
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = font;
      cell.alignment = { vertical: "top", wrapText: true };
    });
  };
  line(["HƯỚNG DẪN LÀM MẪU HSTT (sheet này không có trong file gửi khách)"], { ...bold, size: 14 });
  line(["Chi tiết: docs/hstt/cach-tu-lam-mau.md. Sửa chữ, font, màu, logo thoải mái; giữ các ô {{…}} và cột Z."]);
  r++;
  line(["1. VAI TRÒ SHEET (ô Z1)"], bold);
  line(["Giá trị ô Z1", "Biểu"], bold);
  for (const role of SHEET_ROLES) line([`${ROLE_PREFIX}${role}`, ROLE_LABELS[role]]);
  line([`${ROLE_PREFIX}${GUIDE_ROLE}`, "Sheet hướng dẫn, bị bỏ khi xuất file"]);
  line(["(trống)", "Sheet giữ nguyên, không điền dữ liệu"]);
  r++;
  line(["2. DẤU DÒNG (cột Z, biểu Giá trị và Khối lượng; các dòng phải liền nhau, đúng thứ tự)"], bold);
  line(["Dấu", "Biểu", "Ý nghĩa"], bold);
  for (const [key, meaning] of Object.entries(MARKERS) as [MarkerKey, string][]) {
    const where = SHEET_ROLES.filter((role) => ROLE_MARKERS[role].includes(key)).map((role) => (role === "gia-tri" ? "Giá trị" : "Khối lượng"));
    line([key, where.length ? where.join(", ") : "Giá trị (không bắt buộc)", meaning]);
  }
  r++;
  line(["3. Ô DỮ LIỆU {{…}} (gõ đúng chữ thường, không dấu cách)"], bold);
  line(["Ô dữ liệu", "Nhóm", "Ý nghĩa", "Ví dụ"], bold);
  for (const ph of PLACEHOLDERS) {
    line([`{{${ph.key}}}`, ph.group, ph.kind === "number" ? `${ph.label} – phải đứng một mình trong ô` : ph.label, ph.example]);
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
