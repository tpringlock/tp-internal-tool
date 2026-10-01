import { describe, expect, it } from "vitest";
import type { UserRole } from "@/lib/db/types";
import { canEditBilling, canManageContent, canViewBilling } from "./roles";

const ROLES: UserRole[] = ["admin", "manager", "accountant", "billing_viewer", "employee"];

describe("role helpers", () => {
  it("billing: who may view and who may change (plan section 3)", () => {
    const matrix = Object.fromEntries(ROLES.map((r) => [r, [canViewBilling(r), canEditBilling(r)]]));
    expect(matrix).toEqual({
      admin: [true, true],
      manager: [false, false],
      accountant: [true, true],
      billing_viewer: [true, false],
      employee: [false, false],
    });
  });

  it("accountants and viewers do not manage content", () => {
    expect(canManageContent("accountant")).toBe(false);
    expect(canManageContent("billing_viewer")).toBe(false);
    expect(canManageContent("manager")).toBe(true);
  });
});
