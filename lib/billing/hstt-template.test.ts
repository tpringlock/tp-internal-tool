import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { buildHstt, type HsttInput } from "./hstt-export";
import { PLACEHOLDERS } from "./hstt-placeholders";
import {
  GUIDE_SHEET_NAME,
  HsttTemplateError,
  MAX_TEMPLATE_BYTES,
  buildEditableTemplate,
  packageIssues,
  validateTemplate,
  type TemplateReport,
} from "./hstt-template";

// Loads and writes the real template many times: own timeout (see hstt-export.test.ts).
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const standard = readFileSync(new URL("../../docs/hstt/hstt-template.xlsx", import.meta.url));
/** HSTT T09/2026 Việt Panel, snapshot of the production calculation (scripts/hstt-snapshot.mts). */
const t09 = JSON.parse(
  readFileSync(new URL("./__fixtures__/hstt-t09-2026-vietpanel.json", import.meta.url), "utf8"),
) as HsttInput;

const T09 = { equipment: 656_478_611, afterTax: 800_796_900, closing: 2_157_244_432 };

async function load(buf: Buffer | Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}
async function save(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
/** A TEST template: the standard one changed by `edit`. */
async function variant(edit: (wb: ExcelJS.Workbook) => unknown): Promise<Buffer> {
  const wb = await load(standard);
  await edit(wb);
  return save(wb);
}
const codes = (r: TemplateReport, level: "errors" | "warnings" = "errors") => r[level].map((i) => i.code);
const plain = (v: ExcelJS.CellValue): unknown =>
  v && typeof v === "object" && "result" in v ? (v as ExcelJS.CellFormulaValue).result : v;
function findRow(ws: ExcelJS.Worksheet, col: number, prefix: string): number {
  let found = 0;
  ws.eachRow((row, r) => {
    const v = row.getCell(col).value;
    const text = v && typeof v === "object" && "richText" in v ? v.richText.map((t) => t.text).join("") : String(v ?? "");
    if (!found && text.startsWith(prefix)) found = r;
  });
  return found;
}
/** Font, fill, border, number format and alignment of a cell, for comparison. */
const style = (c: ExcelJS.Cell) => JSON.stringify([c.font, c.fill, c.border, c.numFmt, c.alignment]);

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

describe("standard template", () => {
  it("passes the check with no error and no warning, one sheet per role", async () => {
    const r = await validateTemplate(standard);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.sheets).toEqual([
      { name: "ĐNTT", role: "dntt" },
      { name: "ĐCCN", role: "dccn" },
      { name: "Giá trị", role: "gia-tri" },
      { name: "Khối lượng", role: "khoi-luong" },
    ]);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses every placeholder of the convention (docs/hstt/hstt-export-plan.md section 4)", async () => {
    const wb = await load(standard);
    const used = new Set<string>();
    for (const ws of wb.worksheets) {
      ws.eachRow((row) => row.eachCell((c) => {
        for (const m of String(c.value ?? "").matchAll(/\{\{([^{}]*)\}\}/g)) used.add(m[1]);
      }));
    }
    expect([...used].sort()).toEqual(PLACEHOLDERS.map((p) => p.key).sort());
  });

  it("generates HSTT T09/2026 Việt Panel to the đồng: 800.796.900 after tax", async () => {
    const res = await buildHstt(t09, standard);
    expect(res.totals.equipment).toBe(T09.equipment);
    expect(res.totals.afterTax).toBe(T09.afterTax);
    expect(res.closingDebt).toBe(T09.closing);
    const wb = await load(res.buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["ĐNTT", "ĐCCN", "Giá trị", "Khối lượng"]);
    const gt = wb.getWorksheet("Giá trị")!;
    const after = findRow(gt, 1, "Tổng tiền thuê đã bao gồm");
    expect(gt.getCell(`J${after}`).value).toMatchObject({ result: T09.afterTax });
    expect(wb.getWorksheet("ĐCCN")!.getCell("G29").value).toMatchObject({ formula: "G26+G27-G28", result: T09.closing });
    expect(wb.getWorksheet("ĐNTT")!.getCell("E14").value).toMatchObject({ formula: `'Giá trị'!J${after}`, result: T09.afterTax });
    for (const ws of wb.worksheets) {
      expect(ws.getColumn(26).hidden, ws.name).toBe(true);
      expect(ws.getCell("Z1").value, ws.name).toBeNull();
    }
  });
});

