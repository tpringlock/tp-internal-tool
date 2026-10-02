import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildHstt, canCuText, estimateLines, hsttFileName, type HsttInput } from "./hstt-export";
import type { RentItemResult, RentLine } from "./types";

// Parses real MISA / Excel files, which is slow on a busy machine: this file
// gets its own timeout instead of raising the global one.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// ── Golden data: T08/2026 Việt Panel (docs/hstt/hstt-export-plan.md, section 6) ──
type FixtureLine = {
  item: string;
  unit: string;
  date: string;
  is_opening: boolean;
  qty: number;
  days: number;
  unit_price: number;
  amount: number;
};
const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/vietpanel-senci-golden.json", import.meta.url), "utf8"),
) as { periods: { label: string; from: string; to: string; lines: FixtureLine[] }[] };
const t08 = fixture.periods.find((p) => p.label === "08/2026")!;

function itemsFromFixture(lines: FixtureLine[], to: string): RentItemResult[] {
  const items: RentItemResult[] = [];
  for (const l of lines) {
    let item = items.find((i) => i.name === l.item);
    if (!item) {
      item = { name: l.item, unit: l.unit, unitPrice: l.unit_price, lines: [], closingQty: 0, amount: 0 };
      items.push(item);
    }
    const line: RentLine = {
      kind: l.is_opening ? "ton-dau-ky" : "phat-sinh",
      date: l.date,
      endDate: to,
      openingQty: l.is_opening ? l.qty : null,
      qty: l.qty,
      days: l.days,
      excludedDays: 0,
      unitPrice: l.unit_price,
      amount: l.amount,
      ref: "",
      explain: "",
    };
    item.lines.push(line);
    item.closingQty += l.qty;
    item.amount += l.amount;
  }
  return items;
}

const t08Input: HsttInput = {
  month: "2026-08",
  period: { from: t08.from, to: t08.to },
  company: {
    ten_in_hoa: "CÔNG TY CỔ PHẦN TẬP ĐOÀN THIẾT BỊ XÂY DỰNG TP",
    ten_2_dong: "CÔNG TY CỔ PHẦN TẬP ĐOÀN\nTHIẾT BỊ XÂY DỰNG TP",
    ten_thuong: "Công ty Cổ phần Tập đoàn Thiết bị xây dựng TP",
    ten_thu_huong: "Công ty Cổ phần Tập đoàn Thiết bị Xây dựng TP",
    dia_chi: "Thôn Trung, xã Ô Diên, Thành phố Hà Nội, Việt Nam",
    dia_chi_ngan: "Thôn Trung, Xã Ô Diên, Thành phố Hà Nội",
    dien_thoai: "02433250143",
    so_tk: "8331100096008",
    ngan_hang: "Ngân hàng Thương mại cổ phần Quân đội - Chi nhánh Hoàng Quốc Việt",
    mst: "0105204346",
    dai_dien: "Ông Hữu Minh Tiến",
    chuc_vu: "Phó Tổng giám đốc",
    noi_lap: "Hà Nội",
  },
  customer: {
    ten_in_hoa: "CÔNG TY TNHH XÂY DỰNG VIỆT PANEL",
    ten_thuong: "Công ty TNHH xây dựng Việt Panel",
    ten_rut_gon: "Việt Panel",
    dia_chi: "Thôn Đông Phù, Xã Tiên Du, Tỉnh Bắc Ninh, Việt Nam",
    dien_thoai: "0222 6535 699",
    so_tk: "616139999",
    ngan_hang: "MB Ngân hàng quân đội",
    mst: "2300856941",
    dai_dien: "Ông Lưu Đình Cải",
    chuc_vu: "Giám đốc",
  },
  contract: {
    type: "Hợp đồng kinh tế",
    no: "0412/HĐKT2025/TP-VIETPANEL",
    date: "2025-12-04",
    duAnTen: "Senci",
    duAnDiaChi: "KCN Phúc Điền, Hải Dương",
    canCuOverride: null,
    vatPercent: 8,
  },
  items: itemsFromFixture(t08.lines, t08.to),
  excludedReason: "",
  transport: [
    { name: "Vận chuyển xe sơ mi 30 tấn", unit: "Chuyến", unitPrice: 5_000_000, trips: 4, cumulativeTrips: 68, chargeMode: "now", note: "" },
    { name: "Vận chuyển xe thùng 15 tấn", unit: "Chuyến", unitPrice: 4_500_000, trips: null, cumulativeTrips: 1, chargeMode: "now", note: "" },
  ],
  deductions: [],
  debt: { advances: [1_255_054_014, 424_319_720], advancesNote: "", opening: 3_565_941_763, paid: 1_550_000_000 },
};

