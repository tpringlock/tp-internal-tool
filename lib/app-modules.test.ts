import { describe, expect, it } from "vitest";
import { getActiveModuleId, getModulesForRole } from "./app-modules";

describe("getActiveModuleId", () => {
  it("matches on the first segment only", () => {
    expect(getActiveModuleId("/documents")).toBe("documents");
    expect(getActiveModuleId("/documents/clients/abc")).toBe("documents");
    expect(getActiveModuleId("/academy/my-courses")).toBe("academy");
    expect(getActiveModuleId("/admin/academy/new")).toBe("admin");
    expect(getActiveModuleId("/admin/docs")).toBe("admin");
    expect(getActiveModuleId("/billing/contracts/x")).toBe("billing");
  });

  it("returns undefined outside any module", () => {
    expect(getActiveModuleId("/")).toBeUndefined();
    expect(getActiveModuleId("/profile")).toBeUndefined();
    expect(getActiveModuleId("/documentsX")).toBeUndefined();
  });
});

describe("getModulesForRole", () => {
  it("hides Admin Panel from employees", () => {
    expect(getModulesForRole("employee").map((m) => m.id)).toEqual([
      "documents",
      "academy",
    ]);
  });

  it("shows billing to admins and accountants only", () => {
    expect(getModulesForRole("accountant").map((m) => m.id)).toEqual([
      "documents",
      "academy",
      "billing",
    ]);
    expect(getModulesForRole("admin").map((m) => m.id)).toEqual([
      "documents",
      "academy",
      "billing",
      "admin",
    ]);
    expect(getModulesForRole("manager").map((m) => m.id)).not.toContain(
      "billing",
    );
  });

  it("sends managers to a section they can open", () => {
    const admin = getModulesForRole("manager").find((m) => m.id === "admin");
    expect(admin?.href).toBe("/admin/clients");
  });

  it("sends admins to user management", () => {
    const admin = getModulesForRole("admin").find((m) => m.id === "admin");
    expect(admin?.href).toBe("/admin/users");
  });
});