describe("editable standard template (download to customise)", () => {
  it("shows the markers, adds the HUONG_DAN sheet, passes the check", async () => {
    const editable = await buildEditableTemplate(standard);
    const wb = await load(editable);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["ĐNTT", "ĐCCN", "Giá trị", "Khối lượng", GUIDE_SHEET_NAME]);
    expect(wb.getWorksheet("Giá trị")!.getColumn(26).hidden).toBe(false);
    const guide = wb.getWorksheet(GUIDE_SHEET_NAME)!;
    const text: string[] = [];
    guide.eachRow((row) => row.eachCell((c) => text.push(String(c.value))));
    for (const p of PLACEHOLDERS) expect(text).toContain(`{{${p.key}}}`);

    const r = await validateTemplate(editable);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.sheets.at(-1)).toEqual({ name: GUIDE_SHEET_NAME, role: "huong-dan" });
  });

  it("uploaded unchanged, gives the same HSTT without the guide sheet", async () => {
    const res = await buildHstt(t09, await buildEditableTemplate(standard));
    expect(res.totals.afterTax).toBe(T09.afterTax);
    const wb = await load(res.buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["ĐNTT", "ĐCCN", "Giá trị", "Khối lượng"]);
    expect(wb.getWorksheet("Giá trị")!.getColumn(26).hidden).toBe(true);
  });
});