const template = readFileSync(new URL("../../docs/hstt/hstt-template.xlsx", import.meta.url));

// ── Cell comparison helpers ──
type Value = ExcelJS.CellValue;
function plain(v: Value): string | number | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return plain((v as { result: Value }).result);
    if ("richText" in v) return plain((v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join(""));
    return JSON.stringify(v);
  }
  if (typeof v === "string") {
    const s = v.replace(/,\s*/g, ", ").replace(/[ \t]+/g, " ").trim();
    return s === "" ? null : s;
  }
  return v as number;
}
/** Account numbers / tax codes are text in the generated file, numbers in the hand-made one. */
const same = (a: string | number | null, b: string | number | null) =>
  a === b || (a !== null && b !== null && String(a) === String(b));

function masterCells(ws: ExcelJS.Worksheet, row: number, lastCol: number) {
  const out: ExcelJS.Cell[] = [];
  for (let c = 1; c <= lastCol; c++) {
    const cell = ws.getRow(row).getCell(c);
    if (cell.isMerged && cell.master.address !== cell.address) continue;
    out.push(cell);
  }
  return out;
}

type Box = { top: number; left: number; bottom: number; right: number };
const boxCache = new WeakMap<ExcelJS.Worksheet, Box[]>();
function boxes(ws: ExcelJS.Worksheet): Box[] {
  let b = boxCache.get(ws);
  if (!b) {
    b = ws.model.merges.map((m) => {
      const [a, z] = m.split(":").map((x) => ws.getCell(x));
      return { top: Number(a.row), left: Number(a.col), bottom: Number(z.row), right: Number(z.col) };
    });
    boxCache.set(ws, b);
  }
  return b;
}
/** Merged range containing a cell, if any. */
function mergeOf(ws: ExcelJS.Worksheet, cell: ExcelJS.Cell): Box | null {
  // exceljs types row/col as strings; they are numbers at runtime.
  const row = Number(cell.row);
  const col = Number(cell.col);
  return (
    boxes(ws).find((m) => row >= m.top && row <= m.bottom && col >= m.left && col <= m.right) ??
    null
  );
}

/**
 * Visible borders only: a side of a merged range's master cell that is inside
 * the range is not drawn by Excel (the hand-made file has it on some masters
 * and not on others), so it is not compared.
 */
function visibleBorder(ws: ExcelJS.Worksheet, c: ExcelJS.Cell): string {
  const m = mergeOf(ws, c);
  const edge = {
    top: !m || Number(c.row) === m.top,
    left: !m || Number(c.col) === m.left,
    bottom: !m || Number(c.row) === m.bottom,
    right: !m || Number(c.col) === m.right,
  };
  return (["top", "left", "bottom", "right"] as const)
    .map((k) => (edge[k] ? (c.border?.[k]?.style ?? "-") : "·"))
    .join(",");
}

/**
 * Hand-made formatting that the template (one consistent style per row type)
 * does not reproduce, with the same printed result: the "Kích U" group of the
 * T08 block (golden rows 935–938) has F not italic and I formatted "0".
 */
const KNOWN_STYLE_EXCEPTIONS = new Set([
  "Giá trị!F935:font",
  ...[935, 936, 937, 938].map((r) => `Giá trị!I${r}:numFmt`),
  "Khối lượng!F907:font",
]);

const SHEETS = [
  { name: "ĐNTT", goldenStart: 192, rows: 24, lastCol: "G" },
  { name: "ĐCCN", goldenStart: 275, rows: 34, lastCol: "J" },
  { name: "Giá trị", goldenStart: 868, rows: 88, lastCol: "K" },
  { name: "Khối lượng", goldenStart: 839, rows: 86, lastCol: "I" },
] as const;

