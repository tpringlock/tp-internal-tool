import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import vi from "@/messages/vi.json";
import en from "@/messages/en.json";
import { TEMPLATE_ISSUE_CODES, type TemplateIssue } from "./hstt-template";
import { issueValues, sortIssues } from "./hstt-template-issues";

/** Values every issue code may carry (see hstt-template.ts). */
const SAMPLE: Record<string, string> = {
  key: "a.ten",
  marker: "row:cong",
  rows: "33, 37",
  from: "row:cong",
  to: "section:van-chuyen",
  fromRow: "32",
  toRow: "39",
  role: "gia-tri",
  other: "Giá trị",
  value: "sheet:abc",
  formula: "[1]Sheet1!A1",
  ref: "Cũ",
  count: "3",
  text: "{{thang",
  size: "1",
  max: "2",
};

describe("template issue messages", () => {
  it.each([
    ["vi", vi],
    ["en", en],
  ])("every issue code has a message that formats with its values (%s)", (locale, messages) => {
    const errors: string[] = [];
    const t = createTranslator({ locale, messages, namespace: "HsttTemplates", onError: (e) => errors.push(e.message) });
    for (const code of TEMPLATE_ISSUE_CODES) {
      const text = t(`issue.${code}` as never, issueValues({ level: "error", code, values: SAMPLE }) as never);
      // No parameter left unfilled ("{marker}"), no missing-key fallback.
      expect(text, code).not.toMatch(/\{[A-Za-z]+\}|HsttTemplates\.issue/);
    }
    expect(errors).toEqual([]);
  });

  it("the header/footer, chart and shape errors carry the owner's wording", () => {
    const t = createTranslator({ locale: "vi", messages: vi, namespace: "HsttTemplates" });
    for (const code of ["chartLost", "shapeLost", "headerImageLost"] as const) {
      expect(t(`issue.${code}`)).toContain(
        "Đặt logo/con dấu vào ô trên trang tính, không đặt trong Header/Footer; không dùng biểu đồ, hình vẽ.",
      );
    }
  });
});

describe("issueValues / sortIssues", () => {
  it("writes the placeholder with its braces", () => {
    expect(issueValues({ level: "error", code: "unknownPlaceholder", values: { key: "a.ten" } }).ph).toBe("{{a.ten}}");
    expect(issueValues({ level: "error", code: "noRoleSheet" }).ph).toBe("");
  });

  it("errors first, then by sheet order and row", () => {
    const i = (level: TemplateIssue["level"], sheet: string, cell?: string): TemplateIssue => ({
      level,
      code: "unknownMarker",
      sheet,
      cell,
    });
    const sorted = sortIssues([i("warning", "A", "Z3"), i("error", "B", "B10"), i("error", "A", "C9"), i("error", "B", "B2")], ["A", "B"]);
    expect(sorted.map((x) => `${x.level}:${x.sheet}:${x.cell}`)).toEqual([
      "error:A:C9",
      "error:B:B2",
      "error:B:B10",
      "warning:A:Z3",
    ]);
  });
});
