import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ALL_TOURS,
  PAGE_TOURS,
  TOUR_PAGES,
  WORKFLOW_TOUR,
  isTourPage,
  pageTourFor,
  stepsForRole,
  tourPageOf,
  tourSeenKey,
  workflowSegment,
  type TourStep,
} from "./tours";

// Scans the app source: own timeout, like billing-guards.test.ts.
vi.setConfig({ testTimeout: 30_000 });

const ROOT = join(__dirname, "..", "..");

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(ROOT, dir))) {
    const p = join(dir, e);
    if (statSync(join(ROOT, p)).isDirectory()) out.push(...files(p));
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(relative(ROOT, join(ROOT, p)).replaceAll("\\", "/"));
  }
  return out;
}

/** Every `data-tour="..."` value in app/ and components/, with the files using it. */
function sourceTargets(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const f of [...files("app"), ...files("components")]) {
    const src = readFileSync(join(ROOT, f), "utf8");
    for (const m of src.matchAll(/data-tour="([a-z0-9-]+)"/g)) found.set(m[1], [...(found.get(m[1]) ?? []), f]);
  }
  return found;
}

const allSteps = ALL_TOURS.flatMap((t) => t.steps.map((s) => ({ tour: t.id, step: s })));

describe("tour targets exist in the source", () => {
  const found = sourceTargets();

  it.each(allSteps.filter((x) => x.step.target).map((x) => [`${x.tour}/${x.step.id}`, x.step.target!]))(
    "%s -> data-tour=%s",
    (_label, target) => {
      expect(found.has(target), `no element has data-tour="${target}"`).toBe(true);
    },
  );

  it("every data-tour in the source is used by a step", () => {
    const used = new Set(allSteps.map((x) => x.step.target).filter(Boolean));
    const unused = [...found.keys()].filter((t) => !used.has(t));
    expect(unused).toEqual([]);
  });
});

describe("tour config", () => {
  it("tour ids are unique and step ids unique within a tour", () => {
    const ids = ALL_TOURS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of ALL_TOURS) {
      const stepIds = t.steps.map((s) => s.id);
      expect(new Set(stepIds).size, t.id).toBe(stepIds.length);
    }
  });

  it("every step has Vietnamese and English text", () => {
    for (const { tour, step } of allSteps) {
      for (const text of [step.title, step.body]) {
        expect(text.vi.trim(), `${tour}/${step.id}`).not.toBe("");
        expect(text.en.trim(), `${tour}/${step.id}`).not.toBe("");
      }
    }
  });

  it("each page has at most one page tour, and page tours do not set step pages", () => {
    const pages = PAGE_TOURS.map((t) => t.page);
    expect(new Set(pages).size).toBe(pages.length);
    for (const t of PAGE_TOURS) {
      expect(t.page, t.id).toBeDefined();
      for (const s of t.steps) expect(s.page, `${t.id}/${s.id}`).toBeUndefined();
    }
  });

  it("every workflow step names its page; the first page can be opened directly", () => {
    for (const s of WORKFLOW_TOUR.steps) expect(s.page, s.id).toBeDefined();
    expect(TOUR_PAGES[WORKFLOW_TOUR.steps[0].page!].href).toBeDefined();
  });
});

describe("stepsForRole", () => {
  const steps: TourStep[] = [
    { id: "all", title: { vi: "", en: "" }, body: { vi: "", en: "" } },
    { id: "edit", access: "edit", title: { vi: "", en: "" }, body: { vi: "", en: "" } },
    { id: "admin", access: "admin", title: { vi: "", en: "" }, body: { vi: "", en: "" } },
    { id: "viewer", access: "viewer", title: { vi: "", en: "" }, body: { vi: "", en: "" } },
  ];
  const ids = (role: Parameters<typeof stepsForRole>[1]) => stepsForRole(steps, role).map((s) => s.id);

  it("Chỉ xem: no edit / admin steps, plus the viewer-only ones", () => {
    expect(ids("billing_viewer")).toEqual(["all", "viewer"]);
  });
  it("kế toán: edit steps, no admin-only or viewer-only steps", () => {
    expect(ids("accountant")).toEqual(["all", "edit"]);
  });
  it("admin: everything but the viewer-only steps", () => {
    expect(ids("admin")).toEqual(["all", "edit", "admin"]);
  });
  it("roles without billing access get nothing", () => {
    expect(ids("employee")).toEqual([]);
    expect(ids("manager")).toEqual([]);
  });

  it("the real calculation tour: period data is an edit step with a viewer counterpart", () => {
    const calc = PAGE_TOURS.find((t) => t.id === "calculation")!;
    const of = (role: Parameters<typeof stepsForRole>[1]) => stepsForRole(calc.steps, role).map((s) => s.id);
    expect(of("billing_viewer")).toContain("period-inputs-view");
    expect(of("billing_viewer")).not.toContain("period-inputs");
    expect(of("billing_viewer")).not.toContain("confirm");
    expect(of("accountant")).toContain("period-inputs");
    expect(of("accountant")).not.toContain("void");
    expect(of("admin")).toContain("void");
  });
});

describe("pages", () => {
  it("matches billing URLs to their tour", () => {
    expect(pageTourFor("/billing", null)?.id).toBe("calculate");
    expect(pageTourFor("/billing/uploads", null)?.id).toBe("uploads");
    expect(pageTourFor("/billing/prices/import", null)?.id).toBe("prices-import");
    expect(pageTourFor("/billing/contracts/abc", "hstt")?.id).toBe("contract-hstt");
    expect(pageTourFor("/billing/contracts/abc", null)).toBeNull();
    expect(pageTourFor("/billing/calculations/abc", null)?.id).toBe("calculation");
    expect(pageTourFor("/billing/history", null)).toBeNull();
    expect(pageTourFor("/documents", null)).toBeNull();
  });

  it("a tab parameter only matches pages that expect it", () => {
    expect(isTourPage("calculate", "/billing", "x")).toBe(false);
    expect(tourPageOf("/billing/contracts/abc", "")).toBeNull();
  });

  it("seen key includes user, tour and version", () => {
    expect(tourSeenKey("u1", { id: "uploads", version: 2 })).toBe("tp.billing-tour.u1.uploads.v2");
  });
});

describe("workflowSegment", () => {
  const steps = stepsForRole(WORKFLOW_TOUR.steps, "accountant");
  const idsOf = (seg: { start: number; end: number } | null) =>
    seg ? steps.slice(seg.start, seg.end + 1).map((s) => s.id) : null;

  it("runs the consecutive steps of the current page", () => {
    expect(idsOf(workflowSegment(steps, "intro", "uploads"))).toEqual(["intro", "upload", "months"]);
    expect(idsOf(workflowSegment(steps, "alerts", "alerts"))).toEqual(["alerts"]);
  });

  it("skips ahead to this page when the user moved on (clicked Tính tiền)", () => {
    expect(idsOf(workflowSegment(steps, "calc-contract", "calculation"))).toEqual([
      "period-inputs",
      "totals",
      "confirm",
      "download",
    ]);
  });

  it("does not rewind to an earlier page", () => {
    expect(workflowSegment(steps, "period-inputs", "uploads")).toBeNull();
    expect(workflowSegment(steps, "intro", null)).toBeNull();
  });

  it("Chỉ xem gets a shorter workflow without the upload / calculate / confirm steps", () => {
    const viewer = stepsForRole(WORKFLOW_TOUR.steps, "billing_viewer").map((s) => s.id);
    expect(viewer).toEqual(["intro", "months", "alerts", "open-recent", "totals", "download"]);
  });
});
