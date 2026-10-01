import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { amountInWords } from "./number-to-words";

const cases = JSON.parse(
  readFileSync(new URL("../../docs/hstt/bang-chu-cases.json", import.meta.url), "utf8"),
) as { so: number; chu: string }[];

// One case in the hand-made file lacks the space after a comma ("nghìn,bảy").
const normalize = (s: string) => s.replace(/,\s*/g, ", ").replace(/\s+/g, " ").trim();

describe("amountInWords", () => {
  it("has the 18 cases of the hand-made HSTT files", () => {
    expect(cases).toHaveLength(18);
  });

  it.each(cases.map((c) => [c.so, c.chu] as const))("%d", (so, chu) => {
    expect(amountInWords(so)).toBe(normalize(chu));
  });

  it("drops all-zero groups", () => {
    expect(amountInWords(1_000_000_000)).toBe("Một tỷ đồng./.");
    expect(amountInWords(2_000_500_000)).toBe("Hai tỷ, năm trăm nghìn đồng./.");
    expect(amountInWords(5_000)).toBe("Năm nghìn đồng./.");
  });

  it("reads the leading group without 'không trăm'", () => {
    expect(amountInWords(7)).toBe("Bảy đồng./.");
    expect(amountInWords(15)).toBe("Mười lăm đồng./.");
    expect(amountInWords(21)).toBe("Hai mươi mốt đồng./.");
    expect(amountInWords(11_000)).toBe("Mười một nghìn đồng./.");
  });

  it("uses mốt / tư / lăm only after 'mươi' (lăm also after 'mười' and 'linh')", () => {
    expect(amountInWords(101)).toBe("Một trăm linh một đồng./.");
    expect(amountInWords(104)).toBe("Một trăm linh bốn đồng./.");
    expect(amountInWords(105)).toBe("Một trăm linh lăm đồng./.");
    expect(amountInWords(111)).toBe("Một trăm mười một đồng./.");
    expect(amountInWords(114)).toBe("Một trăm mười bốn đồng./.");
    expect(amountInWords(131)).toBe("Một trăm ba mươi mốt đồng./.");
    expect(amountInWords(164)).toBe("Một trăm sáu mươi tư đồng./.");
    expect(amountInWords(110)).toBe("Một trăm mười đồng./.");
  });

  it("pads middle groups with 'không trăm'", () => {
    expect(amountInWords(1_000_001)).toBe("Một triệu, không trăm linh một đồng./.");
    expect(amountInWords(3_040_000)).toBe("Ba triệu, không trăm bốn mươi nghìn đồng./.");
  });

  it("reads thousands of billions", () => {
    expect(amountInWords(1_234_000_000_000)).toBe("Một nghìn, hai trăm ba mươi tư tỷ đồng./.");
  });

  it("handles zero and negatives", () => {
    expect(amountInWords(0)).toBe("Không đồng./.");
    expect(amountInWords(-1_500)).toBe("Âm một nghìn, năm trăm đồng./.");
  });

  it("rejects non-integers", () => {
    expect(() => amountInWords(1.5)).toThrow();
    expect(() => amountInWords(Number.NaN)).toThrow();
  });
});
