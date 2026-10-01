"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, Wand2, X } from "lucide-react";
import { savePriceLines } from "@/app/actions/billing-prices";
import type { FormState } from "@/app/actions/auth";
import { describeConflict, groupPriceLines } from "@/lib/billing/price-lines";
import { normalizeCode, sameText } from "@/lib/billing/text";
import { formatNumber } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface EditorLine {
  ma_vt: string;
  ten_vt: string;
  dvt: string;
  unit_price: number | null;
  print_name: string | null;
  print_dvt: string | null;
  note: string;
}

interface Row {
  key: number;
  ma_vt: string;
  ten_vt: string;
  dvt: string;
  price: string;
  print_name: string;
  print_dvt: string;
  note: string;
}

let nextKey = 1;
const toRow = (l: EditorLine): Row => ({
  key: nextKey++,
  ma_vt: l.ma_vt,
  ten_vt: l.ten_vt,
  dvt: l.dvt,
  price: l.unit_price === null ? "" : String(l.unit_price),
  print_name: l.print_name ?? "",
  print_dvt: l.print_dvt ?? "",
  note: l.note,
});

const priceOf = (s: string): number | null => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

/**
 * Flat price table of one contract (one row per MISA code, 0036). Shows what
 * the HSTT will print (rows with the same printed name merge into one line,
 * price 0 = not billed) and blocks saving when merged rows disagree.
 * `misa` holds the MISA name/unit of the codes (from the month files), for
 * hints and "fill from MISA". `addCodes` (from "add to contract" after a
 * failed calculation) pre-adds a row per unknown code.
 */
