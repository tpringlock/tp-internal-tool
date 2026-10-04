"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { BookOpen, CircleHelp, Route } from "lucide-react";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { DropdownMenu, menuItemClass } from "@/components/ui/dropdown-menu";
import {
  TOUR_PAGES,
  WORKFLOW_TOUR,
  pageTourFor,
  stepsForRole,
  tourPageOf,
  tourSeenKey,
  workflowSegment,
  type TourLocale,
  type TourStep,
} from "@/lib/billing/tours";
import type { UserRole } from "@/lib/db/types";

/** Texts from the server (the header sits outside the billing message provider). */
export interface BillingTourLabels {
  help: string;
  pageTour: string;
  noPageTour: string;
  workflowTour: string;
  next: string;
  prev: string;
  done: string;
  gotIt: string;
  close: string;
  /** "{current}/{total}" pattern. */
  progress: string;
}

/** The workflow tour's position, kept for this browser tab only. */
const WORKFLOW_KEY = "tp.billing-tour.workflow";
/** A paused workflow older than this is dropped. */
const WORKFLOW_TTL_MS = 3 * 60 * 60 * 1000;
/** How long to wait for a page's tour targets to render. */
const READY_TIMEOUT_MS = 4000;

interface WorkflowState {
  user: string;
  version: number;
  step: string;
  at: number;
}

function readWorkflow(userId: string): string | null {
  try {
    const raw = sessionStorage.getItem(WORKFLOW_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as WorkflowState;
    if (s.user !== userId || s.version !== WORKFLOW_TOUR.version || Date.now() - s.at > WORKFLOW_TTL_MS) return null;
    return s.step;
  } catch {
    return null;
  }
}

function writeWorkflow(userId: string, step: string | null) {
  try {
    if (step === null) sessionStorage.removeItem(WORKFLOW_KEY);
    else {
      const s: WorkflowState = { user: userId, version: WORKFLOW_TOUR.version, step, at: Date.now() };
      sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify(s));
    }
  } catch {
    // Storage blocked: the workflow simply does not survive a page change.
  }
}

function hasSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    // Storage blocked: never auto-start rather than on every visit.
    return true;
  }
}

function markSeen(key: string) {
  try {
    localStorage.setItem(key, new Date().toISOString());
  } catch {
    // ignore
  }
}

/** The first visible element carrying `data-tour="<target>"`. */
function findTarget(target: string): Element | null {
  for (const el of document.querySelectorAll(`[data-tour="${target}"]`)) {
    if (el.getClientRects().length > 0) return el;
  }
  return null;
}

/** Steps whose element is on the page (centred steps always are). */
function presentSteps(steps: TourStep[]): TourStep[] {
  return steps.filter((s) => !s.target || findTarget(s.target));
}

/**
 * "Hướng dẫn sử dụng" of the billing module: the "?" button in the header
 * (replay this page's tour / start the monthly workflow), the first-visit
 * auto-start of each page tour, and the workflow tour that follows the user
 * across pages. Content and roles come from lib/billing/tours.ts.
 */