describe("TEST templates: the generated file keeps the template's look", () => {
  it("TEST changed text, font and colour (incl. part of a cell)", async () => {
    const red = { argb: "FFC00000" };
    const tpl = await variant((wb) => {
      const dntt = wb.getWorksheet("ĐNTT")!;
      dntt.getCell("A8").value = "GIẤY ĐỀ NGHỊ THANH TOÁN TIỀN THUÊ";
      dntt.getCell("A8").font = { name: "Arial", size: 18, bold: true, color: red };
      dntt.getCell("A10").value = {
        richText: [
          { text: "Kính gửi: ", font: { name: "Arial", size: 13 } },
          { text: "{{a.ten_in_hoa}}", font: { name: "Arial", size: 13, bold: true, color: red } },
        ],
      };
      const gt = wb.getWorksheet("Giá trị")!;
      gt.getCell("A4").font = { name: "Arial", size: 16, bold: true, color: red };
      for (let r = 29; r <= 37; r++) gt.getCell(`B${r}`).font = { name: "Arial", size: 12, italic: true };
    });
    const r = await validateTemplate(tpl);
    expect(r.errors).toEqual([]);

    const res = await buildHstt(t09, tpl);
    expect(res.totals.afterTax).toBe(T09.afterTax);
    const [tw, out] = [await load(tpl), await load(res.buffer)];
    const dntt = out.getWorksheet("ĐNTT")!;
    expect(dntt.getCell("A8").value).toBe("GIẤY ĐỀ NGHỊ THANH TOÁN TIỀN THUÊ");
    expect(dntt.getCell("A8").font).toMatchObject({ name: "Arial", size: 18, color: red });
    expect(dntt.getCell("A10").value).toEqual({
      richText: [
        { text: "Kính gửi: ", font: { name: "Arial", size: 13 } },
        { text: t09.customer.ten_in_hoa, font: { name: "Arial", size: 13, bold: true, color: red } },
      ],
    });
    // Rows above the table: same style cell by cell as the template.
    for (const name of ["ĐNTT", "Giá trị"]) {
      const a = tw.getWorksheet(name)!;
      const b = out.getWorksheet(name)!;
      for (let row = 1; row <= 28; row++) {
        for (let col = 1; col <= 11; col++) {
          expect(style(b.getCell(row, col)), `${name}!${b.getCell(row, col).address}`).toBe(style(a.getCell(row, col)));
        }
      }
    }
    // Every generated equipment row copies the template row's (italic Arial) name style.
    const gt = out.getWorksheet("Giá trị")!;
    const last = findRow(gt, 1, "Tổng tiền thuê tháng");
    for (let row = 30; row < last; row++) expect(gt.getCell(`B${row}`).font, `B${row}`).toMatchObject({ name: "Arial", italic: true });
  });

  it("TEST without the Khối lượng sheet", async () => {
    const tpl = await variant((wb) => wb.removeWorksheet(wb.getWorksheet("Khối lượng")!.id));
    expect((await validateTemplate(tpl)).errors).toEqual([]);
    const res = await buildHstt(t09, tpl);
    expect(res.totals.afterTax).toBe(T09.afterTax);
    const out = await load(res.buffer);
    expect(out.worksheets.map((w) => w.name)).toEqual(["ĐNTT", "ĐCCN", "Giá trị"]);
    expect(out.getWorksheet("ĐCCN")!.getCell("G27").value).toMatchObject({ result: T09.afterTax });
  });

  it("TEST with only ĐNTT + ĐCCN: amounts written as numbers", async () => {
    const tpl = await variant((wb) => {
      wb.removeWorksheet(wb.getWorksheet("Khối lượng")!.id);
      wb.removeWorksheet(wb.getWorksheet("Giá trị")!.id);
    });
    expect((await validateTemplate(tpl)).errors).toEqual([]);
    const out = await load((await buildHstt(t09, tpl)).buffer);
    expect(out.getWorksheet("ĐNTT")!.getCell("E14").value).toBe(T09.afterTax);
    expect(out.getWorksheet("ĐCCN")!.getCell("G27").value).toBe(T09.afterTax);
    expect(out.getWorksheet("ĐCCN")!.getCell("G29").value).toMatchObject({ formula: "G26+G27-G28", result: T09.closing });
  });

  it("TEST with a logo on top and a stamp under the table: both kept, the stamp moves with the rows", async () => {
    const tpl = await variant((wb) => {
      const id = wb.addImage({ buffer: PNG as unknown as ExcelJS.Buffer, extension: "png" });
      const gt = wb.getWorksheet("Giá trị")!;
      gt.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 80, height: 30 } });
      gt.addImage(id, "H40:J42");
    });
    expect((await validateTemplate(tpl)).errors).toEqual([]);
    const res = await buildHstt(t09, tpl);
    const gt = (await load(res.buffer)).getWorksheet("Giá trị")!;
    const images = gt.getImages().map((i) => i.range.tl.nativeRow).sort((a, b) => a - b);
    // Template: 43 rows (print area A1:K43); the stamp starts on row 40 (0-based 39).
    const end = Number(/(\d+)$/.exec(gt.pageSetup.printArea!)![1]);
    expect(images).toEqual([0, 39 + (end - 43)]);
  });

  it("TEST ĐCCN with the amount and description columns swapped", async () => {
    const tpl = await variant((wb) => {
      const ws = wb.getWorksheet("ĐCCN")!;
      for (let r = 24; r <= 29; r++) {
        const label = ws.getCell(`B${r}`).value;
        const amount = ws.getCell(`G${r}`).value;
        const [labelStyle, amountStyle] = [structuredClone(ws.getCell(`B${r}`).style), structuredClone(ws.getCell(`G${r}`).style)];
        ws.unMergeCells(`B${r}:F${r}`);
        ws.unMergeCells(`G${r}:H${r}`);
        for (const c of "BCDEFGH") {
          ws.getCell(`${c}${r}`).value = null;
          ws.getCell(`${c}${r}`).style = structuredClone("BC".includes(c) ? amountStyle : labelStyle);
        }
        ws.getCell(`B${r}`).value = amount;
        ws.getCell(`D${r}`).value = label;
        ws.mergeCells(`B${r}:C${r}`);
        ws.mergeCells(`D${r}:H${r}`);
      }
    });
    expect((await validateTemplate(tpl)).errors).toEqual([]);
    const out = (await load((await buildHstt(t09, tpl)).buffer)).getWorksheet("ĐCCN")!;
    expect(out.getCell("B29").value).toMatchObject({ formula: "B26+B27-B28", result: T09.closing });
    expect(plain(out.getCell("B26").value)).toBe(t09.debt.opening);
    expect(plain(out.getCell("B28").value)).toBe(t09.debt.paid);
    expect(out.getCell("D27").value).toBe("Giá trị tiền thuê phát sinh tháng 09/2026");
    expect(out.getCell("B26").numFmt).toBe((await load(standard)).getWorksheet("ĐCCN")!.getCell("G26").numFmt);
  });

  it("TEST renamed sheets: references follow the new names", async () => {
    const tpl = await variant((wb) => {
      wb.getWorksheet("Giá trị")!.name = "BB gia tri (KH)";
    });
    expect((await validateTemplate(tpl)).errors).toEqual([]);
    const out = await load((await buildHstt(t09, tpl)).buffer);
    expect(out.getWorksheet("ĐNTT")!.getCell("E14").value).toMatchObject({ formula: expect.stringMatching(/^'BB gia tri \(KH\)'!J\d+$/) });
  });

  it("copies a sheet without a role untouched (warning when it has placeholders)", async () => {
    const tpl = await variant((wb) => {
      wb.addWorksheet("Ghi chú").getCell("A1").value = "Tháng {{thang}}";
    });
    const r = await validateTemplate(tpl);
    expect(r.errors).toEqual([]);
    expect(codes(r, "warnings")).toEqual(["unmarkedPlaceholders"]);
    const out = await load((await buildHstt(t09, tpl)).buffer);
    expect(out.getWorksheet("Ghi chú")!.getCell("A1").value).toBe("Tháng {{thang}}");
  });
});

