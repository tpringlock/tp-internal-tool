"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Plus } from "lucide-react";
import { computeRent, type ComputeState } from "@/app/actions/billing";
import { formatVnDate } from "@/lib/billing/dates";
import { formatBillingMonth, overlapsPeriod, suggestUploads } from "@/lib/billing/periods";
import { pickMonthFiles } from "@/lib/billing/month-files";
import { matchContractMonth, presetPeriodFor, type PresetMonths } from "@/lib/billing/period-presets";
import type { Period } from "@/lib/billing/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

export interface CalcContractOption {
  id: string;
  label: string;
  misa_kho: string;
  period_start_day: number;
  contract_start: string | null;
  item_count: number;
  /** The contract's default preset ("mẫu kỳ mặc định"), if any. */
  preset_id: string | null;
  /** Searchable text: warehouse code first, then warehouse name, customer, contract no. */
  keywords: (string | null)[];
}

export interface CalcPresetOption {
  id: string;
  name: string;
  start_day: number;
  months: PresetMonths;
}

/** The active version of one month's MISA file. */
export interface CalcMonthFile {
  month: string;
  version: number;
  upload_id: string;
  file_name: string;
}

/** A legacy (non-month) upload, offered only as a fallback. */
export interface CalcLegacyUpload {
  id: string;
  file_name: string;
  file_from: string;
  file_to: string;
  created_at: string;
  warning_count: number;
}

type Mode = "preset" | "range";
const MODES: Mode[] = ["preset", "range"];

/**
 * Pick contract + period and run the calculation. The period is a preset
 * ("mẫu kỳ") + the month it ends in, or a custom date range. The MISA data
 * is taken automatically: the active file of every month the period touches
 * (listed here before calculating; a missing month blocks the button).
 * Hand-picked legacy multi-month files remain as a labelled fallback. Only a
 * period equal to the contract's own billing period can be confirmed; the
 * server re-checks everything.
 */
