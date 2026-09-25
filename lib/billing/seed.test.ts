import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { vietpanelSenci } from "./contracts/vietpanel-senci";

// The Viet Panel seed migration duplicates contracts/vietpanel-senci.ts (the
// config the golden tests verify). Parse the SQL and make sure the two never
// drift apart.
const sql = readFileSync(
  new URL("../../supabase/migrations/0029_billing_seed_vietpanel.sql", import.meta.url),
  "utf8",
);

describe("0029 Viet Panel seed", () => {
  it("contract header matches the verified config", () => {
    for (const v of [
      vietpanelSenci.id,
      vietpanelSenci.customerName,
      vietpanelSenci.projectName,
      vietpanelSenci.contractNo,
      vietpanelSenci.misaKho,
    ]) {
      expect(sql).toContain(`'${v}'`);
    }
  });

  it("items (name, unit, price, merged codes) match in order", () => {
    const rows = [
      ...sql.matchAll(/\(cid, '([^']+)',\s*'([^']+)',\s*(\d+),\s*array\[([^\]]+)\],\s*(\d+)\)/g),
    ].map((m) => ({
      name: m[1],
      unit: m[2],
      unitPrice: Number(m[3]),
      maHang: [...m[4].matchAll(/'([^']+)'/g)].map((c) => c[1]),
    }));
    expect(rows).toEqual(vietpanelSenci.items);
  });

  it("excluded codes match", () => {
    const codes = [...sql.matchAll(/\(cid, '([^']+)'\)/g)].map((m) => m[1]);
    expect(codes).toEqual(vietpanelSenci.excludedMaHang);
  });
});
