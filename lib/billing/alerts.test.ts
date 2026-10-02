import { describe, expect, it } from "vitest";
import { buildAlerts, countAlerts, type AlertContract } from "./alerts";
import type { MisaCatalog } from "./misa-catalog";
import type { Ledger, LedgerMovement, LedgerOpening } from "./types";

const period = { from: "2026-08-26", to: "2026-09-25" };

const open = (kho: string, maHang: string, qty: number): LedgerOpening => ({
  kho,
  khoName: kho,
  maHang,
  tenHang: `Tên ${maHang}`,
  dvt: "Cái",
  qty,
});
let row = 0;
const mov = (kho: string, maHang: string, date: string, nhap: number, xuat: number, soCt: string): LedgerMovement => ({
  kho,
  maHang,
  tenHang: `Tên ${maHang}`,
  date,
  soCt,
  dienGiai: "",
  nhap,
  xuat,
  sourceRow: ++row,
});

const ledger: Ledger = {
  from: "2026-08-01",
  to: "2026-09-30",
  layout: "13-cot",
  warehouses: { "VP-01": "VIỆT PANEL", "NEW-01": "Dự án mới", "TP/PHÚ THỌ": "Kho tổng", "DEMO-01": "Demo" },
  openings: [open("VP-01", "VT1", 10), open("VP-01", "VT2", 5), open("TP/PHÚ THỌ", "VT1", -3), open("DEMO-01", "VT1", 4)],
  movements: [
    // VT1 at VP-01: 10 -> 2 (27/08) -> -4 (29/08, two vouchers out) -> 6 (01/09)
    mov("VP-01", "VT1", "2026-08-27", 0, 8, "PX01"),
    mov("VP-01", "VT1", "2026-08-29", 0, 3, "PX03"),
    mov("VP-01", "VT1", "2026-08-29", 0, 3, "PX02"),
    mov("VP-01", "VT1", "2026-08-29", 0, 0, "PN-same-day"),
    mov("VP-01", "VT1", "2026-09-01", 10, 0, "PN01"),
    // Same-day in then out never goes negative at the end of the day.
    mov("VP-01", "VT2", "2026-09-02", 0, 5, "PX10"),
    mov("VP-01", "VT2", "2026-09-02", 2, 0, "PN10"),
    // VT9 has no price row.
    mov("VP-01", "VT9", "2026-09-03", 1, 0, "PN11"),
    // After the period end: ignored.
    mov("VP-01", "VT2", "2026-09-28", 0, 50, "PX99"),
    mov("NEW-01", "VT1", "2026-09-05", 4, 0, "PN20"),
  ],
  warnings: [],
};

const line = (contract_id: string, ma_vt: string, ten_vt = `Tên ${ma_vt}`, dvt = "Cái") => ({
  id: `${contract_id}-${ma_vt}`,
  contract_id,
  ma_vt,
  ten_vt,
  dvt,
  unit_price: 100,
  print_name: null,
  print_dvt: null,
  note: "",
  sort_order: 0,
});
const contract = (id: string, kho: string, isDemo = false, misa_kho_name = ""): AlertContract["contract"] => ({
  id,
  misa_kho: kho,
  misa_kho_name,
  contract_no: "",
  customer_name: id,
  is_demo: isDemo,
});

const vp: AlertContract = {
  contract: contract("vp", "VP-01", false, "VIET PANEL CU"),
  label: "Việt Panel",
  lines: [line("vp", "VT1"), line("vp", "VT2", "Tên khác", "Bộ"), line("vp", "OLD-CODE")],
};
const demo: AlertContract = { contract: contract("demo", "DEMO-01", true), label: "[GIẢ ĐỊNH] Demo", lines: [line("demo", "VT1")] };
const gone: AlertContract = { contract: contract("gone", "GONE-01"), label: "Kho cũ", lines: [] };

const catalog: MisaCatalog = {
  warehouses: { "VP-01": "VIỆT PANEL", "NEW-01": "Dự án mới", "TP/PHÚ THỌ": "Kho tổng", "DEMO-01": "Demo" },
  items: { VT1: { name: "Tên VT1", dvt: "Cái" }, VT2: { name: "Tên VT2", dvt: "Cái" }, VT9: { name: "Tên VT9", dvt: "Cái" } },
  pairs: [],
};