export function BillingTour({
  userId,
  role,
  labels,
}: {
  userId: string;
  role: UserRole;
  labels: BillingTourLabels;
}) {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const router = useRouter();
  const locale = (useLocale() === "en" ? "en" : "vi") satisfies TourLocale;
  const driverRef = useRef<Driver | null>(null);

  const inBilling = pathname === "/billing" || pathname.startsWith("/billing/");
  const page = tourPageOf(pathname, tab);
  const pageTour = pageTourFor(pathname, tab);
  const pageSteps = useMemo(() => (pageTour ? stepsForRole(pageTour.steps, role) : []), [pageTour, role]);
  const workflowSteps = useMemo(() => stepsForRole(WORKFLOW_TOUR.steps, role), [role]);

  const stop = useCallback(() => {
    driverRef.current?.destroy();
    driverRef.current = null;
  }, []);

  /** Runs `steps` (already filtered to this page) with the given hooks. */
  const run = useCallback(
    (
      steps: TourStep[],
      opts: {
        /** 0-based position of steps[0] and the total, for the progress line. */
        offset: number;
        total: number;
        doneText: string;
        onDone: () => void;
        onClose: () => void;
      },
    ) => {
      stop();
      const shown = presentSteps(steps);
      if (shown.length === 0) return false;
      const indexOf = new Map(steps.map((s, i) => [s.id, i]));
      const driveSteps: DriveStep[] = shown.map((s) => ({
        element: s.target ? () => findTarget(s.target!) ?? document.body : undefined,
        popover: {
          title: s.title[locale],
          description: s.body[locale],
          progressText: labels.progress
            .replace("{current}", String(opts.offset + (indexOf.get(s.id) ?? 0) + 1))
            .replace("{total}", String(opts.total)),
        },
      }));
      const d = driver({
        steps: driveSteps,
        animate: true,
        smoothScroll: true,
        allowClose: true,
        overlayClickBehavior: () => {},
        stagePadding: 6,
        stageRadius: 12,
        popoverClass: "tp-tour",
        showProgress: true,
        nextBtnText: labels.next,
        prevBtnText: labels.prev,
        doneBtnText: opts.doneText,
        closeBtnLabel: labels.close,
        onDoneClick: () => {
          stop();
          opts.onDone();
        },
        // Close button / Escape: the user leaves the tour.
        onDestroyStarted: () => {
          stop();
          opts.onClose();
        },
      });
      driverRef.current = d;
      d.drive();
      return true;
    },
    [labels, locale, stop],
  );

  /** Continues the workflow tour on this page, if its next steps are here. */
  const runWorkflowHere = useCallback((): boolean => {
    const saved = readWorkflow(userId);
    if (saved === null) return false;
    const seg = workflowSegment(workflowSteps, saved, page);
    if (!seg) return false;
    // Remember where the user is, so going back to an earlier page does not rewind.
    writeWorkflow(userId, workflowSteps[seg.start].id);
    const next = workflowSteps[seg.end + 1];
    const nextHref = next?.page ? TOUR_PAGES[next.page].href : undefined;
    return run(workflowSteps.slice(seg.start, seg.end + 1), {
      offset: seg.start,
      total: workflowSteps.length,
      doneText: !next ? labels.done : nextHref ? labels.next : labels.gotIt,
      onDone: () => {
        if (!next) return writeWorkflow(userId, null);
        // Pause on the next step: a fixed page is opened for the user, a
        // dynamic one (a calculation) resumes when they open it.
        writeWorkflow(userId, next.id);
        if (nextHref) router.push(nextHref);
      },
      onClose: () => writeWorkflow(userId, null),
    });
  }, [labels, page, router, run, userId, workflowSteps]);

  const runPageTour = useCallback(() => {
    if (!pageTour) return false;
    return run(pageSteps, {
      offset: 0,
      total: pageSteps.length,
      doneText: labels.done,
      onDone: () => {},
      onClose: () => {},
    });
  }, [labels.done, pageSteps, pageTour, run]);

  // On every billing page: resume the workflow tour, or auto-start this
  // page's tour on the first visit. Waits for the page's targets to render.
  const routeKey = `${pathname}?${tab ?? ""}`;
  useEffect(() => {
    stop();
    if (!inBilling) return;
    const workflowActive = readWorkflow(userId) !== null;
    const tourKey = pageTour ? tourSeenKey(userId, pageTour) : null;
    const autoPage = !workflowActive && !!tourKey && pageSteps.length > 0 && !hasSeen(tourKey);
    if (!workflowActive && !autoPage) return;

    const wanted = (workflowActive ? workflowSteps.filter((s) => s.page === page) : pageSteps).filter((s) => s.target);
    const started = Date.now();
    let timer: number;
    const tick = () => {
      const ready = wanted.length === 0 || wanted.some((s) => findTarget(s.target!));
      if (!ready && Date.now() - started < READY_TIMEOUT_MS) {
        timer = window.setTimeout(tick, 150);
        return;
      }
      if (workflowActive) runWorkflowHere();
      else if (tourKey && runPageTour()) markSeen(tourKey);
    };
    timer = window.setTimeout(tick, 300);
    return () => {
      window.clearTimeout(timer);
      stop();
    };
    // Re-run on navigation only; the callbacks change with every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, inBilling, userId]);

  if (!inBilling) return null;

  const startWorkflow = () => {
    const first = workflowSteps[0];
    if (!first?.page) return;
    writeWorkflow(userId, first.id);
    if (first.page === page) runWorkflowHere();
    else router.push(TOUR_PAGES[first.page].href ?? "/billing");
  };

  return (
    <DropdownMenu
      label={labels.help}
      align="end"
      triggerClassName="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary aria-expanded:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      menuClassName="w-72 max-w-[calc(100vw-2rem)]"
      trigger={<CircleHelp className="h-5 w-5" aria-hidden />}
    >
      {(close) => (
        <>
          <button
            type="button"
            role="menuitem"
            disabled={!pageTour || pageSteps.length === 0}
            onClick={() => {
              close();
              writeWorkflow(userId, null);
              if (pageTour && runPageTour()) markSeen(tourSeenKey(userId, pageTour));
            }}
            className={`${menuItemClass} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <BookOpen className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <span className="min-w-0">
              {labels.pageTour}
              {(!pageTour || pageSteps.length === 0) && (
                <span className="block text-xs text-slate-400">{labels.noPageTour}</span>
              )}
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              startWorkflow();
            }}
            className={menuItemClass}
          >
            <Route className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            {labels.workflowTour}
          </button>
        </>
      )}
    </DropdownMenu>
  );
}
