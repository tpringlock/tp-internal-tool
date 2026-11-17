import { describe, expect, it } from "vitest";
import { isUuid, safeInternalPath, safeNextPath } from "./utils";

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

describe("safeNextPath", () => {
  it("keeps ordinary app paths", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/documents")).toBe("/documents");
    expect(safeNextPath("/billing/contracts/abc")).toBe("/billing/contracts/abc");
    expect(safeNextPath("/reset-password")).toBe("/reset-password");
  });

  it("keeps a valid query string and hash untouched", () => {
    expect(safeNextPath("/documents/list?q=hop-dong&type=contract")).toBe(
      "/documents/list?q=hop-dong&type=contract",
    );
    expect(safeNextPath("/documents/list?q=h%C3%B3a+%C4%91%C6%A1n&page=2")).toBe(
      "/documents/list?q=h%C3%B3a+%C4%91%C6%A1n&page=2",
    );
    expect(safeNextPath("/billing/contracts/abc?tab=hstt#gia")).toBe(
      "/billing/contracts/abc?tab=hstt#gia",
    );
    // A URL inside the query is data, not the redirect target.
    expect(safeNextPath("/documents/list?q=https://evil.com")).toBe(
      "/documents/list?q=https://evil.com",
    );
  });

  it("rejects protocol-relative targets", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("//evil.com/path?x=1")).toBe("/");
  });

  it("rejects backslash variants", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("/\\/evil.com")).toBe("/");
    expect(safeNextPath("/documents\\..\\evil")).toBe("/");
  });

  it("rejects percent-encoded slashes that decode to //host", () => {
    expect(safeNextPath("%2F%2Fevil.com")).toBe("/");
    expect(safeNextPath("/%2F%2Fevil.com")).toBe("/");
    expect(safeNextPath("/%2f%2fevil.com")).toBe("/");
    expect(safeNextPath("/%5Cevil.com")).toBe("/");
  });

  it("rejects absolute URLs and other schemes", () => {
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("http://evil.com/login")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("JaVaScRiPt:alert(1)")).toBe("/");
    expect(safeNextPath("data:text/html,x")).toBe("/");
  });

  it("rejects control characters and whitespace", () => {
    expect(safeNextPath("/\t/evil.com")).toBe("/");
    expect(safeNextPath("/\n/evil.com")).toBe("/");
    expect(safeNextPath("/documents list")).toBe("/");
    expect(safeNextPath(" /documents")).toBe("/");
  });

  it("sends auth pages to the default page, nested or not", () => {
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/login/")).toBe("/");
    expect(safeNextPath("/login?next=/login")).toBe("/");
    expect(safeNextPath("/login?next=%2Flogin%3Fnext%3D%2Flogin")).toBe("/");
    expect(safeNextPath("/login?next=//evil.com")).toBe("/");
    expect(safeNextPath("/LOGIN")).toBe("/");
    expect(safeNextPath("/%6Cogin")).toBe("/");
    expect(safeNextPath("/forgot-password")).toBe("/");
    expect(safeNextPath("/auth/confirm?next=/reset-password")).toBe("/");
  });

  it("does not mistake look-alike paths for auth pages", () => {
    expect(safeNextPath("/login-history")).toBe("/login-history");
    expect(safeNextPath("/documents/login")).toBe("/documents/login");
    expect(safeNextPath("/documents?from=/login")).toBe("/documents?from=/login");
  });

  it("falls back for malformed or missing input", () => {
    expect(safeNextPath("/%E0%A4%A")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("relative/path")).toBe("/");
    expect(safeNextPath("//evil.com", "/documents")).toBe("/documents");
  });
});
