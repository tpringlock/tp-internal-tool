"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { computeRent, type ComputeState } from "@/app/actions/billing";
import { formatVnDate } from "@/lib/billing/dates";
import {
  contractPeriod,
  overlapsPeriod,
  suggestUploads,
} from "@/lib/billing/periods";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
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

/**
 * Pick contract + billing month + MISA files and run the calculation. The
 * files that cover the period are preselected (and re-suggested whenever the
 * contract or month changes); the server re-checks everything.
 */
export function CalculateForm({
  contracts,
  uploads,
  months,
  defaultContractId,
  defaultMonth,
}: {
  contracts: CalcContractOption[];
  uploads: CalcUploadOption[];
  /** "YYYY-MM", newest first. */
  months: string[];
  defaultContractId: string;
  defaultMonth: string;
}) {
  const t = useTranslations("Billing");
  const [contractId, setContractId] = useState(defaultContractId);
  const [month, setMonth] = useState(defaultMonth);
  const contract = contracts.find((c) => c.id === contractId);
  const periodFor = (m: string) =>
    contract
      ? contractPeriod(m, contract.period_start_day, contract.contract_start)
      : contractPeriod(m, 26, null);
  const period = periodFor(month);
  const relevant = uploads.filter((u) => overlapsPeriod(u, period));

  // Re-suggest the file selection when the contract, month or list of
  // relevant files (e.g. after an upload) changes. Adjusted during render,
  // not in an effect.
  const selectionKey = `${contractId}|${month}|${relevant.map((u) => u.id).join(",")}`;
  const [selectedFor, setSelectedFor] = useState(selectionKey);
  const [selected, setSelected] = useState<string[]>(() =>
    suggestUploads(relevant, period),
  );
  if (selectedFor !== selectionKey) {
    setSelectedFor(selectionKey);
    setSelected(suggestUploads(relevant, period));
  }
  const chosen = uploads.filter((u) => selected.includes(u.id));
  const covered = chosen.length > 0 && suggestUploads(chosen, period).length > 0;

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
      <input type="hidden" name="month" value={month} />
      {selected.map((id) => (
        <input key={id} type="hidden" name="upload_ids" value={id} />
      ))}

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
        <Field
          label={t("billingMonth")}
          htmlFor="calc-month"
          error={state.fieldErrors?.month?.[0]}
          hint={t("periodHint", {
            from: formatVnDate(period.from),
            to: formatVnDate(period.to),
          })}
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
                    month: `${m.slice(5)}/${m.slice(0, 4)}`,
                    from: formatVnDate(p.from).slice(0, 5),
                    to: formatVnDate(p.to),
                  })}
                </option>
              );
            })}
          </Select>
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">
          {t("misaFiles")}
        </legend>
        {relevant.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
            {t("noFilesForPeriod", {
              from: formatVnDate(period.from),
              to: formatVnDate(period.to),
            })}
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
