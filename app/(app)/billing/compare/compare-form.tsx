"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { compareDemoContracts, type CompareState } from "@/app/actions/billing";
import { formatVnDate } from "@/lib/billing/dates";
import { overlapsPeriod } from "@/lib/billing/periods";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface UploadOption {
  id: string;
  file_name: string;
  file_from: string;
  file_to: string;
}

/**
 * Pick MISA files + a date range, run all demo contracts, show totals per
 * warehouse (descending) with the total of warehouses above 0đ, the figure
 * to check against the Excel "BÁO CÁO TIỀN THUÊ" sheet.
 */
export function CompareForm({
  uploads,
  demoCount,
}: {
  uploads: UploadOption[];
  demoCount: number;
}) {
  const t = useTranslations("Billing");
  const newest = uploads[0];
  const [selected, setSelected] = useState<string[]>(newest ? [newest.id] : []);
  const [from, setFrom] = useState(newest?.file_from ?? "");
  const [to, setTo] = useState(newest?.file_to ?? "");
  const [hideZero, setHideZero] = useState(true);
  const [state, action, pending] = useActionState<CompareState, FormData>(
    compareDemoContracts,
    {},
  );

  const toggle = (u: UploadOption) =>
    setSelected((s) => (s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id]));
  const rangeValid = !!from && !!to && from <= to;
  const result = state.result;
  const rows = result
    ? result.rows.filter((r) => !hideZero || r.total === null || r.total !== 0)
    : [];

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-5">
        {selected.map((id) => (
          <input key={id} type="hidden" name="upload_ids" value={id} />
        ))}
        <input type="hidden" name="date_from" value={from} />
        <input type="hidden" name="date_to" value={to} />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">{t("misaFiles")}</legend>
          {uploads.length === 0 ? (
            <p className="text-sm text-slate-500">{t("noUploads")}</p>
          ) : (
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {uploads.map((u) => (
                <li key={u.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected.includes(u.id)}
                      onChange={() => toggle(u)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-medium text-slate-900">
                        {u.file_name}
                      </span>
                      <span
                        className={cn(
                          "block text-xs",
                          rangeValid && !overlapsPeriod(u, { from, to })
                            ? "text-slate-400"
                            : "text-slate-500",
                        )}
                      >
                        {t("fileSpan", {
                          from: formatVnDate(u.file_from),
                          to: formatVnDate(u.file_to),
                        })}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {state.fieldErrors?.upload_ids?.[0] && (
            <p className="text-xs text-red-600">{state.fieldErrors.upload_ids[0]}</p>
          )}
        </fieldset>

        <div className="grid max-w-md grid-cols-2 gap-3">
          <Field label={t("dateFrom")} htmlFor="cmp-from" error={state.fieldErrors?.date_from?.[0]}>
            <Input
              id="cmp-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              required
            />
          </Field>
          <Field label={t("dateTo")} htmlFor="cmp-to" error={state.fieldErrors?.date_to?.[0]}>
            <Input
              id="cmp-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              required
            />
          </Field>
        </div>
        <p className="text-xs text-slate-500">{t("compareHint")}</p>

        {state.error && <Alert tone="error">{state.error}</Alert>}

        <Button
          type="submit"
          loading={pending}
          disabled={selected.length === 0 || !rangeValid || demoCount === 0}
        >
          {pending ? t("comparing") : t("compareRun", { count: demoCount })}
        </Button>
      </form>

      {result && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label={t("comparePositiveTotal", { count: result.positiveCount })}
              value={`${formatNumber(result.positiveTotal)}đ`}
              strong
            />
            <Stat
              label={t("compareRange")}
              value={`${formatVnDate(result.from)} – ${formatVnDate(result.to)}`}
            />
            <Stat
              label={t("compareContracts")}
              value={t("compareContractsValue", {
                count: result.contractCount,
                errors: result.errorCount,
              })}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={hideZero}
              onChange={(e) => setHideZero(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            {t("hideZero")}
          </label>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-slate-500">
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">{t("misaKho")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("projectName")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("rentTotal")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("note")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.misaKho}
                    className={cn(
                      "border-b border-slate-50 last:border-0",
                      r.error && "bg-red-50/50",
                      r.total === 0 && "text-slate-400",
                    )}
                  >
                    <td data-label="#" className="px-4 py-2 tabular-nums text-slate-400">
                      {i + 1}
                    </td>
                    <td data-label={t("misaKho")} className="px-4 py-2 font-mono text-xs font-medium">
                      {r.misaKho}
                    </td>
                    <td data-label={t("projectName")} className="px-4 py-2 md:max-w-xs">
                      {r.projectName}
                    </td>
                    <td
                      data-label={t("rentTotal")}
                      className={cn(
                        "px-4 py-2 font-medium tabular-nums md:text-right",
                        r.total !== null && r.total < 0 && "text-red-600",
                      )}
                    >
                      {r.total === null ? "—" : `${formatNumber(r.total)}đ`}
                    </td>
                    <td data-label={t("note")} className="px-4 py-2 text-xs">
                      {r.error ? (
                        <span className="text-red-700">{r.error}</span>
                      ) : r.warningCount > 0 ? (
                        <span className="text-amber-700">
                          {t("warningCount", { count: r.warningCount })}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-bold text-slate-900">
                  <td colSpan={3} className="hidden px-4 py-3 md:table-cell">
                    {t("comparePositiveTotal", { count: result.positiveCount })}
                  </td>
                  <td
                    data-label={t("comparePositiveTotal", { count: result.positiveCount })}
                    className="px-4 py-3 text-base tabular-nums md:text-right"
                  >
                    {formatNumber(result.positiveTotal)}đ
                  </td>
                  <td className="hidden md:table-cell" />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3",
        strong ? "border-primary/30 bg-primary/5" : "border-slate-200 bg-white",
      )}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cn("mt-1 tabular-nums text-slate-900", strong ? "text-xl font-bold" : "text-sm font-semibold")}>
        {value}
      </p>
    </div>
  );
}
