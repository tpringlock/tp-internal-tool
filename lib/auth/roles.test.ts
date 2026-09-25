import { describe, expect, it } from "vitest";
import { canManageContent, canUseBilling } from "./roles";

describe("role helpers", () => {
  it("billing is for admins and accountants only", () => {
    expect(canUseBilling("admin")).toBe(true);
    expect(canUseBilling("accountant")).toBe(true);
    expect(canUseBilling("manager")).toBe(false);
    expect(canUseBilling("employee")).toBe(false);
  });

  it("accountants do not manage content", () => {
    expect(canManageContent("accountant")).toBe(false);
    expect(canManageContent("manager")).toBe(true);
  });
});
