"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Download, ExternalLink } from "lucide-react";
import { runRentReport, type ReportState } from "@/app/actions/billing-reports";
import { formatVnDate } from "@/lib/billing/dates";
import { formatBillingMonth } from "@/lib/billing/periods";
import { presetPeriod, type PresetMonths } from "@/lib/billing/period-presets";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";

export interface ReportContractOption {
  id: string;
  label: string;
  misaKho: string;
  active: boolean;
  isDemo: boolean;
  keywords: (string | null)[];
}

export interface ReportPresetOption {
  id: string;
  name: string;
  start_day: number;
  months: PresetMonths;
}

type Mode = "preset" | "range";
type Status = "active" | "all" | "inactive";
type Tab = "codes" | "projects";

/**
 * Rent report form + results: pick projects (search, filter, select all),
 * a preset + month or a date range, run (read-only), then view totals per
 * MISA code and the project list (amount descending, failures last), open a
 * project's vouchers, or export the Excel (formulas + values).
 */
export function ReportForm({
  contracts,
  presets,
  months,
  defaultMonth,
  defaultRange,
}: {
  contracts: ReportContractOption[];
  presets: ReportPresetOption[];
  /** "YYYY-MM", newest first. */
  months: string[];
  defaultMonth: string;
  defaultRange: { from: string; to: string };
}) {
  const t = useTranslations("BillingReports");
  const [status, setStatus] = useState<Status>("active");
  const [selected, setSelected] = useState<string[]>(() => contracts.filter((c) => c.active && !c.isDemo).map((c) => c.id));
  const [mode, setMode] = useState<Mode>("preset");
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "");
  const preset = presets.find((p) => p.id === presetId) ?? presets[0];
  const [month, setMonth] = useState(defaultMonth);
  const [rangeFrom, setRangeFrom] = useState(defaultRange.from);
  const [rangeTo, setRangeTo] = useState(defaultRange.to);
  const [tab, setTab] = useState<Tab>("codes");
  const [hideZero, setHideZero] = useState(false);
  // The parameters of the report on screen, for the Excel export.
  const [ranWith, setRanWith] = useState<[string, string][]>([]);
  const [state, action, pending] = useActionState<ReportState, FormData>(async (prev, fd) => {
    setRanWith([...fd.entries()].map(([k, v]) => [k, String(v)]));
    return runRentReport(prev, fd);
  }, {});

  const visible = contracts.filter((c) => (status === "all" ? true : status === "active" ? c.active : !c.active));
  const byId = new Map(contracts.map((c) => [c.id, c]));
  const rangeValid = !!rangeFrom && !!rangeTo && rangeFrom <= rangeTo;
  const preview =
    mode === "preset" && preset ? presetPeriod(preset, month) : rangeValid ? { from: rangeFrom, to: rangeTo } : null;
  const result = state.result;
  const demoSelected = selected.filter((id) => byId.get(id)?.isDemo).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <form action={action} className="space-y-5">
            {selected.map((id) => (
              <input key={id} type="hidden" name="contract_ids" value={id} />
            ))}
            <input type="hidden" name="mode" value={mode} />
            {mode === "preset" && preset ? (
              <>
                <input type="hidden" name="start_day" value={preset.start_day} />
                <input type="hidden" name="months" value={preset.months} />
                <input type="hidden" name="month" value={month} />
              </>
            ) : (
              <>
                <input type="hidden" name="date_from" value={rangeFrom} />
                <input type="hidden" name="date_to" value={rangeTo} />
              </>
            )}

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">{t("projects")}</legend>
              <MultiSelect
                options={visible.map((c) => ({
                  value: c.id,
                  label: c.label,
                  description: c.active ? undefined : t("inactive"),
                  keywords: c.keywords,
                }))}
                value={selected}
                onChange={setSelected}
                searchPlaceholder={t("searchProjects")}
                selectAllLabel={(n) => t("selectShown", { count: n })}
                clearLabel={t("clearSelection")}
                emptyText={t("noProjectMatch")}
                summary={t("selectedCount", { selected: selected.length, total: contracts.length })}
                toolbar={
                  <Select
                    aria-label={t("statusFilter")}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Status)}
                    className="w-auto"
                  >
                    <option value="active">{t("statusActive")}</option>
                    <option value="inactive">{t("statusInactive")}</option>
                    <option value="all">{t("statusAll")}</option>
                  </Select>
                }
              />
              {state.fieldErrors?.contract_ids?.[0] && (
                <p className="text-xs text-red-600">{state.fieldErrors.contract_ids[0]}</p>
              )}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
              <Field label={t("periodMode")} htmlFor="report-mode">
                <Select id="report-mode" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                  <option value="preset">{t("modePreset")}</option>
                  <option value="range">{t("modeRange")}</option>
                </Select>
              </Field>
              {mode === "preset" ? (
                <>
                  <Field label={t("preset")} htmlFor="report-preset">
                    <Select id="report-preset" value={preset?.id ?? ""} onChange={(e) => setPresetId(e.target.value)}>
                      {presets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t("endMonth")} htmlFor="report-month" error={state.fieldErrors?.month?.[0]}>
                    <Select id="report-month" value={month} onChange={(e) => setMonth(e.target.value)}>
                      {months.map((m) => (
                        <option key={m} value={m}>
                          {formatBillingMonth(m)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
              ) : (
                <>
                  <Field label={t("dateFrom")} htmlFor="report-from" error={state.fieldErrors?.date_from?.[0]}>
                    <Input id="report-from" type="date" value={rangeFrom} max={rangeTo || undefined} onChange={(e) => setRangeFrom(e.target.value)} />
                  </Field>
                  <Field label={t("dateTo")} htmlFor="report-to" error={state.fieldErrors?.date_to?.[0]}>
                    <Input id="report-to" type="date" value={rangeTo} min={rangeFrom || undefined} onChange={(e) => setRangeTo(e.target.value)} />
                  </Field>
                </>
              )}
            </div>
            <p className="text-sm text-slate-600">
              {preview ? t("periodPreview", { from: formatVnDate(preview.from), to: formatVnDate(preview.to) }) : t("rangeInvalid")}
              {" "}
              <span className="text-slate-500">{t("periodNote")}</span>
            </p>

            {demoSelected > 0 && <DemoBanner text={t("demoSelected", { count: demoSelected })} />}

            <Button type="submit" loading={pending} disabled={selected.length === 0 || !preview}>
              {pending ? t("running") : t("run")}
            </Button>
            {pending && <p className="text-xs text-slate-500">{t("runningHint")}</p>}
          </form>
        </CardBody>
      </Card>

      {state.error && <Alert tone="error">{state.error}</Alert>}

      {result && (
        <>
          {result.report.demoCount > 0 && <DemoBanner text={t("demoInReport", { count: result.report.demoCount })} />}

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={t("statTotal")} value={`${formatNumber(result.report.total)}đ`} strong />
            <Stat label={t("statProjects")} value={t("statProjectsValue", { ok: result.report.okCount, errors: result.report.errorCount })} />
            <Stat
              label={t("statPeriod")}
              value={`${formatVnDate(result.period.from)} – ${formatVnDate(result.period.to)}`}
            />
          </div>
          <p className="text-xs text-slate-500">
            {t("filesUsed", {
              files: result.files.map((f) => `${formatBillingMonth(f.month)} v${f.version}`).join(", "),
            })}
            {" · "}
            {t("timing", { load: (result.loadMs / 1000).toFixed(1), calc: (result.calcMs / 1000).toFixed(1) })}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" className="inline-flex rounded-xl bg-slate-200/60 p-1">
              {(["codes", "projects"] as Tab[]).map((x) => (
                <button
                  key={x}
                  type="button"
                  role="tab"
                  aria-selected={tab === x}
                  onClick={() => setTab(x)}
                  className={cn(
                    "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                    tab === x ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900",
                  )}
                >
                  {x === "codes" ? t("tabCodes", { count: result.report.codes.length }) : t("tabProjects", { count: result.report.projects.length })}
                </button>
              ))}
            </div>
            <form method="post" action="/api/billing/reports/xlsx">
              {ranWith.map(([k, v], i) => (
                <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
              ))}
              <Button type="submit" variant="secondary">
                <Download className="h-4 w-4" aria-hidden />
                {t("exportExcel")}
              </Button>
            </form>
          </div>

          {tab === "codes" ? (
            <Card>
              <CardBody className="p-0">
                <CodesTable codes={result.report.codes} />
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>{t("projectsTitle")}</CardTitle>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  {t("hideZero")}
                </label>
              </CardHeader>
              <CardBody className="p-0">
                <ProjectsTable
                  projects={result.report.projects.filter((p) => !hideZero || p.total !== 0)}
                  total={result.report.total}
                  query={result.query}
                />
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function DemoBanner({ text }: { text: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <p>{text}</p>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-2xl border px-4 py-3", strong ? "border-primary/30 bg-primary/5" : "border-slate-200 bg-white")}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn("mt-1 tabular-nums text-slate-900", strong ? "text-2xl font-bold" : "text-base font-semibold")}>{value}</p>
    </div>
  );
}

type Result = NonNullable<ReportState["result"]>;

function CodesTable({ codes }: { codes: Result["report"]["codes"] }) {
  const t = useTranslations("BillingReports");
  const cols = [
    ["opening", "colOpening"],
    ["delivered", "colDelivered"],
    ["returned", "colReturned"],
    ["closing", "colClosing"],
    ["qtyDays", "colQtyDays"],
  ] as const;
  if (codes.length === 0) return <p className="px-5 py-6 text-sm text-slate-500">{t("noCodes")}</p>;
  return (
    <table className="responsive-table w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-left text-slate-500">
          <th className="px-4 py-3 font-medium">{t("colCode")}</th>
          <th className="px-4 py-3 text-right font-medium">{t("colPrice")}</th>
          {cols.map(([, label]) => (
            <th key={label} className="px-4 py-3 text-right font-medium">
              {t(label)}
            </th>
          ))}
          <th className="px-4 py-3 text-right font-medium">{t("colAmount")}</th>
        </tr>
      </thead>
      <tbody>
        {codes.map((c) => (
          <tr key={c.maVt} className="border-b border-slate-50 last:border-0">
            <td data-label={t("colCode")} className="px-4 py-2.5">
              <span className="font-mono text-xs text-slate-900">{c.maVt}</span>
              <span className="block text-xs text-slate-500">
                {c.name}
                {c.unit && ` · ${c.unit}`} · {t("projectCount", { count: c.projectCount })}
              </span>
            </td>
            <td data-label={t("colPrice")} className="px-4 py-2.5 tabular-nums md:text-right">
              {c.unitPrice === null ? <span className="text-amber-700">{t("pricePerProject")}</span> : formatNumber(c.unitPrice)}
            </td>
            {cols.map(([key, label]) => (
              <td key={key} data-label={t(label)} className="px-4 py-2.5 tabular-nums md:text-right">
                {formatNumber(c[key])}
              </td>
            ))}
            <td data-label={t("colAmount")} className="px-4 py-2.5 font-medium tabular-nums text-slate-900 md:text-right">
              {formatNumber(c.amount)}đ
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-slate-200 bg-slate-50 font-bold text-slate-900">
          <td colSpan={7} className="hidden px-4 py-3 md:table-cell">
            {t("total")}
          </td>
          <td data-label={t("total")} className="px-4 py-3 tabular-nums md:text-right">
            {formatNumber(codes.reduce((s, c) => s + c.amount, 0))}đ
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function ProjectsTable({ projects, total, query }: { projects: Result["report"]["projects"]; total: number; query: string }) {
  const t = useTranslations("BillingReports");
  if (projects.length === 0) return <p className="px-5 py-6 text-sm text-slate-500">{t("noProjects")}</p>;
  return (
    <table className="responsive-table w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-left text-slate-500">
          <th className="px-4 py-3 font-medium">#</th>
          <th className="px-4 py-3 font-medium">{t("colProject")}</th>
          <th className="px-4 py-3 font-medium">{t("colPeriod")}</th>
          <th className="px-4 py-3 text-right font-medium">{t("colAmount")}</th>
          <th className="px-4 py-3 font-medium">{t("colNote")}</th>
        </tr>
      </thead>
      <tbody>
        {projects.map((p, i) => (
          <tr key={p.contractId} className={cn("border-b border-slate-50 last:border-0", p.error && "bg-red-50/50")}>
            <td data-label="#" className="px-4 py-2.5 tabular-nums text-slate-500">
              {i + 1}
            </td>
            <td data-label={t("colProject")} className="px-4 py-2.5">
              {p.error ? (
                <span className="text-slate-900">{p.label}</span>
              ) : (
                <Link
                  href={`/billing/reports/project/${p.contractId}?${query}`}
                  target="_blank"
                  className="inline-flex items-start gap-1 font-medium text-slate-900 hover:text-primary hover:underline"
                >
                  {p.label}
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                </Link>
              )}
            </td>
            <td data-label={t("colPeriod")} className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-600">
              {formatVnDate(p.period.from)} – {formatVnDate(p.period.to)}
            </td>
            <td data-label={t("colAmount")} className="px-4 py-2.5 font-medium tabular-nums text-slate-900 md:text-right">
              {p.total === null ? "—" : `${formatNumber(p.total)}đ`}
            </td>
            <td data-label={t("colNote")} className="px-4 py-2.5 text-xs">
              {p.error ? (
                <span className="text-red-700">{p.error}</span>
              ) : p.warnings.length > 0 ? (
                <span className="text-amber-700" title={p.warnings.join("\n")}>
                  {t("warningCount", { count: p.warnings.length })}
                </span>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-slate-200 bg-slate-50 font-bold text-slate-900">
          <td colSpan={3} className="hidden px-4 py-3 md:table-cell">
            {t("total")}
          </td>
          <td data-label={t("total")} className="px-4 py-3 tabular-nums md:text-right">
            {formatNumber(total)}đ
          </td>
          <td className="hidden md:table-cell" />
        </tr>
      </tfoot>
    </table>
  );
}
