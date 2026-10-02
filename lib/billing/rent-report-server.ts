import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingContract, BillingPriceLine, Database } from "@/lib/db/types";
import { loadActiveMonthUploads } from "./month-files-server";
import { monthsCovering, pickMonthFiles } from "./month-files";
import { presetPeriodFor, type PresetSpec } from "./period-presets";
import { PriceLinesError, toContractConfigFromLines } from "./price-lines";
import { contractLabel, getAllPriceLines } from "./queries";
import { loadMergedLedger } from "./server";
import { buildRentReport, type RentReport, type ReportContract } from "./rent-report";
import { formatVnDate } from "./dates";
import { formatBillingMonth, type RangeRow } from "./periods";
import type { Ledger, Period } from "./types";

type Client = SupabaseClient<Database>;

/** The period of a report: a preset + the month it ends in, or a date range. */
export type ReportPeriodInput =
  | { mode: "preset"; spec: PresetSpec; month: string }
  | { mode: "range"; from: string; to: string };

export interface ReportSourceFile {
  month: string;
  version: number;
  upload_id: string;
  file_name: string;
}

export type LoadedReport =
  | { ok: false; error: string }
  | {
      ok: true;
      contracts: ReportContract[];
      /** Union of the contracts' periods: what the month files cover. */
      period: Period;
      files: ReportSourceFile[];
      ledger: Ledger;
      /** Milliseconds spent loading data and reading the files. */
      loadMs: number;
    };

/** One contract's period for a report (a preset may shorten it by the contract start). */
export function reportPeriodFor(
  input: ReportPeriodInput,
  contract: Pick<BillingContract, "period_start_day" | "contract_start">,
): Period {
  return input.mode === "preset"
    ? presetPeriodFor(input.spec, input.month, contract).period
    : { from: input.from, to: input.to };
}

export interface BillingContractsData {
  /** Real contracts, + demo ones when asked, by MISA warehouse. */
  contracts: BillingContract[];
  linesBy: Map<string, BillingPriceLine[]>;
  ranges: (RangeRow & { contract_id: string | null })[];
}

/**
 * Every contract (demo ones only when `includeDemo`) with its price rows and
 * the non-billable ranges, through RLS. Shared by the rent report and the
 * alert center.
 */
export async function loadBillingContracts(supabase: Client, includeDemo: boolean): Promise<BillingContractsData> {
  // All contracts, filtered by the caller: 200+ ids in .in() would make a very long URL.
  let contractQuery = supabase.from("billing_contracts").select("*").order("misa_kho");
  if (!includeDemo) contractQuery = contractQuery.eq("is_demo", false);
  const [{ data: contracts, error }, realLines, demoLines, { data: rangeRows, error: rangeError }] = await Promise.all([
    contractQuery,
    getAllPriceLines(supabase, { demo: false }),
    includeDemo ? getAllPriceLines(supabase, { demo: true }) : Promise.resolve([]),
    supabase.from("billing_excluded_ranges").select("date_from, date_to, reason, contract_id"),
  ]);
  if (error) throw new Error(error.message);
  if (rangeError) throw new Error(rangeError.message);
  return {
    contracts: contracts ?? [],
    linesBy: Map.groupBy([...realLines, ...demoLines], (l) => l.contract_id),
    ranges: rangeRows ?? [],
  };
}

export type PeriodLedger =
  | { ok: false; error: string }
  | { ok: true; ledger: Ledger; files: ReportSourceFile[] };

/**
 * The merged ledger of the ACTIVE month files covering `period` (oldest
 * first, mergeLedgers). A missing month stops: "Thiếu file tháng ...".
 */
export async function loadPeriodLedger(supabase: Client, period: Period): Promise<PeriodLedger> {
  const pick = pickMonthFiles(period, await loadActiveMonthUploads(supabase, monthsCovering(period)));
  if (pick.error) return { ok: false, error: pick.error };
  return {
    ok: true,
    ledger: await loadMergedLedger(pick.files),
    files: pick.files.map(({ month, version, upload_id, file_name }) => ({ month, version, upload_id, file_name })),
  };
}

/**
 * Everything a rent report needs, read through RLS (the caller has checked
 * the billing read guard): the chosen contracts (demo ones only when
 * `includeDemo`) with their engine configs and non-billable ranges, and the
 * merged ledger of the ACTIVE month files covering the period. A missing
 * month stops the report ("Thiếu file tháng ..."). Nothing is written.
 */
