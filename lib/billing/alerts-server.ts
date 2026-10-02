import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { buildAlerts, type BillingAlert } from "./alerts";
import { buildMisaCatalog, mergeMisaCatalogs } from "./misa-catalog";
import { loadActiveCatalog } from "./month-files-server";
import { presetPeriod } from "./period-presets";
import { contractLabel } from "./queries";
import { loadBillingContracts, loadPeriodLedger, type ReportPeriodInput, type ReportSourceFile } from "./rent-report-server";
import type { Period } from "./types";

type Client = SupabaseClient<Database>;

export type AlertsRun =
  | { ok: false; error: string; period: Period | null }
  | { ok: true; alerts: BillingAlert[]; period: Period; files: ReportSourceFile[]; loadMs: number };

/** The period of the alert center: the preset's own dates (not shortened per contract), or the range. */
export function alertsPeriod(input: ReportPeriodInput): Period {
  return input.mode === "preset" ? presetPeriod(input.spec, input.month) : { from: input.from, to: input.to };
}

/**
 * Alerts of a period (read-only, through RLS; the caller checked the read
 * guard). Reuses the rent report's loaders: the ACTIVE month files covering
 * the period merged with mergeLedgers, and every contract with its price
 * rows. Demo contracts count only when `includeDemo`. The MISA catalog for
 * the "not in MISA" / name checks is the stored catalog of every active
 * month file (as on /billing/prices), completed with the period's own files;
 * missing catalogs are never filled here (that would write).
 */
export async function runAlerts(supabase: Client, input: ReportPeriodInput, includeDemo: boolean): Promise<AlertsRun> {
  const started = Date.now();
  let period: Period;
  try {
    period = alertsPeriod(input);
  } catch (e) {
    return { ok: false, error: (e as Error).message, period: null };
  }
  const [data, loaded, active] = await Promise.all([
    loadBillingContracts(supabase, includeDemo),
    loadPeriodLedger(supabase, period),
    loadActiveCatalog(supabase, { fill: false }),
  ]);
  if (!loaded.ok) return { ok: false, error: loaded.error, period };
  const own = buildMisaCatalog(loaded.ledger);
  const catalog = active.catalog ? mergeMisaCatalogs([own, active.catalog]) : own;
  const alerts = buildAlerts({
    ledger: loaded.ledger,
    period,
    catalog,
    contracts: data.contracts.map((c) => ({ contract: c, label: contractLabel(c), lines: data.linesBy.get(c.id) ?? [] })),
  });
  return { ok: true, alerts, period, files: loaded.files, loadMs: Date.now() - started };
}

/** Parsed alertsPeriodSchema -> loader input. */
export function alertsInputFrom(
  p: { mode: "preset"; start_day: number; months: 1 | 3 | 6 | 12; month: string } | { mode: "range"; date_from: string; date_to: string },
): ReportPeriodInput {
  return p.mode === "preset"
    ? { mode: "preset", spec: { start_day: p.start_day, months: p.months }, month: p.month }
    : { mode: "range", from: p.date_from, to: p.date_to };
}
