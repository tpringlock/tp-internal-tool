import { describe, expect, it } from "vitest";
import { generateProjectCode } from "./code";

describe("generateProjectCode", () => {
  it("strips Vietnamese diacritics and uppercases", () => {
    expect(generateProjectCode("Nền móng Licogi")).toBe("NEN_MONG_LICOGI");
  });

  it("converts đ/Đ", () => {
    expect(generateProjectCode("Đường Đông")).toBe("DUONG_DONG");
  });

  it("collapses separators and trims underscores", () => {
    expect(generateProjectCode("  Giai đoạn 2 - móng  ")).toBe(
      "GIAI_DOAN_2_MONG",
    );
  });

  it("truncates to 16 characters", () => {
    const code = generateProjectCode("Dự án xây dựng nhà máy giai đoạn hai");
    expect(code.length).toBeLessThanOrEqual(16);
    expect(code).toBe("DU_AN_XAY_DUNG_N");
  });

  it("falls back when nothing usable remains", () => {
    expect(generateProjectCode("!!!")).toBe("DA");
    expect(generateProjectCode("")).toBe("DA");
  });

  it("appends attempt suffix for collision retries", () => {
    expect(generateProjectCode("Móng", 1)).toBe("MONG-2");
    expect(generateProjectCode("Dự án xây dựng nhà máy giai đoạn hai", 3)).toBe(
      "DU_AN_XAY_DUNG_N-4",
    );
  });

  it("always satisfies the code format", () => {
    for (const name of ["Nền móng", "a", "壁の建設", "dự-án_1"]) {
      expect(generateProjectCode(name)).toMatch(/^[A-Za-z0-9_-]{2,20}$/);
    }
  });
});