export async function loadReportInput(
  supabase: Client,
  opts: { contractIds: readonly string[]; period: ReportPeriodInput; includeDemo: boolean },
): Promise<LoadedReport> {
  const started = Date.now();
  const data = await loadBillingContracts(supabase, opts.includeDemo);
  const wanted = new Set(opts.contractIds);
  const rows = data.contracts.filter((c) => wanted.has(c.id));
  if (rows.length === 0) return { ok: false, error: "Chưa chọn dự án nào (hoặc không xem được các dự án đã chọn)." };

  const contracts: ReportContract[] = rows.map((c) => {
    let config = null;
    let configError = null;
    try {
      config = toContractConfigFromLines(c, data.linesBy.get(c.id) ?? []);
    } catch (e) {
      if (!(e instanceof PriceLinesError)) throw e;
      configError = e.message;
    }
    return {
      id: c.id,
      label: contractLabel(c),
      misaKho: c.misa_kho,
      isDemo: c.is_demo,
      config,
      configError,
      period: reportPeriodFor(opts.period, c),
      ranges: data.ranges.filter((r) => r.contract_id === null || r.contract_id === c.id),
    };
  });

  const period: Period = {
    from: contracts.reduce((m, c) => (c.period.from < m ? c.period.from : m), contracts[0].period.from),
    to: contracts.reduce((m, c) => (c.period.to > m ? c.period.to : m), contracts[0].period.to),
  };
  const loaded = await loadPeriodLedger(supabase, period);
  if (!loaded.ok) return loaded;
  return { ok: true, contracts, period, files: loaded.files, ledger: loaded.ledger, loadMs: Date.now() - started };
}

/** Parsed report form (rentReportSchema). */
export type ReportParams =
  | { contract_ids: string[]; mode: "preset"; start_day: number; months: PresetSpec["months"]; month: string }
  | { contract_ids: string[]; mode: "range"; date_from: string; date_to: string };

export function reportPeriodInput(p: ReportParams): ReportPeriodInput {
  return p.mode === "preset"
    ? { mode: "preset", spec: { start_day: p.start_day, months: p.months }, month: p.month }
    : { mode: "range", from: p.date_from, to: p.date_to };
}

/** Query string of the period (no contracts), for the project detail links. */
export function reportPeriodQuery(p: ReportParams): string {
  const q: Record<string, string> =
    p.mode === "preset"
      ? { mode: "preset", start_day: String(p.start_day), months: String(p.months), month: p.month }
      : { mode: "range", date_from: p.date_from, date_to: p.date_to };
  return new URLSearchParams(q).toString();
}

/** "Kỳ 26→25, 1 tháng, kết thúc 09/2026" / "Khoảng ngày 01/09/2026 – 30/09/2026" (Excel header). */
export function reportTitle(p: ReportParams): string {
  if (p.mode === "range") return `Khoảng ngày ${formatVnDate(p.date_from)} – ${formatVnDate(p.date_to)}`;
  const rule = p.start_day === 1 ? "tháng dương lịch" : `${p.start_day}→${p.start_day - 1}`;
  return `Kỳ ${rule}, ${p.months} tháng, kết thúc ${formatBillingMonth(p.month)}`;
}

/** Read the report form fields (FormData or URLSearchParams). */
export function reportFormValues(get: (k: string) => unknown, getAll: (k: string) => unknown[]) {
  return {
    mode: get("mode") === "range" ? "range" : "preset",
    contract_ids: getAll("contract_ids").map(String),
    start_day: get("start_day"),
    months: get("months"),
    month: get("month"),
    date_from: get("date_from"),
    date_to: get("date_to"),
  };
}

export type ReportRun =
  | { ok: false; error: string }
  | {
      ok: true;
      report: RentReport;
      period: Period;
      files: ReportSourceFile[];
      loadMs: number;
      calcMs: number;
    };

/** Load + calculate a report (read-only). */
export async function runReport(
  supabase: Client,
  params: ReportParams,
  opts: { includeDemo: boolean; keepResults?: boolean },
): Promise<ReportRun> {
  const loaded = await loadReportInput(supabase, {
    contractIds: params.contract_ids,
    period: reportPeriodInput(params),
    includeDemo: opts.includeDemo,
  });
  if (!loaded.ok) return loaded;
  const t0 = Date.now();
  const report = buildRentReport(loaded.ledger, loaded.contracts, { keepResults: opts.keepResults });
  return { ok: true, report, period: loaded.period, files: loaded.files, loadMs: loaded.loadMs, calcMs: Date.now() - t0 };
}
