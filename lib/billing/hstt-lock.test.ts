import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Period inputs are locked once the period has a confirmed calculation
 * (periodEditBlock, tested in hstt-data.test.ts). This checks the server
 * action itself: savePeriodInputs must compute the block from the database
 * (status + a confirmed calculation of the same contract/period) and return
 * before its first write. Hiding the form is not the lock.
 */
const src = readFileSync(join(__dirname, "..", "..", "app", "actions", "billing-hstt.ts"), "utf8").replace(
  /\r\n/g,
  "\n",
);

function body(name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const next = src.indexOf("\nexport async function ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("savePeriodInputs lock", () => {
  const fn = body("savePeriodInputs");
  const firstWrite = Math.min(
    ...[".upsert(", ".insert(", ".update(", ".delete("].map((w) => {
      const i = fn.indexOf(w);
      return i === -1 ? Infinity : i;
    }),
  );

  it("starts with the billing edit guard", () => {
    expect(fn.split("\n")[1]).toMatch(/^\s*const user = await requireBillingUser\(\);/);
  });

  it("looks for a confirmed calculation of the same contract and period start", () => {
    const query = fn.slice(0, firstWrite);
    expect(query).toMatch(/\.eq\("contract_id", calc\.contract_id\)\s*\.eq\("period_from", calc\.period_from\)\s*\.eq\("status", "confirmed"\)/);
  });

  it("refuses through periodEditBlock before any write", () => {
    const guard = fn.indexOf("const block = periodEditBlock(");
    const refuse = fn.indexOf("if (block) return { error:");
    expect(guard).toBeGreaterThan(-1);
    expect(refuse).toBeGreaterThan(guard);
    expect(firstWrite).toBeGreaterThan(refuse);
    // The lock input comes from the query, never from the client payload.
    expect(fn.slice(guard, refuse)).toMatch(/confirmedForPeriod: \(confirmed \?\? \[\]\)\.length > 0/);
    expect(fn.slice(guard, refuse)).toMatch(/status: calc\.status/);
  });
});
