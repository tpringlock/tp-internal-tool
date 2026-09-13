import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./utils";

describe("safeInternalPath", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeInternalPath("/")).toBe("/");
    expect(safeInternalPath("/documents")).toBe("/documents");
    expect(safeInternalPath("/admin/clients/123?tab=projects")).toBe(
      "/admin/clients/123?tab=projects",
    );
  });

  it("rejects absolute URLs", () => {
    expect(safeInternalPath("https://evil.com")).toBe("/");
    expect(safeInternalPath("http://evil.com/x")).toBe("/");
    expect(safeInternalPath("javascript:alert(1)")).toBe("/");
  });

  it("rejects protocol-relative and backslash variants", () => {
    expect(safeInternalPath("//evil.com")).toBe("/");
    expect(safeInternalPath("/\\evil.com")).toBe("/");
    expect(safeInternalPath("/\\/evil.com")).toBe("/");
  });

  it("falls back for non-strings and empty input", () => {
    expect(safeInternalPath(null)).toBe("/");
    expect(safeInternalPath(undefined)).toBe("/");
    expect(safeInternalPath("")).toBe("/");
    expect(safeInternalPath("relative/path")).toBe("/");
  });

  it("honours a custom fallback", () => {
    expect(safeInternalPath("//evil.com", "")).toBe("");
    expect(safeInternalPath("/ok", "")).toBe("/ok");
  });
});
