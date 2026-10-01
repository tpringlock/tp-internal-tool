"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { saveAdvances } from "@/app/actions/billing-hstt";
import type { FormState } from "@/app/actions/auth";
import { formatNumber } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "../../money-input";

export interface AdvanceRow {
  id: string | null;
  amount: number | null;
  paid_on: string | null;
}

let nextKey = 0;
const withKey = (r: AdvanceRow) => ({ ...r, key: `a${nextKey++}` });

/**
 * Advances paid by Bên A (ĐCCN line 1, display only: the HSTT writes them as
 * =a+b+...) and the note of that line.
 */
export function AdvancesEditor({
  contractId,
  rows: initial,
  note: initialNote,
  readOnly,
}: {
  contractId: string;
  rows: AdvanceRow[];
  note: string;
  readOnly: boolean;
}) {
  const t = useTranslations("Hstt");
  const [rows, setRows] = useState(() => initial.map(withKey));
  const [note, setNote] = useState(initialNote);
  const [state, action, pending] = useActionState<FormState, FormData>(saveAdvances, {});
  const set = (key: string, patch: Partial<AdvanceRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const invalid = rows.some((r) => r.amount === null || Number.isNaN(r.amount) || r.amount === 0);
  const total = rows.reduce((s, r) => s + (r.amount && !Number.isNaN(r.amount) ? r.amount : 0), 0);
  const payload = {
    note,
    items: rows.map((r) => ({ id: r.id, amount: r.amount ?? 0, paid_on: r.paid_on })),
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="contract_id" value={contractId} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{t("noAdvances")}</p>
      ) : (
        <table className="responsive-table w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-slate-500">
              <th className="py-2 pr-3 text-right font-medium">{t("advanceAmount")}</th>
              <th className="w-44 py-2 pr-3 font-medium">{t("advancePaidOn")}</th>
              {!readOnly && <th className="w-10 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-slate-50 last:border-0">
                <td data-label={t("advanceAmount")} className="py-2 pr-3">
                  <MoneyInput
                    defaultValue={r.amount}
                    onValue={(v) => set(r.key, { amount: v })}
                    disabled={readOnly}
                    allowNegative
                    ariaLabel={t("advanceAmount")}
                  />
                </td>
                <td data-label={t("advancePaidOn")} className="py-2 pr-3">
                  <Input
                    type="date"
                    value={r.paid_on ?? ""}
                    onChange={(e) => set(r.key, { paid_on: e.target.value || null })}
                    disabled={readOnly}
                    aria-label={t("advancePaidOn")}
                  />
                </td>
                {!readOnly && (
                  <td className="py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-8 px-0"
                      aria-label={t("remove")}
                      title={t("remove")}
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-semibold text-slate-900">
              <td data-label={t("advancesTotal")} className="py-2 pr-3 tabular-nums md:text-right">
                {formatNumber(total)}đ
              </td>
              <td className="hidden md:table-cell" colSpan={readOnly ? 1 : 2}>
                {t("advancesTotal")}
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      <Field label={t("advancesNote")} htmlFor="advances_note" hint={t("advancesNoteHint")}>
        <Input id="advances_note" value={note} onChange={(e) => setNote(e.target.value)} disabled={readOnly} />
      </Field>

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setRows((rs) => [...rs, withKey({ id: null, amount: null, paid_on: null })])}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("addAdvance")}
          </Button>
          <Button type="submit" size="sm" loading={pending} disabled={invalid}>
            {t("save")}
          </Button>
        </div>
      )}
    </form>
  );
}
