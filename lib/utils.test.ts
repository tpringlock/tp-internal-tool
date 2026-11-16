import { describe, expect, it } from "vitest";
import { isUuid, safeInternalPath } from "./utils";

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

describe("isUuid", () => {
  it("accepts UUIDs in either case", () => {
    expect(isUuid("48c42cf3-5628-42d4-a587-92111c4a2b9d")).toBe(true);
    expect(isUuid("48C42CF3-5628-42D4-A587-92111C4A2B9D")).toBe(true);
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isUuid("khong-phai-uuid")).toBe(false);
    expect(isUuid("48c42cf3-5628-42d4-a587-92111c4a2b9")).toBe(false);
    expect(isUuid(" 48c42cf3-5628-42d4-a587-92111c4a2b9d")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
