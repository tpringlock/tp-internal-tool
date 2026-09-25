"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { computeRent, type ComputeState } from "@/app/actions/billing";
import { formatVnDate } from "@/lib/billing/dates";
import {
  contractPeriod,
  formatBillingMonth,
  overlapsPeriod,
  suggestUploads,
} from "@/lib/billing/periods";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface CalcContractOption {
  id: string;
  label: string;
  misa_kho: string;
  period_start_day: number;
  contract_start: string | null;
  item_count: number;
}

export interface CalcUploadOption {
  id: string;
  file_name: string;
  file_from: string;
  file_to: string;
  layout: string;
  created_at: string;
  warning_count: number;
}

type Mode = "month" | "range";
const MODES: Mode[] = ["month", "range"];

/**
 * Pick contract + period + MISA files and run the calculation. The period is
 * either a billing month (26 -> 25, the one used for the payment dossier and
 * the only kind that can be confirmed) or a custom date range for a quick
 * look. Files covering the period are preselected (and re-suggested whenever
 * the contract or period changes); the server re-checks everything.
 */
export function CalculateForm({
  contracts,
  uploads,
  months,
  defaultContractId,
  defaultMonth,
  defaultRange,
}: {
  contracts: CalcContractOption[];
  uploads: CalcUploadOption[];
  /** "YYYY-MM", newest first. */
  months: string[];
  defaultContractId: string;
  defaultMonth: string;
  /** Initial custom range, e.g. start of the running period -> today. */
  defaultRange: { from: string; to: string };
}) {
  const t = useTranslations("Billing");
  const [mode, setMode] = useState<Mode>("month");
  const [contractId, setContractId] = useState(defaultContractId);
  const [month, setMonth] = useState(defaultMonth);
  const [rangeFrom, setRangeFrom] = useState(defaultRange.from);
  const [rangeTo, setRangeTo] = useState(defaultRange.to);
  const contract = contracts.find((c) => c.id === contractId);
  const periodFor = (m: string) =>
    contract
      ? contractPeriod(m, contract.period_start_day, contract.contract_start)
      : contractPeriod(m, 26, null);
  const rangeValid = !!rangeFrom && !!rangeTo && rangeFrom <= rangeTo;
  const period =
    mode === "month"
      ? periodFor(month)
      : rangeValid
        ? { from: rangeFrom, to: rangeTo }
        : null;
  const relevant = period ? uploads.filter((u) => overlapsPeriod(u, period)) : [];

  // Re-suggest the file selection when the contract, period or list of
  // relevant files (e.g. after an upload) changes. Adjusted during render,
  // not in an effect.
  const selectionKey = `${contractId}|${period?.from}|${period?.to}|${relevant.map((u) => u.id).join(",")}`;
  const [selectedFor, setSelectedFor] = useState(selectionKey);
  const [selected, setSelected] = useState<string[]>(() =>
    period ? suggestUploads(relevant, period) : [],
  );
  if (selectedFor !== selectionKey) {
    setSelectedFor(selectionKey);
    setSelected(period ? suggestUploads(relevant, period) : []);
  }
  // Only files still listed for the current period are submitted.
  const submitted = selected.filter((id) => relevant.some((u) => u.id === id));
  const chosen = relevant.filter((u) => submitted.includes(u.id));
  const covered =
    !!period && chosen.length > 0 && suggestUploads(chosen, period).length > 0;

  const [state, action, pending] = useActionState<ComputeState, FormData>(
    computeRent,
    {},
  );

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

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

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="contract_id" value={contractId} />
      <input type="hidden" name="mode" value={mode} />
      {mode === "month" ? (
        <input type="hidden" name="month" value={month} />
      ) : (
        <>
          <input type="hidden" name="date_from" value={rangeFrom} />
          <input type="hidden" name="date_to" value={rangeTo} />
        </>
      )}
      {submitted.map((id) => (
        <input key={id} type="hidden" name="upload_ids" value={id} />
      ))}

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
              mode === m
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900",
            )}
          >
            {m === "month" ? t("modeMonth") : t("modeRange")}
          </button>
        ))}
      </div>
      <p className="-mt-3 text-xs text-slate-500">
        {mode === "month" ? t("modeMonthHint") : t("modeRangeHint")}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("contract")}
          htmlFor="calc-contract"
          error={state.fieldErrors?.contract_id?.[0]}
        >
          <Select
            id="calc-contract"
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
          >
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        {mode === "month" ? (
          <Field
            label={t("billingMonth")}
            htmlFor="calc-month"
            error={state.fieldErrors?.month?.[0]}
            hint={
              period
                ? t("periodHint", {
                    from: formatVnDate(period.from),
                    to: formatVnDate(period.to),
                  })
                : undefined
            }
          >
            <Select
              id="calc-month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              {months.map((m) => {
                const p = periodFor(m);
                return (
                  <option key={m} value={m}>
                    {t("monthOption", {
                      month: formatBillingMonth(m),
                      from: formatVnDate(p.from).slice(0, 5),
                      to: formatVnDate(p.to),
                    })}
                  </option>
                );
              })}
            </Select>
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t("dateFrom")}
              htmlFor="calc-from"
              error={state.fieldErrors?.date_from?.[0]}
            >
              <Input
                id="calc-from"
                type="date"
                value={rangeFrom}
                max={rangeTo || undefined}
                onChange={(e) => setRangeFrom(e.target.value)}
                required
              />
            </Field>
            <Field
              label={t("dateTo")}
              htmlFor="calc-to"
              error={state.fieldErrors?.date_to?.[0]}
            >
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
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">
          {t("misaFiles")}
        </legend>
        {relevant.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
            {period
              ? t("noFilesForPeriod", {
                  from: formatVnDate(period.from),
                  to: formatVnDate(period.to),
                })
              : t("chooseValidRange")}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
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
                    <span className="block break-words text-sm font-medium text-slate-900">
                      {u.file_name}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {t("fileSpan", {
                        from: formatVnDate(u.file_from),
                        to: formatVnDate(u.file_to),
                      })}
                      {u.warning_count > 0 &&
                        ` · ${t("warningCount", { count: u.warning_count })}`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {state.fieldErrors?.upload_ids?.[0] && (
          <p className="text-xs text-red-600">
            {state.fieldErrors.upload_ids[0]}
          </p>
        )}
        {selected.length > 0 && (
          <p
            className={cn(
              "flex items-start gap-1.5 text-xs",
              covered ? "text-green-700" : "text-amber-700",
            )}
          >
            {covered ? (
              <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            {covered ? t("coversPeriod") : t("notCoveringPeriod")}
          </p>
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

      {contract && contract.item_count === 0 && (
        <Alert tone="info">{t("contractHasNoItems")}</Alert>
      )}

      <Button type="submit" loading={pending} disabled={selected.length === 0}>
        {pending ? t("calculating") : t("calculate")}
      </Button>
    </form>
  );
}