describe("validateTemplate – errors block, warnings do not", () => {
  it("unknown placeholder, number placeholder inside text", async () => {
    const r = await validateTemplate(
      await variant((wb) => {
        wb.getWorksheet("ĐNTT")!.getCell("A8").value = "ĐỀ NGHỊ {{a.ten}}";
        wb.getWorksheet("ĐNTT")!.getCell("B15").value = "Số tiền {{dntt.so_tien}} đồng";
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([
      { level: "error", code: "unknownPlaceholder", sheet: "ĐNTT", cell: "A8", values: { key: "a.ten" } },
      { level: "error", code: "numberNotAlone", sheet: "ĐNTT", cell: "B15", values: { key: "dntt.so_tien" } },
    ]);
    // dntt.so_tien is still there (inside text): no "missing" warning.
    expect(codes(r, "warnings")).toEqual([]);
  });

  it("placeholder split over two formats of a rich-text cell", async () => {
    const r = await validateTemplate(
      await variant((wb) => {
        wb.getWorksheet("ĐNTT")!.getCell("A10").value = { richText: [{ text: "Kính gửi: {{a.ten_" }, { text: "in_hoa}}", font: { bold: true } }] };
      }),
    );
    expect(codes(r)).toContain("placeholderSplit");
  });

  it("missing, duplicate and non-consecutive row markers", async () => {
    const missing = await validateTemplate(await variant((wb) => (wb.getWorksheet("Giá trị")!.getCell("Z32").value = null)));
    expect(missing.errors).toEqual([{ level: "error", code: "missingMarker", sheet: "Giá trị", values: { marker: "row:cong" } }]);

    const dup = await validateTemplate(await variant((wb) => (wb.getWorksheet("Khối lượng")!.getCell("Z37").value = "row:cong")));
    expect(dup.errors).toEqual([{ level: "error", code: "duplicateMarker", sheet: "Khối lượng", values: { marker: "row:cong", rows: "33, 37" } }]);

    const gap = await validateTemplate(
      await variant((wb) => {
        const ws = wb.getWorksheet("Giá trị")!;
        ws.getCell("Z33").value = null;
        ws.getCell("Z39").value = "section:van-chuyen";
      }),
    );
    expect(gap.errors.map((i) => [i.code, i.values?.from, i.values?.to])).toEqual([
      ["markerGap", "row:cong", "section:van-chuyen"],
      ["markerGap", "section:van-chuyen", "row:van-chuyen"],
    ]);
  });

  it("unknown marker is only a warning", async () => {
    const r = await validateTemplate(await variant((wb) => (wb.getWorksheet("Giá trị")!.getCell("Z40").value = "row:ghi-chu")));
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([{ level: "warning", code: "unknownMarker", sheet: "Giá trị", cell: "Z40", values: { marker: "row:ghi-chu" } }]);
  });

  it("duplicate role, unknown role, no role at all", async () => {
    const dup = await validateTemplate(await variant((wb) => (wb.getWorksheet("Khối lượng")!.getCell("Z1").value = "sheet:gia-tri")));
    expect(dup.errors).toEqual([{ level: "error", code: "duplicateRole", sheet: "Khối lượng", values: { role: "gia-tri", other: "Giá trị" } }]);

    const unknown = await validateTemplate(await variant((wb) => (wb.getWorksheet("ĐNTT")!.getCell("Z1").value = "sheet:de-nghi")));
    expect(unknown.errors).toEqual([{ level: "error", code: "unknownRole", sheet: "ĐNTT", cell: "Z1", values: { value: "sheet:de-nghi" } }]);

    const none = await validateTemplate(
      await variant((wb) => {
        for (const ws of wb.worksheets) ws.getCell("Z1").value = null;
      }),
    );
    expect(codes(none)).toEqual(["noRoleSheet"]);
    expect(codes(none, "warnings")).toEqual(Array(4).fill("unmarkedPlaceholders"));
  });

  it("formula pointing to another file; reference to a missing sheet is a warning", async () => {
    const r = await validateTemplate(
      await variant((wb) => {
        wb.getWorksheet("ĐNTT")!.getCell("H1").value = { formula: "[1]Sheet1!A1", result: 0 };
        wb.getWorksheet("ĐNTT")!.getCell("H2").value = { formula: "'Khối lượng cũ'!A1", result: 0 };
      }),
    );
    expect(r.errors).toEqual([
      { level: "error", code: "externalFormula", sheet: "ĐNTT", cell: "H1", values: { formula: "[1]Sheet1!A1" } },
    ]);
    expect(r.warnings).toEqual([{ level: "warning", code: "missingSheetRef", sheet: "ĐNTT", values: { ref: "Khối lượng cũ" } }]);
  });

  it("expected placeholder missing is a warning", async () => {
    const r = await validateTemplate(await variant((wb) => (wb.getWorksheet("ĐNTT")!.getCell("E14").value = 0)));
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([{ level: "warning", code: "missingPlaceholder", sheet: "ĐNTT", values: { key: "dntt.so_tien" } }]);
  });

  it("too large, not an .xlsx", async () => {
    expect(codes(await validateTemplate(Buffer.alloc(MAX_TEMPLATE_BYTES + 1)))).toEqual(["tooLarge"]);
    expect(codes(await validateTemplate(Buffer.from("not a spreadsheet")))).toEqual(["notXlsx"]);
  });

  it("package checks: macro, external links, charts / shapes / header-footer pictures (all errors)", () => {
    const ct = { content: "<Types/>" };
    expect(packageIssues({ "[Content_Types].xml": ct, "xl/vbaProject.bin": {} }).map((i) => i.code)).toEqual(["macro"]);
    expect(
      packageIssues({ "[Content_Types].xml": { content: "application/vnd.ms-excel.sheet.macroEnabled.main+xml" } }).map((i) => i.code),
    ).toEqual(["macro"]);
    expect(packageIssues({ "[Content_Types].xml": ct, "xl/externalLinks/externalLink1.xml": {} }).map((i) => i.code)).toEqual(["externalLink"]);
    expect(
      packageIssues({
        "[Content_Types].xml": ct,
        "xl/charts/chart1.xml": {},
        "xl/drawings/drawing1.xml": { content: "<xdr:wsDr><xdr:twoCellAnchor><xdr:sp macro=''/></xdr:twoCellAnchor></xdr:wsDr>" },
        "xl/worksheets/sheet1.xml": { content: "<worksheet><legacyDrawingHF r:id='x'/></worksheet>" },
      }).map((i) => [i.level, i.code]),
    ).toEqual([
      ["error", "chartLost"],
      ["error", "shapeLost"],
      ["error", "headerImageLost"],
    ]);
    expect(packageIssues({ "[Content_Types].xml": ct, "xl/drawings/drawing1.xml": { content: "<xdr:pic/>" } })).toEqual([]);
  });

  it("buildHstt refuses a template with errors", async () => {
    const tpl = await variant((wb) => (wb.getWorksheet("Giá trị")!.getCell("Z32").value = null));
    await expect(buildHstt(t09, tpl)).rejects.toBeInstanceOf(HsttTemplateError);
  });
});
