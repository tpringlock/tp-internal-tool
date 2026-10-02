import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseMisaLedger } from "./misa-parser";
import { buildMisaCatalog, mergeMisaCatalogs, pairKey } from "./misa-catalog";

// Parses real MISA / Excel files, which is slow on a busy machine: this file
// gets its own timeout instead of raising the global one.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const load = (f: string) => parseMisaLedger(readFileSync(new URL(`./__fixtures__/${f}`, import.meta.url)));

describe("MISA catalog from a month file", () => {
  it("reads warehouse names, item names/units and active pairs (June, 16 columns)", async () => {
    const c = buildMisaCatalog(await load("misa-2026-06-16cot.xlsx"));
    expect(Object.keys(c.warehouses)).toHaveLength(209);
    expect(c.warehouses["VIETPANEL-01"]).toBe("VIETPANEL HẢI DƯƠNG");
    expect(c.items["VT0008"]).toEqual({ name: "Giằng ngang ringlock 0.6m", dvt: "cây" });
    expect(c.items["CCDC272"]).toEqual({ name: "Cùm xoay (khóa giáo)", dvt: "Cái" });
    expect(c.items["VT0091"].name).toBe("Giằng ngang ringlock 1.2m mạ kẽm nhúng nóng 2.75mm");
    expect(c.items["VT0091"].dvt).toBe(""); // MISA has no unit for it
    expect(c.pairs).toContain(pairKey("VIETPANEL-01", "VT0022"));
    expect([...c.pairs].sort()).toEqual(c.pairs);
    expect(new Set(c.pairs).size).toBe(c.pairs.length);
  });

  it("a pair with zero opening and no movement is not listed", () => {
    const c = buildMisaCatalog({
      warehouses: { K: "Kho K" },
      openings: [
        { kho: "K", khoName: "Kho K", maHang: "A", tenHang: "a", dvt: "cái", qty: 0 },
        { kho: "K", khoName: "Kho K", maHang: "B", tenHang: "b", dvt: "cái", qty: 5 },
      ],
      movements: [{ kho: "K", maHang: "C", tenHang: "c", date: "2026-09-02", soCt: "X", dienGiai: "", nhap: 1, xuat: 0, sourceRow: 9 }],
    });
    expect(c.pairs).toEqual(["K|B", "K|C"]);
    expect(c.items).toEqual({ A: { name: "a", dvt: "cái" }, B: { name: "b", dvt: "cái" }, C: { name: "c", dvt: "" } });
  });

  it("merging months: newest name wins, a missing unit is kept from older months, pairs are united", async () => {
    const jun = buildMisaCatalog(await load("misa-2026-06-16cot.xlsx"));
    const sep = buildMisaCatalog(await load("misa-2026-09-13cot.xlsx"));
    const m = mergeMisaCatalogs([jun, sep]);
    expect(Object.keys(m.warehouses).length).toBeGreaterThanOrEqual(216);
    expect(m.pairs.length).toBeGreaterThanOrEqual(Math.max(jun.pairs.length, sep.pairs.length));

    const older = { warehouses: { K: "Tên cũ" }, items: { A: { name: "A cũ", dvt: "cái" } }, pairs: ["K|A"] };
    const newer = { warehouses: { K: "Tên mới" }, items: { A: { name: "A mới", dvt: "" } }, pairs: ["K|B"] };
    expect(mergeMisaCatalogs([older, newer])).toEqual({
      warehouses: { K: "Tên mới" },
      items: { A: { name: "A mới", dvt: "cái" } },
      pairs: ["K|A", "K|B"],
    });
  });
});