export function CalculateForm({
  contracts,
  presets,
  monthFiles,
  legacyUploads,
  months,
  defaultContractId,
  defaultMonth,
  defaultRange,
}: {
  contracts: CalcContractOption[];
  /** Active presets, in display order (never empty). */
  presets: CalcPresetOption[];
  monthFiles: CalcMonthFile[];
  legacyUploads: CalcLegacyUpload[];
  /** "YYYY-MM", newest first. */
  months: string[];
  defaultContractId: string;
  defaultMonth: string;
  /** Initial custom range, e.g. start of the running period -> today. */
  defaultRange: { from: string; to: string };
}) {
  const t = useTranslations("Billing");
  const [mode, setMode] = useState<Mode>("preset");
  const [contractId, setContractId] = useState(defaultContractId);
  const contract = contracts.find((c) => c.id === contractId);
  const presetOf = (c: CalcContractOption | undefined) =>
    presets.find((p) => p.id === c?.preset_id)?.id ?? presets[0]?.id ?? "";
  const [presetId, setPresetId] = useState(() => presetOf(contract));
  // A new contract brings its own default preset (adjusted during render).
  const [presetFor, setPresetFor] = useState(contractId);
  if (presetFor !== contractId) {
    setPresetFor(contractId);
    setPresetId(presetOf(contract));
  }
  const preset = presets.find((p) => p.id === presetId) ?? presets[0];
  const [month, setMonth] = useState(defaultMonth);
  const [rangeFrom, setRangeFrom] = useState(defaultRange.from);
  const [rangeTo, setRangeTo] = useState(defaultRange.to);
  const [useLegacy, setUseLegacy] = useState(false);

  const periodOf = (m: string) => presetPeriodFor(preset, m, contract ?? null);
  const rangeValid = !!rangeFrom && !!rangeTo && rangeFrom <= rangeTo;
  let period: Period | null = null;
  let periodMonth: string | null = null;
  if (mode === "preset" && preset) {
    ({ period, periodMonth } = periodOf(month));
  } else if (mode === "range" && rangeValid) {
    period = { from: rangeFrom, to: rangeTo };
    periodMonth = contract ? matchContractMonth(period, contract) : null;
  }

  const pick = period ? pickMonthFiles(period, monthFiles) : null;

  // Legacy fallback: files overlapping the period, re-suggested whenever the
  // period or the list changes (adjusted during render, not in an effect).
  const relevant = period ? legacyUploads.filter((u) => overlapsPeriod(u, period)) : [];
  const selectionKey = `${period?.from}|${period?.to}|${relevant.map((u) => u.id).join(",")}`;
  const [selectedFor, setSelectedFor] = useState(selectionKey);
  const [selected, setSelected] = useState<string[]>(() => (period ? suggestUploads(relevant, period) : []));
  if (selectedFor !== selectionKey) {
    setSelectedFor(selectionKey);
    setSelected(period ? suggestUploads(relevant, period) : []);
  }
  const submitted = selected.filter((id) => relevant.some((u) => u.id === id));
  const chosen = relevant.filter((u) => submitted.includes(u.id));
  const legacyCovered = !!period && chosen.length > 0 && suggestUploads(chosen, period).length > 0;
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const legacy = useLegacy && legacyUploads.length > 0;
  const canSubmit = !!period && (legacy ? submitted.length > 0 : !!pick && !pick.error);

  const [state, action, pending] = useActionState<ComputeState, FormData>(computeRent, {});

  if (contracts.length === 0) {
    return (
      <div className="space-y-3 text-sm text-slate-600">
        <p>{t("noContractsYet")}</p>
        <Link
          href="/billing/contracts"
          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("addContract")}
        </Link>
      </div>
    );
  }

  const monthLabel = (m: string) => {
    const p = periodOf(m).period;
    return t(preset && preset.months > 1 ? "presetMonthOptionLong" : "monthOption", {
      month: formatBillingMonth(m),
      from: preset && preset.months > 1 ? formatVnDate(p.from) : formatVnDate(p.from).slice(0, 5),
      to: formatVnDate(p.to),
    });
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="contract_id" value={contractId} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="source" value={legacy ? "files" : "months"} />
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
      {legacy && submitted.map((id) => <input key={id} type="hidden" name="upload_ids" value={id} />)}

      <div
        role="radiogroup"
        aria-label={t("periodMode")}
        className="inline-flex w-full max-w-full rounded-xl bg-slate-200/60 p-1 sm:w-fit"
      >
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors sm:flex-none",
              mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900",
            )}
          >
            {m === "preset" ? t("modePreset") : t("modeRange")}
          </button>
        ))}
      </div>

      <Field label={t("contract")} htmlFor="calc-contract" error={state.fieldErrors?.contract_id?.[0]}>
        <Combobox
          id="calc-contract"
          value={contractId}
          onChange={(v) => v && setContractId(v)}
          options={contracts.map((c) => ({ value: c.id, label: c.label, keywords: c.keywords }))}
          placeholder={t("searchContract")}
          emptyText={t("noContractMatch")}
        />
      </Field>

      {mode === "preset" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("periodPreset")} htmlFor="calc-preset" hint={t("periodPresetHint")}>
            <Select id="calc-preset" value={preset?.id ?? ""} onChange={(e) => setPresetId(e.target.value)}>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("periodEndMonth")} htmlFor="calc-month" error={state.fieldErrors?.month?.[0]}>
            <Select id="calc-month" value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Field label={t("dateFrom")} htmlFor="calc-from" error={state.fieldErrors?.date_from?.[0]}>
            <Input
              id="calc-from"
              type="date"
              value={rangeFrom}
              max={rangeTo || undefined}
              onChange={(e) => setRangeFrom(e.target.value)}
              required
            />
          </Field>
          <Field label={t("dateTo")} htmlFor="calc-to" error={state.fieldErrors?.date_to?.[0]}>
            <Input
              id="calc-to"
              type="date"
              value={rangeTo}
              min={rangeFrom || undefined}
              onChange={(e) => setRangeTo(e.target.value)}
              required
            />
          </Field>
        </div>
      )}

      {period ? (
        <div
          className={cn(
            "flex items-start gap-2 rounded-xl px-4 py-3 text-sm",
            periodMonth ? "bg-green-50 text-green-900" : "bg-slate-100 text-slate-700",
          )}
        >
          {periodMonth ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <p>
            <span className="font-medium">
              {t("periodHint", { from: formatVnDate(period.from), to: formatVnDate(period.to) })}
            </span>
            {" · "}
            {periodMonth
              ? t("periodIsContractPeriod", { month: formatBillingMonth(periodMonth) })
              : t("periodIsCustomRange")}
          </p>
        </div>
      ) : (
        <p className="text-sm text-red-700">{t("chooseValidRange")}</p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">{t("misaFiles")}</legend>
        {legacy ? (
          <p className="flex items-start gap-1.5 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {t("legacyInUse")}
          </p>
        ) : pick ? (
          <>
            {pick.files.length > 0 && (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {pick.files.map((f) => (
                  <li key={f.upload_id} className="flex items-start gap-3 px-4 py-2.5">
                    <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-green-700" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">
                        {t("fileMonthLabel", { month: formatBillingMonth(f.month), version: f.version })}
                      </span>
                      <span className="block break-words text-xs text-slate-500">{f.file_name}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {pick.error ? (
              <Alert tone="error">
                <p>{pick.error}</p>
                <p className="mt-1">
                  <Link href="/billing/uploads" className="font-medium underline">
                    {t("uploadMissingMonths")}
                  </Link>
                </p>
              </Alert>
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-green-700">
                <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                {t("monthFilesComplete", { count: pick.files.length })}
              </p>
            )}
          </>
        ) : null}

        {legacyUploads.length > 0 && (
          <details className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50" open={useLegacy}>
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-amber-900">
              {t("legacyFallbackTitle")}
            </summary>
            <div className="space-y-2 px-4 pb-3">
              <p className="text-xs text-amber-900">{t("legacyFallbackHint")}</p>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={useLegacy}
                  onChange={(e) => setUseLegacy(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {t("legacyUseToggle")}
              </label>
              {useLegacy &&
                (relevant.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    {period
                      ? t("noFilesForPeriod", { from: formatVnDate(period.from), to: formatVnDate(period.to) })
                      : t("chooseValidRange")}
                  </p>
                ) : (
                  <>
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                      {relevant.map((u) => (
                        <li key={u.id}>
                          <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={selected.includes(u.id)}
                              onChange={() => toggle(u.id)}
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-slate-900">
                                {t("fileLegacyLabel", {
                                  from: formatVnDate(u.file_from).slice(0, 5),
                                  to: formatVnDate(u.file_to).slice(0, 5),
                                })}
                              </span>
                              <span className="block break-words text-xs text-slate-500">
                                {u.file_name}
                                {" · "}
                                {t("fileSpan", { from: formatVnDate(u.file_from), to: formatVnDate(u.file_to) })}
                                {u.warning_count > 0 && ` · ${t("warningCount", { count: u.warning_count })}`}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {selected.length > 0 && (
                      <p
                        className={cn(
                          "flex items-start gap-1.5 text-xs",
                          legacyCovered ? "text-green-700" : "text-amber-700",
                        )}
                      >
                        {legacyCovered ? (
                          <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                        ) : (
                          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                        {legacyCovered ? t("coversPeriod") : t("notCoveringPeriod")}
                      </p>
                    )}
                  </>
                ))}
              {state.fieldErrors?.upload_ids?.[0] && (
                <p className="text-xs text-red-600">{state.fieldErrors.upload_ids[0]}</p>
              )}
            </div>
          </details>
        )}
      </fieldset>

      {state.error && (
        <Alert tone="error">
          <p className="whitespace-pre-line">{state.error}</p>
          {state.unknownCodes && state.unknownCodes.length > 0 && (
            <div className="mt-2 space-y-2">
              <ul className="list-disc space-y-0.5 pl-5">
                {state.unknownCodes.map((u) => (
                  <li key={u.maHang}>
                    <span className="font-mono">{u.maHang}</span> – {u.tenHang}
                  </li>
                ))}
              </ul>
              {state.contractId && (
                <Link
                  href={`/billing/contracts/${state.contractId}?add=${encodeURIComponent(
                    state.unknownCodes.map((u) => u.maHang).join(","),
                  )}`}
                  className="inline-flex items-center gap-1.5 font-medium text-red-900 underline"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {t("addCodesToContract")}
                </Link>
              )}
            </div>
          )}
        </Alert>
      )}

      {contract && contract.item_count === 0 && <Alert tone="info">{t("contractHasNoItems")}</Alert>}

      <Button type="submit" loading={pending} disabled={!canSubmit}>
        {pending ? t("calculating") : t("calculate")}
      </Button>
    </form>
  );
}