export function PriceLinesEditor({
  contractId,
  lines,
  addCodes,
  misa,
  readOnly = false,
}: {
  contractId: string;
  lines: EditorLine[];
  addCodes: string[];
  misa: Record<string, { name: string; dvt: string }> | null;
  readOnly?: boolean;
}) {
  const t = useTranslations("BillingPrices");
  const known = new Set(lines.map((l) => l.ma_vt));
  const pending = addCodes.map(normalizeCode).filter((c) => c && !known.has(c));
  const [rows, setRows] = useState<Row[]>(() => [
    ...lines.map(toRow),
    ...pending.map((c) =>
      toRow({
        ma_vt: c,
        ten_vt: misa?.[c]?.name ?? "",
        dvt: misa?.[c]?.dvt ?? "",
        unit_price: null,
        print_name: null,
        print_dvt: null,
        note: "",
      }),
    ),
  ]);
  const [state, action, saving] = useActionState<FormState, FormData>(savePriceLines, {});

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, delta: number) =>
    setRows((rs) => {
      const next = [...rs];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row);
      return next;
    });
  const fillFromMisa = () =>
    setRows((rs) =>
      rs.map((r) => {
        const m = misa?.[normalizeCode(r.ma_vt)];
        return m ? { ...r, ten_vt: m.name || r.ten_vt, dvt: m.dvt || r.dvt } : r;
      }),
    );

  const payload = rows.map((r) => ({
    ma_vt: normalizeCode(r.ma_vt),
    ten_vt: r.ten_vt.trim(),
    dvt: r.dvt.trim(),
    unit_price: priceOf(r.price) ?? -1,
    print_name: r.print_name.trim() || null,
    print_dvt: r.print_dvt.trim() || null,
    note: r.note.trim(),
  }));
  const problems: string[] = [];
  {
    const out = problems;
    const seen = new Map<string, number>();
    payload.forEach((p, i) => {
      if (!p.ma_vt) out.push(t("rowNoCode", { row: i + 1 }));
      else if (seen.has(p.ma_vt)) out.push(t("rowDuplicate", { row: i + 1, code: p.ma_vt, other: seen.get(p.ma_vt)! + 1 }));
      else seen.set(p.ma_vt, i);
      if (p.unit_price < 0) out.push(t("rowNoPrice", { row: i + 1 }));
    });
  }
  const grouped = groupPriceLines(
    payload.filter((p) => p.ma_vt && p.unit_price >= 0).map((p, i) => ({ ...p, sort_order: i + 1 })),
  );
  const canSave = problems.length === 0 && grouped.conflicts.length === 0;
  const misaDiffs = misa
    ? payload.filter((p) => {
        const m = misa[p.ma_vt];
        return m && ((m.name && !sameText(m.name, p.ten_vt)) || (m.dvt && !sameText(m.dvt, p.dvt)));
      }).length
    : 0;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={contractId} />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      {pending.length > 0 && !readOnly && <Alert tone="info">{t("pendingCodes", { codes: pending.join(", ") })}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <fieldset disabled={readOnly} className="min-w-0 space-y-3">
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="hidden grid-cols-[1.5rem_6.5rem_minmax(0,1.6fr)_4.5rem_6rem_minmax(0,1.4fr)_4.5rem_minmax(0,1fr)_5.5rem] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 lg:grid">
            <span>#</span>
            <span>{t("colCode")}</span>
            <span>{t("colName")}</span>
            <span>{t("colUnit")}</span>
            <span>{t("colPrice")}</span>
            <span>{t("colPrintName")}</span>
            <span>{t("colPrintUnit")}</span>
            <span>{t("colNote")}</span>
            <span />
          </div>
          <ul className="divide-y divide-slate-100">
            {rows.map((r, i) => {
              const code = normalizeCode(r.ma_vt);
              const m = misa?.[code];
              const nameDiff = m?.name && !sameText(m.name, r.ten_vt);
              const unitDiff = m?.dvt && !sameText(m.dvt, r.dvt);
              return (
                <li
                  key={r.key}
                  className={cn(
                    "grid grid-cols-2 gap-2 px-3 py-3 lg:grid-cols-[1.5rem_6.5rem_minmax(0,1.6fr)_4.5rem_6rem_minmax(0,1.4fr)_4.5rem_minmax(0,1fr)_5.5rem] lg:items-start lg:py-2",
                    priceOf(r.price) === 0 && "bg-slate-50",
                  )}
                >
                  <span className="col-span-2 pt-2 text-xs font-semibold text-slate-400 lg:col-span-1">{i + 1}</span>
                  <Input
                    aria-label={t("colCode")}
                    placeholder={t("colCode")}
                    value={r.ma_vt}
                    onChange={(e) => update(r.key, { ma_vt: e.target.value })}
                    className="font-mono"
                  />
                  <div className="col-span-2 lg:col-span-1">
                    <Input
                      aria-label={t("colName")}
                      placeholder={t("colName")}
                      value={r.ten_vt}
                      onChange={(e) => update(r.key, { ten_vt: e.target.value })}
                    />
                    {misa && code && !m && <p className="mt-0.5 text-xs text-amber-700">{t("notInMisa")}</p>}
                    {nameDiff && <p className="mt-0.5 break-words text-xs text-amber-700">{t("misaIs", { value: m!.name })}</p>}
                  </div>
                  <div>
                    <Input
                      aria-label={t("colUnit")}
                      placeholder={t("colUnit")}
                      value={r.dvt}
                      onChange={(e) => update(r.key, { dvt: e.target.value })}
                    />
                    {unitDiff && <p className="mt-0.5 text-xs text-amber-700">{t("misaIs", { value: m!.dvt })}</p>}
                  </div>
                  <div>
                    <Input
                      aria-label={t("colPrice")}
                      placeholder="0"
                      inputMode="numeric"
                      value={r.price}
                      onChange={(e) => update(r.key, { price: e.target.value.replace(/[^\d]/g, "") })}
                      className="tabular-nums"
                    />
                    {priceOf(r.price) === 0 && <p className="mt-0.5 text-xs text-slate-500">{t("notBilled")}</p>}
                  </div>
                  <Input
                    aria-label={t("colPrintName")}
                    placeholder={t("printNamePlaceholder")}
                    value={r.print_name}
                    onChange={(e) => update(r.key, { print_name: e.target.value })}
                    className="col-span-2 lg:col-span-1"
                  />
                  <Input
                    aria-label={t("colPrintUnit")}
                    placeholder={t("printUnitPlaceholder")}
                    value={r.print_dvt}
                    onChange={(e) => update(r.key, { print_dvt: e.target.value })}
                  />
                  <Input
                    aria-label={t("colNote")}
                    placeholder={t("colNote")}
                    value={r.note}
                    onChange={(e) => update(r.key, { note: e.target.value })}
                  />
                  {!readOnly && (
                    <span className="col-span-2 flex justify-end gap-1 lg:col-span-1">
                      <IconButton label={t("moveUp")} disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </IconButton>
                      <IconButton label={t("moveDown")} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label={t("removeRow")}
                        danger
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      >
                        <X className="h-4 w-4" />
                      </IconButton>
                    </span>
                  )}
                </li>
              );
            })}
            {rows.length === 0 && <li className="px-4 py-5 text-sm text-slate-500">{t("noRows")}</li>}
          </ul>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setRows((rs) => [
                  ...rs,
                  toRow({ ma_vt: "", ten_vt: "", dvt: "", unit_price: null, print_name: null, print_dvt: null, note: "" }),
                ])
              }
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t("addRow")}
            </Button>
            {misa && misaDiffs > 0 && (
              <Button variant="secondary" size="sm" onClick={fillFromMisa}>
                <Wand2 className="h-4 w-4" aria-hidden />
                {t("fillFromMisa", { count: misaDiffs })}
              </Button>
            )}
          </div>
        )}
      </fieldset>

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="text-sm font-semibold text-slate-900">{t("hsttPreview")}</p>
        <p className="mt-0.5 text-xs text-slate-500">{t("hsttPreviewHint")}</p>
        {grouped.items.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{t("noBilledRows")}</p>
        ) : (
          <ol className="mt-2 space-y-1 text-sm">
            {grouped.items.map((it, i) => (
              <li key={it.name} className="flex flex-wrap gap-x-2">
                <span className="w-5 shrink-0 text-right text-slate-400">{i + 1}.</span>
                <span className="font-medium text-slate-900">{it.name}</span>
                <span className="text-slate-500">
                  {it.unit || "—"} · {formatNumber(it.unitPrice)}đ/ngày · {it.maHang.join(", ")}
                </span>
              </li>
            ))}
          </ol>
        )}
        {grouped.excluded.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">{t("excludedList", { codes: grouped.excluded.join(", ") })}</p>
        )}
      </div>

      {!readOnly && (problems.length > 0 || grouped.conflicts.length > 0) && (
        <Alert tone="error">
          <ul className="list-disc space-y-0.5 pl-4">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
            {grouped.conflicts.map((c) => (
              <li key={c.name}>{describeConflict(c)}</li>
            ))}
          </ul>
        </Alert>
      )}

      {!readOnly && (
        <Button type="submit" loading={saving} disabled={!canSave}>
          {t("save")}
        </Button>
      )}
    </form>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 disabled:opacity-40",
        danger ? "hover:border-red-300 hover:bg-red-50 hover:text-red-600" : "hover:border-slate-400 hover:text-slate-900",
      )}
    >
      {children}
    </button>
  );
}