describe("buildHstt – golden T08/2026 Việt Panel", () => {
  let out: ExcelJS.Workbook;
  let golden: ExcelJS.Workbook;
  let result: Awaited<ReturnType<typeof buildHstt>>;

  beforeAll(async () => {
    result = await buildHstt(t08Input, template);
    out = new ExcelJS.Workbook();
    await out.xlsx.load(result.buffer as unknown as ArrayBuffer);
    golden = new ExcelJS.Workbook();
    await golden.xlsx.readFile("docs/hstt/hstt-t08-2026-vietpanel.xlsx");
  });

  it("computes the T08 totals to the đồng", () => {
    expect(result.totals).toMatchObject({ beforeTax: 824_542_379, vat: 65_963_390, afterTax: 890_505_769 });
    expect(result.closingDebt).toBe(2_906_447_532);
  });

  it("has the 4 sheets, each printing only its block", () => {
    expect(out.worksheets.map((w) => w.name)).toEqual(["ĐNTT", "ĐCCN", "Giá trị", "Khối lượng"]);
    const firstPrinted: Record<string, number> = { "Khối lượng": 3 };
    for (const s of SHEETS) {
      expect(out.getWorksheet(s.name)!.pageSetup.printArea, s.name).toBe(
        `A${firstPrinted[s.name] ?? 1}:${s.lastCol}${s.rows}`,
      );
    }
  });

  it("starts the Khối lượng print area at the CỘNG HÒA line, like the hand-made file", () => {
    const kl = out.getWorksheet("Khối lượng")!;
    const start = Number(/^A(\d+):/.exec(kl.pageSetup.printArea ?? "")![1]);
    expect(plain(kl.getCell(`A${start}`).value)).toBe("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM");
  });

  it("makes the 'Căn cứ' rows tall enough for their text (at least 2 lines)", () => {
    // Hand-made T09: 32,25 (Giá trị) and 34,5 (Khối lượng); one 13pt line is 16,5.
    expect(out.getWorksheet("Giá trị")!.getRow(7).height).toBeGreaterThanOrEqual(32.25);
    expect(out.getWorksheet("Khối lượng")!.getRow(9).height).toBeGreaterThanOrEqual(32.25);
    expect(out.getWorksheet("ĐNTT")!.getRow(12).height).toBeGreaterThanOrEqual(32.25);
    expect(out.getWorksheet("ĐCCN")!.getRow(8).height).toBeGreaterThanOrEqual(30);
  });

  it("keeps short wrapped cells at their template height", () => {
    expect(out.getWorksheet("ĐNTT")!.getRow(17).height).toBe(16.5); // Đơn vị thụ hưởng
    expect(out.getWorksheet("ĐNTT")!.getRow(10).height).toBe(16.5); // Kính gửi
    expect(out.getWorksheet("ĐNTT")!.getRow(3).height).toBe(16.5); // 2-row merge: untouched
  });

  for (const s of SHEETS) {
    it(`${s.name}: every cell value matches the hand-made block`, () => {
      const ws = out.getWorksheet(s.name)!;
      const gs = golden.getWorksheet(s.name)!;
      const lastCol = s.lastCol.charCodeAt(0) - 64;
      const diffs: string[] = [];
      for (let r = 1; r <= s.rows; r++) {
        for (const cell of masterCells(gs, s.goldenStart + r - 1, lastCol)) {
          const mine = ws.getRow(r).getCell(cell.col);
          const a = plain(mine.value);
          const b = plain(cell.value);
          if (!same(a, b)) diffs.push(`${mine.address}: ${JSON.stringify(a)} ≠ ${cell.address} ${JSON.stringify(b)}`);
        }
        // Cells empty in the golden block must be empty here too.
        for (const cell of masterCells(ws, r, lastCol)) {
          const g = gs.getRow(s.goldenStart + r - 1).getCell(cell.col);
          if (plain(g.value) === null && plain(cell.value) !== null) {
            diffs.push(`${cell.address}: ${JSON.stringify(plain(cell.value))} ≠ empty`);
          }
        }
      }
      expect(diffs).toEqual([]);
    });

    it(`${s.name}: merges, fonts, borders and number formats match`, () => {
      const ws = out.getWorksheet(s.name)!;
      const gs = golden.getWorksheet(s.name)!;
      const shift = s.goldenStart - 1;
      const inBlock = (m: string) => {
        const [top, bottom] = m.match(/\d+/g)!.map(Number);
        return top >= s.goldenStart && bottom < s.goldenStart + s.rows;
      };
      const goldenMerges = gs.model.merges
        .filter(inBlock)
        .map((m) => m.replace(/\d+/g, (n) => String(Number(n) - shift)))
        .sort();
      expect([...ws.model.merges].sort()).toEqual(goldenMerges);

      const lastCol = s.lastCol.charCodeAt(0) - 64;
      const diffs: string[] = [];
      const font = (c: ExcelJS.Cell) => `${c.font?.name ?? ""}/${c.font?.size ?? ""}/${c.font?.bold ? "b" : ""}${c.font?.italic ? "i" : ""}`;
      for (let r = 1; r <= s.rows; r++) {
        for (const g of masterCells(gs, shift + r, lastCol)) {
          if (plain(g.value) === null) continue;
          const mine = ws.getRow(r).getCell(g.col);
          const known = (what: string) => KNOWN_STYLE_EXCEPTIONS.has(`${s.name}!${g.address}:${what}`);
          if (font(mine) !== font(g) && !known("font")) diffs.push(`${mine.address} font ${font(mine)} ≠ ${font(g)}`);
          if ((mine.numFmt ?? "") !== (g.numFmt ?? "") && !known("numFmt")) {
            diffs.push(`${mine.address} numFmt ${mine.numFmt} ≠ ${g.numFmt}`);
          }
          const bm = visibleBorder(ws, mine);
          const bg = visibleBorder(gs, g);
          if (bm !== bg) diffs.push(`${mine.address} border ${bm} ≠ ${bg}`);
        }
      }
      expect(diffs).toEqual([]);

      const widths: string[] = [];
      for (let c = 1; c <= lastCol; c++) {
        if (ws.getColumn(c).width !== gs.getColumn(c).width) {
          widths.push(`col ${c}: ${ws.getColumn(c).width} ≠ ${gs.getColumn(c).width}`);
        }
      }
      expect(widths).toEqual([]);
    });
  }

  it("keeps formulas with precomputed results and recalculates on open", () => {
    const gt = out.getWorksheet("Giá trị")!;
    expect(gt.getCell("J82").value).toMatchObject({ result: 890_505_769 });
    expect((gt.getCell("J82").value as ExcelJS.CellFormulaValue).formula).toBeTruthy();
    // exceljs writes calcPr but does not read it back: check the XML itself.
    const raw = XLSX.read(result.buffer, { type: "buffer", bookFiles: true }) as unknown as {
      files: Record<string, { content: Uint8Array }>;
    };
    expect(Buffer.from(raw.files["xl/workbook.xml"].content).toString("utf8")).toMatch(/fullCalcOnLoad="1"/);
    const dccn = out.getWorksheet("ĐCCN")!;
    expect(dccn.getCell("G27").value).toMatchObject({ formula: "'Giá trị'!J82", result: 890_505_769 });
    expect(dccn.getCell("G25").value).toMatchObject({ formula: "1255054014+424319720", result: 1_679_373_734 });
  });

  it("writes account numbers and tax codes as text", () => {
    const dccn = out.getWorksheet("ĐCCN")!;
    expect(dccn.getCell("C12").value).toBe("616139999");
    expect(dccn.getCell("C13").value).toBe("2300856941");
  });

  it("leaves no placeholder and clears the hidden marker column", () => {
    for (const ws of out.worksheets) {
      ws.eachRow((row) =>
        row.eachCell((cell) => {
          expect(String(plain(cell.value) ?? ""), `${ws.name}!${cell.address}`).not.toContain("{{");
          if (Number(cell.col) === 26) expect(cell.value, `${ws.name}!${cell.address}`).toBeNull();
        }),
      );
    }
  });
});

