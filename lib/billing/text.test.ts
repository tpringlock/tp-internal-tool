import { describe, expect, it } from "vitest";
import { normalizeCode as parserNormalizeCode } from "./misa-parser";
import { cleanText, normalizeCode, sameText } from "./text";

describe("billing text helpers", () => {
  it("normalizeCode is identical to the parser's", () => {
    for (const s of ["INTECH  - 1", "  VT0021 ", "319.5 - 1", "HÀ MINH\tchothue", "", "A\n B"]) {
      expect(normalizeCode(s)).toBe(parserNormalizeCode(s));
    }
  });

  it("cleanText trims, collapses spaces and composes NFD", () => {
    expect(cleanText("  Giáo  ringlock ")).toBe("Giáo ringlock");
    expect(cleanText("Kích".normalize("NFD"))).toBe("Kích".normalize("NFC"));
    expect(cleanText(null)).toBe("");
  });

  it("sameText ignores case and spacing", () => {
    expect(sameText("cây", "Cây")).toBe(true);
    expect(sameText("Giằng ngang  ringlock 0.6m", "giằng ngang ringlock 0.6m")).toBe(true);
    expect(sameText("cây", "cái")).toBe(false);
  });
});
