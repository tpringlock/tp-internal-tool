import { describe, expect, it } from "vitest";
import type { MisaCatalog } from "./misa-catalog";
import { buildPriceTable, hasMisaIssue } from "./price-table";

const contracts = [
  { id: "vp", misa_kho: "VIETPANEL-01", misa_kho_name: "VIETPANEL HẢI DƯƠNG", contract_no: "0412/HĐKT2025", customer_name: "VIỆT PANEL" },
  { id: "hm", misa_kho: "HÀ MINH chothue", misa_kho_name: "", contract_no: "HM-01", customer_name: "CÔNG TY HÀ MINH" },
];
const line = (contract_id: string, ma_vt: string, ten_vt: string, dvt: string, sort_order: number, unit_price = 10) => ({
  id: `${contract_id}-${ma_vt}`,
  contract_id,
  ma_vt,
  ten_vt,
  dvt,
  unit_price,
  print_name: null,
  print_dvt: null,
  note: "",
  sort_order,
});
const lines = [
  line("vp", "VT0021", "Giáo ringlock 1.0m Kẽm", "cây", 2),
  line("vp", "VT0008", "Giằng 0.6", "Cái", 1),
  line("hm", "VT0021", "", "", 1),
  line("demo", "VT0021", "x", "x", 1), // contract not listed (demo): dropped
];
const catalog: MisaCatalog = {
  warehouses: { "VIETPANEL-01": "VIETPANEL HẢI DƯƠNG" },
  items: {
    VT0021: { name: "Giáo ringlock 1.0m Kẽm", dvt: "cây" },
    VT0008: { name: "Giằng ngang ringlock 0.6m", dvt: "cây" },
  },
  pairs: [],
};

describe("price table (page + export)", () => {
  it("joins contract columns, sorts by warehouse then table order, drops unknown contracts", () => {
    const rows = buildPriceTable(contracts, lines, null);
    expect(rows.map((r) => `${r.misa_kho}/${r.ma_vt}`)).toEqual(["HÀ MINH chothue/VT0021", "VIETPANEL-01/VT0008", "VIETPANEL-01/VT0021"]);
    expect(rows[1]).toMatchObject({ customer_name: "VIỆT PANEL", contract_no: "0412/HĐKT2025" });
    expect(rows.some(hasMisaIssue)).toBe(false); // no catalog: no flags
  });

  it("flags MISA differences: warehouse missing, name / unit differing", () => {
    const rows = buildPriceTable(contracts, lines, catalog);
    const get = (k: string, m: string) => rows.find((r) => r.misa_kho === k && r.ma_vt === m)!;
    expect(get("VIETPANEL-01", "VT0021")).toMatchObject({ khoNotInMisa: false, codeNotInMisa: false, misaName: null, misaDvt: null });
    expect(get("VIETPANEL-01", "VT0008")).toMatchObject({ misaName: "Giằng ngang ringlock 0.6m", misaDvt: "cây" });
    expect(get("HÀ MINH chothue", "VT0021")).toMatchObject({ khoNotInMisa: true, misaName: "Giáo ringlock 1.0m Kẽm" });
  });

  it("filters by contract, by MISA issue and by accent-insensitive words", () => {
    expect(buildPriceTable(contracts, lines, catalog, { contract: "hm" })).toHaveLength(1);
    expect(buildPriceTable(contracts, lines, catalog, { issues: true }).map((r) => r.ma_vt)).toEqual(["VT0021", "VT0008"]);
    expect(buildPriceTable(contracts, lines, catalog, { q: "ha minh" }).map((r) => r.contract_id)).toEqual(["hm"]);
    expect(buildPriceTable(contracts, lines, catalog, { q: "giang" }).map((r) => r.ma_vt)).toEqual(["VT0008"]);
    expect(buildPriceTable(contracts, lines, catalog, { q: "viet panel vt0021" })).toHaveLength(1);
  });
});
