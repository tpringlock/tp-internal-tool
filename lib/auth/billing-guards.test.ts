import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static check of the billing permission model (plan section 3): every
 * server action that changes data starts with requireBillingUser() (admin +
 * accountant), every page / route handler starts with a guard, and pages
 * use the read guard so "Chỉ xem" accounts can open them. Hiding buttons is
 * not access control; this keeps the server side honest when files change.
 */
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

/** Actions that only read or set a display preference: viewers allowed. */
const VIEWER_ACTIONS = new Set(["setShowDemo"]);
/** Admin-only pages: the edit guard + an explicit admin check. */
const ADMIN_PAGES = new Set(["app/(app)/billing/compare/page.tsx"]);

function files(dir: string, names: RegExp): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(ROOT, dir))) {
    const p = join(dir, e);
    if (statSync(join(ROOT, p)).isDirectory()) out.push(...files(p, names));
    else if (names.test(e)) out.push(relative(ROOT, join(ROOT, p)).replaceAll("\\", "/"));
  }
  return out;
}

/** The first statement of every exported async function: "name -> guard". */
function firstGuards(src: string): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const m of src.matchAll(/export async function (\w+)\(/g)) {
    const rest = src.slice(m.index!);
    const body = rest.slice(rest.search(/\)[^\n]*\{\n/) + 1);
    const first = body.split("\n")[1] ?? "";
    out.set(m[1], /^\s*(?:const \w+ = )?await (require\w+)\(\);/.exec(first)?.[1] ?? null);
  }
  return out;
}

describe("billing server-side guards", () => {
  const actions = firstGuards(read("app/actions/billing.ts"));

  it("finds the billing actions", () => {
    expect(actions.size).toBeGreaterThanOrEqual(10);
  });

  it("every billing action starts with a guard: requireBillingUser, or the viewer guard for read-only ones", () => {
    const wrong = [...actions]
      .filter(([name, guard]) => guard !== (VIEWER_ACTIONS.has(name) ? "requireBillingViewer" : "requireBillingUser"))
      .map(([name, guard]) => `${name}: ${guard ?? "no guard on the first line"}`);
    expect(wrong).toEqual([]);
  });

  it("every billing page, layout and route handler starts with a billing guard", () => {
    const targets = [
      ...files("app/(app)/billing", /^(page|layout)\.tsx$/),
      ...files("app/api/billing", /^route\.ts$/),
    ];
    expect(targets.length).toBeGreaterThanOrEqual(10);
    const wrong: string[] = [];
    for (const f of targets) {
      const guards = [...firstGuards(read(f)).values(), ...firstDefaultGuard(read(f))];
      const expected = ADMIN_PAGES.has(f) ? "requireBillingUser" : "requireBillingViewer";
      if (!guards.includes(expected)) wrong.push(`${f}: ${guards.join(", ") || "no guard"}`);
    }
    expect(wrong).toEqual([]);
  });

  it("admin-only pages also check the admin role", () => {
    for (const f of ADMIN_PAGES) expect(read(f)).toMatch(/role !== "admin"\) redirect/);
  });
});

/** Guard on the first line of `export default async function` (pages/layouts). */
function firstDefaultGuard(src: string): string[] {
  const m = /export default async function \w*\(/.exec(src);
  if (!m) return [];
  const rest = src.slice(m.index);
  const body = rest.slice(rest.search(/\)[^\n]*\{\n/) + 1);
  const first = body.split("\n")[1] ?? "";
  const g = /^\s*(?:const \w+ = )?await (require\w+)\(\);/.exec(first)?.[1];
  return g ? [g] : [];
}
