import { describe, expect, it } from "vitest";
import seed from "./seed/gia-dinh-excel-contracts.json";
import { billingContractSchema, billingItemSchema } from "@/lib/validation";
import { buildDemoContracts, DEMO_PREFIX, slugifyCode } from "./demo-seed";
import type { ContractConfig } from "./types";

const rows = buildDemoContracts(seed.contracts as ContractConfig[]);

describe("demo seed (Excel tool prices)", () => {
  it("slugifies Vietnamese warehouse names", () => {
    expect(slugifyCode("gia-dinh-Minh Trường - 4")).toBe("gia-dinh-minh-truong-4");
    expect(slugifyCode("gia-dinh-319.5")).toBe("gia-dinh-319-5");
    expect(slugifyCode("TP/ĐAN PHƯỢNG")).toBe("tp-dan-phuong");
  });

  it("builds one flagged, prefixed contract per warehouse", () => {
    expect(rows).toHaveLength(209);
    expect(rows.every((r) => r.is_demo && r.customer_name.startsWith(DEMO_PREFIX))).toBe(true);
    expect(new Set(rows.map((r) => r.code)).size).toBe(rows.length);
    expect(new Set(rows.map((r) => r.misa_kho)).size).toBe(rows.length);
  });

  it("passes the same validation as contracts edited in the app", () => {
    for (const r of rows) {
      const c = billingContractSchema.safeParse({ ...r, contract_start: "" });
      expect(c.success, r.code).toBe(true);
      for (const i of r.items) expect(billingItemSchema.safeParse(i).success, `${r.code} ${i.name}`).toBe(true);
    }
  });

  it("keeps the verified Viet Panel prices apart from the demo twin", () => {
    const vp = rows.find((r) => r.misa_kho === "VIETPANEL-01")!;
    expect(vp.code).not.toBe("vietpanel-senci");
  });
});
