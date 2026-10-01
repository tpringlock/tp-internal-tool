import { describe, expect, it } from "vitest";
import { foldSearchText, matchesSearch, searchItems } from "./search";

const projects = [
  { kho: "VIETPANEL-01", name: "VIETPANEL HẢI DƯƠNG", customer: "CÔNG TY TNHH XÂY DỰNG VIỆT PANEL", no: "0412/HĐKT2025/TP-VIETPANEL" },
  { kho: "DUNGTEST", name: "DŨNG TEST", customer: "DŨNG TEST", no: "" },
  { kho: "HÀ MINH chothue", name: "Hà Minh", customer: "CÔNG TY HÀ MINH", no: "HM-01" },
  { kho: "INTECH - 1", name: "Intech Bắc Ninh", customer: "INTECH", no: "0099/HĐ" },
];
const fields = (p: (typeof projects)[number]) => [p.kho, p.name, p.customer, p.no];
const find = (q: string) => searchItems(projects, q, fields).map((p) => p.kho);

describe("foldSearchText", () => {
  it("strips Vietnamese accents, đ, case and extra spaces", () => {
    expect(foldSearchText("  CÔNG TY  Xây DỰNG Đức ")).toBe("cong ty xay dung duc");
    expect(foldSearchText("HĐKT")).toBe("hdkt");
    // NFD input (as some Excel files store it) folds the same way
    expect(foldSearchText("Việt".normalize("NFD"))).toBe("viet");
    expect(foldSearchText(null)).toBe("");
  });
});

describe("matchesSearch", () => {
  it("needs every word, in any field and any order", () => {
    expect(matchesSearch(["VIETPANEL-01", "VIETPANEL HẢI DƯƠNG"], "hai duong")).toBe(true);
    expect(matchesSearch(["VIETPANEL-01", "VIETPANEL HẢI DƯƠNG"], "duong vietpanel")).toBe(true);
    expect(matchesSearch(["VIETPANEL-01", "VIETPANEL HẢI DƯƠNG"], "hai phong")).toBe(false);
  });
  it("an empty query matches everything", () => {
    expect(matchesSearch(["x"], "   ")).toBe(true);
  });
});

describe("searchItems (project picker)", () => {
  it("finds by warehouse code, warehouse name, customer or contract number", () => {
    expect(find("vietpanel-01")).toEqual(["VIETPANEL-01"]);
    expect(find("hải dương")).toEqual(["VIETPANEL-01"]);
    expect(find("viet panel")).toEqual(["VIETPANEL-01"]);
    expect(find("0412")).toEqual(["VIETPANEL-01"]);
    expect(find("hdkt2025")).toEqual(["VIETPANEL-01"]);
    expect(find("dung")).toEqual(["DUNGTEST", "VIETPANEL-01"]); // DŨNG TEST, XÂY DỰNG
  });

  it("puts code matches first, then other prefix matches, keeping input order on ties", () => {
    expect(find("ha minh")).toEqual(["HÀ MINH chothue"]);
    expect(find("intech")).toEqual(["INTECH - 1"]);
    // "cong ty" only appears in customer names: original order
    expect(find("cong ty")).toEqual(["VIETPANEL-01", "HÀ MINH chothue"]);
  });

  it("returns everything (up to the limit) for an empty query", () => {
    expect(find("")).toEqual(projects.map((p) => p.kho));
    expect(searchItems(projects, "", fields, 2)).toHaveLength(2);
  });
});
