"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { saveBillingContractConfig } from "@/app/actions/billing";
import type { FormState } from "@/app/actions/auth";
import { findDuplicateCodes, parseCodeList } from "@/lib/billing/contract-config";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

export interface EditorItem {
  name: string;
  unit: string;
  unit_price: number;
  ma_hang: string[];
}

interface Row {
  key: number;
  name: string;
  unit: string;
  price: string;
  codes: string;
}

let nextKey = 1;
const toRow = (i: EditorItem): Row => ({
  key: nextKey++,
  name: i.name,
  unit: i.unit,
  price: String(i.unit_price),
  codes: i.ma_hang.join(", "),
});

/**
 * Price lines (HSTT display name, unit, daily price, merged MISA codes) and
 * the not-billed code list for one contract, saved together atomically.
 * `addCodes` (from "add to contract" after a failed calculation) pre-adds
 * one empty line per unknown code.
 */
export function ContractConfigEditor({
  contractId,
  items,
  excluded,
  addCodes,
}: {
  contractId: string;
  items: EditorItem[];
  excluded: string[];
  addCodes: string[];
}) {
  const t = useTranslations("Billing");
  const known = new Set([...items.flatMap((i) => i.ma_hang), ...excluded]);
  const pending = addCodes.filter((c) => !known.has(c));
  const [rows, setRows] = useState<Row[]>(() => [
    ...items.map(toRow),
    ...pending.map((c) => toRow({ name: "", unit: "Cái", unit_price: 0, ma_hang: [c] })),
  ]);
  const [excludedText, setExcludedText] = useState(excluded.join(", "));
  const [state, action, saving] = useActionState<FormState, FormData>(
    saveBillingContractConfig,
    {},
  );

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, delta: number) =>
    setRows((rs) => {
      const next = [...rs];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row);
      return next;
    });

  const payload = rows.map((r) => ({
    name: r.name.trim(),
    unit: r.unit.trim(),
    unit_price: Number(r.price),
    ma_hang: parseCodeList(r.codes),
  }));
  const excludedCodes = parseCodeList(excludedText);
  const duplicates = findDuplicateCodes(payload.map((p) => p.ma_hang), excludedCodes);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={contractId} />
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <input type="hidden" name="excluded" value={JSON.stringify(excludedCodes)} />

      {pending.length > 0 && (
        <Alert tone="info">{t("pendingCodesNote", { codes: pending.join(", ") })}</Alert>
      )}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="hidden grid-cols-[2rem_minmax(0,2.2fr)_5rem_7rem_minmax(0,1.6fr)_5.5rem] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 md:grid">
          <span>#</span>
          <span>{t("itemName")}</span>
          <span>{t("unit")}</span>
          <span>{t("unitPriceDay")}</span>
          <span>{t("misaCodes")}</span>
          <span />
        </div>
        <ul className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <li
              key={r.key}
              className="grid grid-cols-2 gap-2 px-3 py-3 md:grid-cols-[2rem_minmax(0,2.2fr)_5rem_7rem_minmax(0,1.6fr)_5.5rem] md:items-center md:py-2"
            >
              <span className="col-span-2 text-xs font-semibold text-slate-400 md:col-span-1">
                {i + 1}
              </span>
              <Input
                aria-label={t("itemName")}
                placeholder={t("itemName")}
                value={r.name}
                onChange={(e) => update(r.key, { name: e.target.value })}
                className="col-span-2 md:col-span-1"
                required
              />
              <Input
                aria-label={t("unit")}
                placeholder={t("unit")}
                value={r.unit}
                onChange={(e) => update(r.key, { unit: e.target.value })}
                required
              />
              <Input
                aria-label={t("unitPriceDay")}
                placeholder={t("unitPriceDay")}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={r.price}
                onChange={(e) => update(r.key, { price: e.target.value })}
                className="tabular-nums"
                required
              />
              <Input
                aria-label={t("misaCodes")}
                placeholder="VT0022, VT0090"
                value={r.codes}
                onChange={(e) => update(r.key, { codes: e.target.value })}
                className="col-span-2 font-mono md:col-span-1"
                required
              />
              <span className="col-span-2 flex justify-end gap-1 md:col-span-1">
                <IconButton label={t("moveUp")} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label={t("moveDown")}
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label={t("removeLine")}
                  danger
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <X className="h-4 w-4" />
                </IconButton>
              </span>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="px-4 py-5 text-sm text-slate-500">{t("noItems")}</li>
          )}
        </ul>
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          setRows((rs) => [...rs, toRow({ name: "", unit: "Cái", unit_price: 0, ma_hang: [] })])
        }
      >
        <Plus className="h-4 w-4" aria-hidden />
        {t("addLine")}
      </Button>

      <div className="space-y-1.5">
        <label htmlFor="excluded-codes" className="text-sm font-medium text-slate-700">
          {t("excludedCodes")}
        </label>
        <Textarea
          id="excluded-codes"
          rows={2}
          value={excludedText}
          onChange={(e) => setExcludedText(e.target.value)}
          className="font-mono"
          placeholder="PALLET, VT0094"
        />
        <p className="text-xs text-slate-500">{t("excludedCodesHint")}</p>
      </div>

      {duplicates.length > 0 && (
        <Alert tone="error">{t("errDuplicateCodes", { codes: duplicates.join(", ") })}</Alert>
      )}

      <Button type="submit" loading={saving} disabled={duplicates.length > 0}>
        {t("saveConfig")}
      </Button>
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
      className={
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 disabled:opacity-40 " +
        (danger
          ? "hover:border-red-300 hover:bg-red-50 hover:text-red-600"
          : "hover:border-slate-400 hover:text-slate-900")
      }
    >
      {children}
    </button>
  );
}
