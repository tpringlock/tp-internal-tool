import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { vietpanelSenci } from "./contracts/vietpanel-senci";
import { buildMisaCatalog } from "./misa-catalog";
import { parseMisaLedger } from "./misa-parser";
import {
  buildImportPayload,
  contractCodeForKho,
  parseUnitPrice,
  readPriceSheet,
  validatePriceImport,
  type ExistingPriceContract,
  type PriceImportContext,
  type PriceImportPreview,
} from "./price-import";
import { flattenContractConfig, groupPriceLines } from "./price-lines";

// Parses real MISA / Excel files, which is slow on a busy machine: this file
// gets its own timeout instead of raising the global one.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** An xlsx with a DON_GIA sheet: first row = headers. */
async function xlsx(rows: unknown[][], sheet = "DON_GIA"): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("HUONG_DAN").getCell("A1").value = "hướng dẫn";
  const ws = wb.addWorksheet(sheet);
  rows.forEach((r, i) => ws.getRow(i + 1).values = r as ExcelJS.CellValue[]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const THREE = ["Mã kho", "Mã VT", "Đơn giá thuê/ngày (đ)"];

/** Viet Panel as the 0037 cutover leaves it: old names/units in print_name / print_dvt. */
function vpExisting(): ExistingPriceContract {
  return {
    id: "vp",
    code: "vietpanel-senci",
    misa_kho: "VIETPANEL-01",
    misa_kho_name: "",
    contract_no: vietpanelSenci.contractNo,
    customer_name: vietpanelSenci.customerName,
    lines: flattenContractConfig(vietpanelSenci).map((l) => ({ ...l, note: l.unit_price === 0 ? "Không tính tiền" : "" })),
  };
}

async function preview(rows: unknown[][], ctx: Partial<PriceImportContext> = {}): Promise<PriceImportPreview> {
  return validatePriceImport(await readPriceSheet(await xlsx(rows)), {
    mode: "upsert",
    existing: [vpExisting()],
    catalog: null,
    ...ctx,
  });
}

const errorsOf = (p: PriceImportPreview) => p.issues.filter((i) => i.level === "error");
const warningsOf = (p: PriceImportPreview) => p.issues.filter((i) => i.level === "warning");
const lineOf = (p: PriceImportPreview, ma: string) => p.contracts.flatMap((c) => c.lines).find((l) => l.maVt === ma)!;

const juneCatalog = parseMisaLedger(
  readFileSync(new URL("./__fixtures__/misa-2026-06-16cot.xlsx", import.meta.url)),
).then(buildMisaCatalog);

// ---------------------------------------------------------------------------

describe("parseUnitPrice", () => {
  it("accepts whole VND >= 0 (number or digits)", () => {
    expect(parseUnitPrice(85)).toEqual({ ok: true, value: 85 });
    expect(parseUnitPrice(0)).toEqual({ ok: true, value: 0 });
    expect(parseUnitPrice(" 1500 ")).toEqual({ ok: true, value: 1500 });
  });
  it("refuses empty, negative, fractional, separators and text, with a reason", () => {
    const e = (v: unknown) => {
      const r = parseUnitPrice(v);
      return r.ok ? "ok" : r.error;
    };
    expect(e(null)).toMatch(/Thiếu đơn giá/);
    expect(e("")).toMatch(/Thiếu đơn giá/);
    expect(e(-5)).toMatch(/âm/);
    expect(e("-5")).toMatch(/âm/);
    expect(e(70.5)).toMatch(/phần lẻ/);
    expect(e("1.500")).toMatch(/không gõ dấu chấm\/phẩy/);
    expect(e("1,5")).toMatch(/không gõ dấu chấm\/phẩy/);
    expect(e("85đ")).toMatch(/không phải là số/);
    expect(e(true)).toMatch(/không phải là số/);
    expect(e(3_000_000_000)).toMatch(/quá lớn/);
  });
});

describe("file-level errors", () => {
  it("not an xlsx", async () => {
    const s = await readPriceSheet(Buffer.from("not a zip"));
    expect(s.errors[0]).toMatch(/Không đọc được file/);
  });

  it("no DON_GIA sheet", async () => {
    const s = await readPriceSheet(await xlsx([THREE, ["K", "A", 1]], "Sheet1"));
    expect(s.errors[0]).toMatch(/Không tìm thấy sheet "DON_GIA"/);
    const p = validatePriceImport(s, { mode: "upsert", existing: [], catalog: null });
    expect(p.canImport).toBe(false);
  });

  it("missing a required column", async () => {
    const p = await preview([["Mã kho", "Mã VT", "Tên VT"], ["VIETPANEL-01", "VT0021", "x"]]);
    expect(errorsOf(p).map((i) => i.message)).toEqual(["Thiếu cột bắt buộc: Đơn giá thuê/ngày (đ)."]);
    expect(p.canImport).toBe(false);
    expect(p.contracts).toEqual([]);
  });

  it("a column twice, unknown columns, no data rows", async () => {
    const s = await readPriceSheet(await xlsx([[...THREE, "Mã VT"], ["K", "A", 1, "B"]]));
    expect(s.errors[0]).toMatch(/Cột "Mã VT" xuất hiện 2 lần/);
    const p = await preview([[...THREE, "Màu sắc"], ["VIETPANEL-01", "VT0021", 85, "đỏ"]]);
    expect(warningsOf(p).map((i) => i.message)).toContainEqual(expect.stringMatching(/Bỏ qua các cột không có trong mẫu: Màu sắc/));
    expect(p.canImport).toBe(true);
    const empty = await preview([THREE]);
    expect(errorsOf(empty)[0].message).toMatch(/không có dòng dữ liệu/);
  });

  it("accepts header spellings with different case/spacing", async () => {
    const p = await preview([["mã kho", "MÃ  VT", "Đơn giá"], ["VIETPANEL-01", "VT0021", 90]]);
    expect(p.columns).toEqual(["misa_kho", "ma_vt", "unit_price"]);
    expect(p.canImport).toBe(true);
  });
});

describe("row errors (block the import)", () => {
  it("empty codes and bad prices, each on its row", async () => {
    const p = await preview([
      THREE,
      ["", "VT0021", 85],
      ["VIETPANEL-01", "  ", 85],
      ["VIETPANEL-01", "VT0020", -1],
      ["VIETPANEL-01", "VT0023", 1.5],
      ["VIETPANEL-01", "VT0022", "1.000"],
      ["VIETPANEL-01", "VT0090", "abc"],
      ["VIETPANEL-01", "VT0008", null],
    ]);
    expect(errorsOf(p).map((i) => [i.row, i.column])).toEqual([
      [2, "misa_kho"],
      [3, "ma_vt"],
      [4, "unit_price"],
      [5, "unit_price"],
      [6, "unit_price"],
      [7, "unit_price"],
      [8, "unit_price"],
    ]);
    expect(p.canImport).toBe(false);
  });

  it("duplicate (warehouse, code), also when only spaces differ", async () => {
    const p = await preview([
      THREE,
      ["VIETPANEL-01", "VT0021", 85],
      ["VIETPANEL-01", "VT0020", 125],
      [" VIETPANEL-01 ", " VT0021", 90],
      ["OTHER", "VT0021", 85], // same code in another warehouse is fine
    ], { existing: [vpExisting(), { ...vpExisting(), id: "o", code: "other", misa_kho: "OTHER", lines: [] }] });
    expect(errorsOf(p).map((i) => [i.row, i.message])).toEqual([
      [2, 'Trùng Mã kho "VIETPANEL-01" + Mã VT "VT0021" với dòng 4.'],
      [4, 'Trùng Mã kho "VIETPANEL-01" + Mã VT "VT0021" với dòng 2.'],
    ]);
  });

  it("one warehouse with two contract numbers (or customers)", async () => {
    const p = await preview([
      ["Mã kho", "Số hợp đồng", "Khách hàng", "Mã VT", "Đơn giá"],
      ["VIETPANEL-01", "HĐ-1", "VP", "VT0021", 85],
      ["VIETPANEL-01", "HĐ-2", "VP", "VT0020", 125],
      ["VIETPANEL-01", "", "VP", "VT0023", 159], // empty cell: not a third number
    ]);
    const msgs = errorsOf(p);
    expect(msgs).toHaveLength(3);
    expect(msgs[0].message).toMatch(/nhiều Số hợp đồng khác nhau: "HĐ-1" \(dòng 2\), "HĐ-2" \(dòng 3\)/);
  });

  it("Số HĐ / Khách hàng differing only in case or spaces: not an error, first row kept, warned", async () => {
    const p = await preview([
      ["Mã kho", "Số hợp đồng", "Khách hàng", "Mã VT", "Đơn giá"],
      ["VIETPANEL-01", "0412/HĐKT2025/TP-VIETPANEL", "Công ty TNHH Xây dựng Việt Panel", "VT0021", 85],
      ["VIETPANEL-01", "0412/hđkt2025/tp-vietpanel ", "CÔNG TY TNHH  XÂY DỰNG VIỆT PANEL", "VT0020", 125],
    ]);
    expect(errorsOf(p)).toEqual([]);
    expect(p.contracts[0].header).toMatchObject({
      contract_no: "0412/HĐKT2025/TP-VIETPANEL",
      customer_name: "Công ty TNHH Xây dựng Việt Panel",
    });
    const w = warningsOf(p).filter((i) => i.column === "contract_no" || i.column === "customer_name");
    expect(w.map((i) => [i.row, i.column])).toEqual([
      [3, "contract_no"],
      [3, "customer_name"],
    ]);
    expect(w[1].message).toBe(
      'Kho "VIETPANEL-01": Khách hàng ghi khác nhau về chữ hoa/thường hoặc khoảng trắng: ' +
        '"Công ty TNHH Xây dựng Việt Panel" (dòng 2), "CÔNG TY TNHH XÂY DỰNG VIỆT PANEL" (dòng 3). Lưu theo dòng 2.',
    );
    // the stored customer changes case -> counted as a contract update, shown old -> new
    expect(p.contracts[0].headerChanges.map((c) => c.field)).toEqual(["customer_name"]);
  });

  it("a new warehouse needs a contract number and a customer", async () => {
    const p = await preview([THREE, ["NEW-1", "VT0001", 10]], { existing: [] });
    expect(errorsOf(p)[0].message).toBe('Kho mới "NEW-1" (chưa có trên hệ thống) cần Số hợp đồng và Khách hàng.');
    const ok = await preview(
      [["Mã kho", "Số hợp đồng", "Khách hàng", "Mã VT", "Đơn giá"], ["NEW-1", "HĐ-9", "KH", "VT0001", 10]],
      { existing: [], takenCodes: ["new-1"] },
    );
    expect(ok.canImport).toBe(true);
    expect(ok.contracts[0]).toMatchObject({ isNew: true, code: "new-1-2" });
    expect(ok.counts).toMatchObject({ contracts_created: 1, lines_inserted: 1 });
  });

  it("rows that would print as one HSTT line must share price and unit", async () => {
    const p = await preview([
      ["Mã kho", "Mã VT", "Đơn giá", "Tên in trên HSTT"],
      ["VIETPANEL-01", "VT0090", 190, "Giáo ringlock 2.5m Kẽm"], // VT0022 stays 185 in the table
    ]);
    expect(errorsOf(p)[0]).toMatchObject({ row: 2, column: "unit_price" });
    expect(errorsOf(p)[0].message).toBe(
      "VT0022 và VT0090 đang in chung dòng 'Giáo ringlock 2.5m Kẽm'. Muốn đổi giá: đổi cả hai mã, " +
        "hoặc đổi/xóa 'Tên in trên HSTT' của VT0090 để tách thành dòng riêng. (Hiện tại: VT0022 185đ, VT0090 190đ.)",
    );
  });
});

describe("MISA cross-check (warnings only, never blocking)", () => {
  it("code not in the MISA catalog, warehouse not in MISA, name / unit mismatch", async () => {
    const p = await preview([
      ["Mã kho", "Tên kho", "Mã VT", "Tên VT", "ĐVT", "Đơn giá"],
      ["VIETPANEL-01", "VIETPANEL HD", "VT0021", "Giáo ringlock 1.0m Kẽm", "cây", 85],
      ["VIETPANEL-01", "VIETPANEL HD", "ZZ9999", "Mã lạ", "cái", 10],
      ["VIETPANEL-01", "VIETPANEL HD", "VT0008", "Giằng 0.6", "Cái", 43],
    ], { catalog: await juneCatalog });
    expect(errorsOf(p)).toEqual([]);
    expect(p.canImport).toBe(true);
    expect(warningsOf(p).map((i) => [i.row, i.column])).toEqual([
      [2, "misa_kho_name"],
      [3, "ma_vt"],
      [4, "ten_vt"],
      [4, "dvt"],
    ]);
    expect(warningsOf(p)[1].message).toBe('Mã VT "ZZ9999" không có trong danh mục MISA (các file tháng đã tải).');
    expect(warningsOf(p)[2].message).toBe('Tên VT "Giằng 0.6" khác MISA: "Giằng ngang ringlock 0.6m".');
    expect(warningsOf(p)[3].message).toBe('ĐVT "Cái" khác MISA: "cây".');
  });

  it("warehouse missing from MISA, and no month file at all", async () => {
    const p = await preview(
      [["Mã kho", "Số hợp đồng", "Khách hàng", "Mã VT", "Đơn giá"], ["KHO-MOI", "HĐ", "KH", "VT0021", 85]],
      { catalog: await juneCatalog },
    );
    expect(warningsOf(p).map((i) => i.message)).toEqual(['Mã kho "KHO-MOI" không có trong các file MISA tháng đã tải.']);
    const none = await preview([THREE, ["VIETPANEL-01", "VT0021", 85]]);
    expect(warningsOf(none)[0].message).toMatch(/Chưa có file nguồn MISA theo tháng nào/);
  });

  it("the real template matches MISA June: no error, no warning", async () => {
    const sheet = await readPriceSheet(readFileSync(new URL("../../docs/mau-nhap-don-gia.xlsx", import.meta.url)));
    const p = validatePriceImport(sheet, { mode: "upsert", existing: [], catalog: await juneCatalog });
    expect(p.issues).toEqual([]);
    expect(p.counts).toMatchObject({ contracts_created: 1, lines_inserted: 16 });
  });
});

describe("missing column vs empty cell", () => {
  it("a file with only Mã kho, Mã VT, Đơn giá keeps print_name / print_dvt and everything else", async () => {
    // both "Kích U" codes print as one HSTT line, so both get the new price
    const p = await preview([
      THREE,
      ["VIETPANEL-01", "VT0053", 75],
      ["VIETPANEL-01", "VT0067", 75],
      ["VIETPANEL-01", "VT0021", 85],
    ]);
    expect(p.canImport).toBe(true);
    expect(p.counts).toEqual({
      contracts_created: 0,
      contracts_updated: 0,
      lines_inserted: 0,
      lines_updated: 2,
      lines_deleted: 0,
      lines_unchanged: 1,
    });
    const kich = lineOf(p, "VT0053");
    expect(kich.changes).toEqual([{ field: "unit_price", old: 70, new: 75, cleared: false }]);
    expect(kich.values).toMatchObject({ print_name: "Kích U Ø38*(3,0ly - 4,5ly), L=600mm", print_dvt: "Cái" });
    // the RPC payload carries no key for absent columns -> the RPC keeps them
    const pl = p.payloadContracts[0];
    expect(Object.keys(pl).sort()).toEqual(["code", "lines", "misa_kho"]);
    expect(pl.lines[0]).toEqual({ ma_vt: "VT0053", unit_price: 75, sort_order: 8001 });
  });

  it("changing the price of only one code of a merged HSTT line is blocked, and says how to fix it", async () => {
    const p = await preview([THREE, ["VIETPANEL-01", "VT0053", 75]]);
    expect(p.canImport).toBe(false);
    expect(errorsOf(p)).toHaveLength(1);
    expect(errorsOf(p)[0]).toMatchObject({ row: 2, column: "unit_price" });
    expect(errorsOf(p)[0].message).toBe(
      "VT0053 và VT0067 đang in chung dòng 'Kích U Ø38*(3,0ly - 4,5ly), L=600mm'. Muốn đổi giá: đổi cả hai mã, " +
        "hoặc đổi/xóa 'Tên in trên HSTT' của VT0053 để tách thành dòng riêng. (Hiện tại: VT0053 75đ, VT0067 70đ.)",
    );
  });

  it("…and the two fixes the message suggests both work", async () => {
    // a) change both codes
    const both = await preview([THREE, ["VIETPANEL-01", "VT0053", 75], ["VIETPANEL-01", "VT0067", 75]]);
    expect(both.canImport).toBe(true);
    // b) give VT0053 its own print name -> separate HSTT line
    const split = await preview([
      ["Mã kho", "Mã VT", "Đơn giá", "Tên in trên HSTT"],
      ["VIETPANEL-01", "VT0053", 75, "Kích U Ø38 Eku To"],
    ]);
    expect(split.canImport).toBe(true);
  });

  it("a unit conflict and a group made by the MISA name get the matching advice", async () => {
    const existing = vpExisting();
    existing.lines.push(
      { ma_vt: "X1", ten_vt: "Ống", dvt: "cây", unit_price: 9, print_name: null, print_dvt: null, sort_order: 1, note: "" },
      { ma_vt: "X2", ten_vt: "Ống", dvt: "cây", unit_price: 9, print_name: null, print_dvt: null, sort_order: 2, note: "" },
    );
    const p = await preview([["Mã kho", "Mã VT", "Đơn giá", "ĐVT in trên HSTT"], ["VIETPANEL-01", "X2", 9, "Bộ"]], {
      existing: [existing],
    });
    expect(errorsOf(p)[0]).toMatchObject({ row: 2, column: "print_dvt" });
    expect(errorsOf(p)[0].message).toBe(
      "X1 và X2 đang in chung dòng 'Ống'. Muốn đổi ĐVT in: đổi cả hai mã, " +
        "hoặc đặt 'Tên in trên HSTT' khác cho X2 để tách thành dòng riêng. (Hiện tại: X1 cây, X2 Bộ.)",
    );
  });

  it("a column present with an empty cell clears the value (shown as cleared)", async () => {
    const p = await preview([
      ["Mã kho", "Mã VT", "Đơn giá", "ĐVT in trên HSTT", "Số hợp đồng"],
      ["VIETPANEL-01", "VT0053", 70, "", ""],
    ]);
    const kich = lineOf(p, "VT0053");
    expect(kich.changes).toEqual([{ field: "print_dvt", old: "Cái", new: null, cleared: true }]);
    expect(kich.values.print_name).toBe("Kích U Ø38*(3,0ly - 4,5ly), L=600mm"); // column absent: kept
    expect(p.contracts[0].headerChanges).toEqual([
      { field: "contract_no", old: vietpanelSenci.contractNo, new: "", cleared: true },
    ]);
    expect(p.payloadContracts[0].lines[0]).toMatchObject({ print_dvt: "" });
    expect(p.payloadContracts[0].contract_no).toBe("");
  });
});

describe("modes and payload", () => {
  it("upsert never deletes; replace deletes the warehouse's rows missing from the file", async () => {
    const rows = [THREE, ["VIETPANEL-01", "VT0021", 85], ["VIETPANEL-01", "VT9999", 5]];
    const up = await preview(rows);
    expect(up.counts).toMatchObject({ lines_inserted: 1, lines_unchanged: 1, lines_deleted: 0 });
    expect(up.payloadContracts[0].lines.find((l) => l.ma_vt === "VT9999")!.sort_order).toBe(999003); // after the last row

    const other: ExistingPriceContract = { ...vpExisting(), id: "o", code: "o", misa_kho: "OTHER" };
    const rep = await preview(rows, { mode: "replace", existing: [vpExisting(), other] });
    expect(rep.counts).toMatchObject({ lines_inserted: 1, lines_unchanged: 1, lines_deleted: 15 });
    const deleted = rep.contracts[0].lines.filter((l) => l.op === "delete").map((l) => l.maVt);
    expect(deleted).toHaveLength(15);
    expect(deleted).not.toContain("VT0021");
    expect(rep.contracts.map((c) => c.misaKho)).toEqual(["VIETPANEL-01"]); // OTHER untouched
    expect(rep.payloadContracts[0].lines.map((l) => l.sort_order)).toEqual([1, 2]);
  });

  it("importing the template into the cutover state: MISA names filled in, HSTT unchanged", async () => {
    const sheet = await readPriceSheet(readFileSync(new URL("../../docs/mau-nhap-don-gia.xlsx", import.meta.url)));
    const p = validatePriceImport(sheet, { mode: "replace", existing: [vpExisting()], catalog: await juneCatalog });
    expect(p.errorCount).toBe(0);
    expect(p.counts).toMatchObject({ contracts_updated: 1, lines_updated: 16, lines_deleted: 0 });
    const finalLines = p.contracts[0].lines.map((l, i) => ({ ma_vt: l.maVt, ...l.values, sort_order: i + 1 }));
    const g = groupPriceLines(finalLines);
    expect(g.items).toEqual(vietpanelSenci.items);
    expect(g.excluded).toEqual(vietpanelSenci.excludedMaHang);
  });

  it("buildImportPayload: expected counts, warnings as text, refuses a file with errors", async () => {
    const p = await preview([THREE, ["VIETPANEL-01", "VT0021", 90]]);
    const payload = buildImportPayload(p, { file_name: "dg.xlsx", size_bytes: 10, sha256: "s", storage_path: "price-imports/x.xlsx" });
    expect(payload).toMatchObject({
      mode: "upsert",
      file: { file_name: "dg.xlsx", row_count: 1 },
      columns: ["misa_kho", "ma_vt", "unit_price"],
      expected: p.counts,
    });
    expect(payload.warnings[0]).toMatch(/Chưa có file nguồn MISA/);
    const bad = await preview([THREE, ["VIETPANEL-01", "VT0021", -1]]);
    expect(() => buildImportPayload(bad, { file_name: "x", size_bytes: 1, sha256: "s", storage_path: "p" })).toThrow();
  });

  it("contract codes for new warehouses are readable and unique", () => {
    const taken = new Set(["ha-minh-chothue"]);
    expect(contractCodeForKho("HÀ MINH chothue", taken)).toBe("ha-minh-chothue-2");
    expect(contractCodeForKho("319.5 - 1", taken)).toBe("319-5-1");
    expect(contractCodeForKho("***", taken)).toBe("kho");
  });
});