describe("buildAlerts", () => {
  const alerts = buildAlerts({ ledger, period, contracts: [vp, gone], catalog });
  const of = (kind: string) => alerts.filter((a) => a.kind === kind);

  it("negative stock: first negative day, the vouchers taking stock out, the lowest balance", () => {
    const neg = of("negative_stock");
    const vt1 = neg.find((a) => a.kho === "VP-01" && a.maVt === "VT1")!;
    expect(vt1).toMatchObject({ date: "2026-08-29", balance: -4, refs: ["PX02", "PX03"], company: null, contractId: "vp" });
    expect(vt1.message).toMatch(/29\/08\/2026.*PX02, PX03.*-4/);
    // End-of-day balance: VT2 never negative within the period; after the period is ignored.
    expect(neg.some((a) => a.maVt === "VT2")).toBe(false);
  });

  it("negative stock in a company warehouse is flagged as company, from the period start", () => {
    const tp = of("negative_stock").find((a) => a.kho === "TP/PHÚ THỌ")!;
    expect(tp.company).toMatch(/Kho tổng/);
    expect(tp).toMatchObject({ date: period.from, balance: -3, refs: [] });
    expect(tp.message).toMatch(/đầu kỳ/);
    // Project warehouses sort before company ones within a kind.
    expect(of("negative_stock").at(-1)!.kho).toBe("TP/PHÚ THỌ");
  });

  it("missing price: codes with activity and no price row, like the engine", () => {
    expect(of("missing_price").map((a) => [a.kho, a.maVt])).toEqual([["VP-01", "VT9"]]);
  });

  it("no contract: active warehouses without one; company warehouses skipped; demo only counts when passed", () => {
    expect(of("no_contract").map((a) => a.kho)).toEqual(["DEMO-01", "NEW-01"]);
    const withDemo = buildAlerts({ ledger, period, contracts: [vp, demo], catalog });
    expect(withDemo.filter((a) => a.kind === "no_contract").map((a) => a.kho)).toEqual(["NEW-01"]);
  });

  it("not in MISA: a contract warehouse or a priced code missing from every active month file", () => {
    expect(of("not_in_misa").map((a) => [a.kho, a.maVt])).toEqual([
      ["GONE-01", null],
      ["VP-01", "OLD-CODE"],
    ]);
  });

  it("name mismatch: item name / unit and the contract's warehouse name vs MISA", () => {
    const mm = of("name_mismatch");
    expect(mm.map((a) => a.maVt)).toEqual([null, "VT2"]);
    expect(mm[0].message).toMatch(/VIET PANEL CU.*VIỆT PANEL/);
    expect(mm[1].message).toMatch(/tên "Tên khác" ≠ MISA "Tên VT2".*ĐVT "Bộ" ≠ MISA "Cái"/);
  });

  it("without a catalog only the ledger checks run", () => {
    const noCat = buildAlerts({ ledger, period, contracts: [vp], catalog: null });
    expect(countAlerts(noCat).not_in_misa + countAlerts(noCat).name_mismatch).toBe(0);
    expect(countAlerts(noCat).negative_stock).toBe(2);
  });
});

describe("filterAlerts + exportAlertsXlsx", async () => {
  const { filterAlerts } = await import("./alert-list");
  const { exportAlertsXlsx } = await import("./alerts-export");
  const ExcelJS = (await import("exceljs")).default;
  const alerts = buildAlerts({ ledger, period, contracts: [vp, gone], catalog });

  it("filters by kind, search and company warehouses", () => {
    expect(filterAlerts(alerts, { kind: "negative_stock" }).length).toBe(2);
    expect(filterAlerts(alerts, { kind: "negative_stock", company: false }).map((a) => a.kho)).toEqual(["VP-01"]);
    expect(filterAlerts(alerts, { q: "viet panel vt9" }).map((a) => a.kind)).toEqual(["missing_price"]);
  });

  it("exports one row per alert with the period and filter in the header", async () => {
    const buf = await exportAlertsXlsx({ alerts, period, files: ["Tháng 09/2026 · v1"], filter: "mọi loại" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Cảnh báo")!;
    const rows: unknown[][] = [];
    ws.eachRow((r) => {
      if (typeof r.getCell(1).value === "number") rows.push([r.getCell(2).value, r.getCell(3).value, r.getCell(11).value]);
    });
    expect(rows).toHaveLength(alerts.length);
    expect(rows[0]).toEqual(["Tồn âm", "VP-01", "PX02, PX03"]);
    expect(String(ws.getRow(2).getCell(1).value)).toMatch(/26\/08\/2026 – 25\/09\/2026/);
  });
});