describe("buildHstt – variants", () => {
  it("inserts deduction rows between VAT and the total, with the Tết note", async () => {
    const items = t08Input.items.slice(0, 1).map((i) => ({
      ...i,
      lines: i.lines.map((l, n) => (n === 0 ? { ...l, days: l.days - 15, excludedDays: 15, amount: l.qty * (l.days - 15) * l.unitPrice } : l)),
    }));
    const { buffer, totals } = await buildHstt(
      {
        ...t08Input,
        items,
        excludedReason: "lễ tết nguyên đán 2026",
        transport: [],
        deductions: [{ label: "Cty TP gửi tặng quà hội nghị NCC", amount: 10_000_000 }],
      },
      template,
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const gt = wb.getWorksheet("Giá trị")!;
    const find = (text: string) => {
      let found = 0;
      gt.eachRow((row, r) => {
        if (!found && String(plain(row.getCell(1).value) ?? "").startsWith(text)) found = r;
      });
      return found;
    };
    const vatRow = find("Tiền thuế GTGT");
    const dedRow = find("Cty TP gửi tặng quà");
    const totalRow = find("Tổng tiền thuê đã bao gồm");
    expect(dedRow).toBe(vatRow + 1);
    expect(totalRow).toBe(dedRow + 1);
    expect(gt.getCell(`J${dedRow}`).value).toBe(10_000_000);
    expect(gt.getCell(`J${totalRow}`).value).toMatchObject({ result: totals.afterTax });
    expect(totals.afterTax).toBe(totals.beforeTax + totals.vat - 10_000_000);
    expect(gt.model.merges).toContain(`A${dedRow}:I${dedRow}`);
    // First line of the item: H = E-D+1-15 and the note in K.
    expect((gt.getCell("H30").value as ExcelJS.CellFormulaValue).formula).toBe("E30-D30+1-15");
    expect(gt.getCell("K30").value).toBe("Đã giảm 15 ngày nghỉ lễ tết nguyên đán 2026");
    // No transport: section II keeps its header only.
    expect(plain(gt.getCell(`B${vatRow - 2}`).value)).toBe("Vận chuyển");
  });

  it("marks transport billed at the end of the term", async () => {
    const { buffer, totals } = await buildHstt(
      { ...t08Input, transport: [{ ...t08Input.transport[0], chargeMode: "end_of_term" }] },
      template,
    );
    expect(totals.transport).toBe(0);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const gt = wb.getWorksheet("Giá trị")!;
    let row = 0;
    gt.eachRow((r, n) => {
      if (plain(r.getCell(2).value) === "Vận chuyển xe sơ mi 30 tấn") row = n;
    });
    expect(gt.getCell(`J${row}`).value).toBeNull();
    expect(gt.getCell(`K${row}`).value).toBe("Tính cuối kỳ");
  });
});

describe("estimateLines (Times New Roman, Excel column widths)", () => {
  const canCu = canCuText(t08Input); // ~190 characters
  const tpWidths = { giaTri: [11.43, 43, 12.14, 16.29, 16.29, 12.57, 16.86, 10.57, 13.14, 21.14, 24.43] };

  it("matches the hand-made files", () => {
    // T09: the "Căn cứ" sentence takes 2 lines on Giá trị (A:K) at 13pt.
    expect(estimateLines(canCu, tpWidths.giaTri, 13)).toBe(2);
    // ĐNTT A11:G11 greeting fits on one line in the hand-made file.
    const greeting = "Công ty Cổ phần Tập đoàn Thiết bị xây dựng TP xin gửi tới Quý Công ty lời chào trân trọng và hợp tác.";
    expect(estimateLines(greeting, [12.43, 12.29, 15.29, 12, 17, 14.29, 33.57], 13)).toBe(1);
  });

  it("counts explicit line breaks and never returns less than one line", () => {
    expect(estimateLines("A\nB", [20], 13)).toBe(2);
    expect(estimateLines("", [20], 13)).toBe(1);
  });
});

describe("buildHstt – wrapped text heights", () => {
  it("grows with the text: a long 'Căn cứ' sentence and a long address get more lines", async () => {
    const long = `- Căn cứ ${"Phụ lục hợp đồng số 01, 02, 03 và 04 kèm theo hợp đồng kinh tế, ".repeat(6)}về việc cho thuê.`;
    const { buffer } = await buildHstt(
      {
        ...t08Input,
        contract: { ...t08Input.contract, canCuOverride: long },
        customer: { ...t08Input.customer, dia_chi: "Số 1, ".repeat(40) + "Bắc Ninh" },
      },
      template,
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const gt = wb.getWorksheet("Giá trị")!;
    const kl = wb.getWorksheet("Khối lượng")!;
    // ~430 characters: 3+ lines on the 198-wide Giá trị merge, more on the narrower ones.
    expect(gt.getRow(7).height).toBeGreaterThanOrEqual(3 * 16.5);
    expect(kl.getRow(9).height).toBeGreaterThanOrEqual(gt.getRow(7).height!);
    expect(wb.getWorksheet("ĐNTT")!.getRow(12).height).toBeGreaterThan(gt.getRow(7).height!);
    // ĐCCN Bên A address (C10:H10, wrapped).
    expect(wb.getWorksheet("ĐCCN")!.getRow(10).height).toBeGreaterThanOrEqual(2 * 15.75);
  });
});

describe("canCuText / hsttFileName", () => {
  it("generates the 'Căn cứ' sentence of the hand-made file", () => {
    expect(canCuText(t08Input)).toBe(
      "- Căn cứ Hợp đồng kinh tế số 0412/HĐKT2025/TP-VIETPANEL ký ngày 04/12/2025 giữa Công ty TNHH xây dựng Việt Panel và Công ty Cổ phần Tập đoàn Thiết bị xây dựng TP về việc cho thuê thiết bị xây dựng.",
    );
    expect(canCuText({ ...t08Input, contract: { ...t08Input.contract, canCuOverride: "- Căn cứ khác." } })).toBe("- Căn cứ khác.");
  });

  it("names the file like the hand-made ones", () => {
    expect(hsttFileName("2026-08", "Việt Panel")).toBe("HSTT T08.2026 - Việt Panel - TP.xlsx");
  });
});
