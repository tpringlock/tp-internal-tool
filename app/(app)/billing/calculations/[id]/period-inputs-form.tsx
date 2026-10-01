"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, Plus, Trash2 } from "lucide-react";
import { savePeriodInputs } from "@/app/actions/billing-hstt";
import type { FormState } from "@/app/actions/auth";
import type { HsttTransportRow, OpeningDebtSource, PeriodEditBlock } from "@/lib/billing/hstt-data";
import { closingDebt, computeHsttTotals, type HsttChargeMode } from "@/lib/billing/hstt-totals";
import { amountInWords } from "@/lib/billing/number-to-words";
import { formatNumber } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { MoneyInput } from "../../money-input";

const fmtMonth = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
const isNum = (v: number | null): v is number => v !== null && !Number.isNaN(v);

let nextKey = 0;

/**
 * "Dữ liệu kỳ" of a billing-month calculation: transport trips per vehicle,
 * after-VAT deductions, Bên A's payment and the opening debt (computed from
 * the confirmed periods, or typed over), with the HSTT totals previewed live.
 * Read-only when `block` is set (viewer, locked by a confirmed calculation…);
 * the server action enforces the same rule.
 */
export function PeriodInputsForm({
  calcId,
  month,
  block,
  isAdmin,
  equipment,
  vatPercent,
  advancesTotal,
  transport: initialTransport,
  deductions: initialDeductions,
  paid: initialPaid,
  override: initialOverride,
  note: initialNote,
  chainOpening,
}: {
  calcId: string;
  month: string;
  block: PeriodEditBlock | null;
  isAdmin: boolean;
  equipment: number;
  vatPercent: number;
  advancesTotal: number;
  transport: HsttTransportRow[];
  deductions: { label: string; amount: number }[];
  paid: number;
  override: number | null;
  note: string;
  chainOpening: { value: number | null; source: OpeningDebtSource };
}) {
  const t = useTranslations("Hstt");
  const readOnly = block !== null;
  const [state, action, pending] = useActionState<FormState, FormData>(savePeriodInputs, {});

  const [transport, setTransport] = useState(() => initialTransport.map((r) => ({ ...r })));
  const [deductions, setDeductions] = useState(() =>
    initialDeductions.map((d) => ({ ...d, amount: d.amount as number | null, key: `d${nextKey++}` })),
  );
  const [paid, setPaid] = useState<number | null>(initialPaid);
  const [useOverride, setUseOverride] = useState(initialOverride !== null);
  const [override, setOverride] = useState<number | null>(initialOverride);
  const [note, setNote] = useState(initialNote);

  const setRow = (priceId: string, patch: Partial<HsttTransportRow>) =>
    setTransport((rs) => rs.map((r) => (r.priceId === priceId ? { ...r, ...patch } : r)));

  const validDeductions = deductions.every((d) => d.label.trim() && isNum(d.amount) && d.amount > 0);
  const valid =
    isNum(paid) && validDeductions && (!useOverride || isNum(override)) && transport.every((r) => r.trips === null || r.trips >= 0);

  const totals = computeHsttTotals({
    equipment,
    transport,
    vatPercent,
    deductions: deductions.filter((d) => isNum(d.amount)).map((d) => ({ label: d.label, amount: d.amount as number })),
  });
  const opening = useOverride ? (isNum(override) ? override : null) : chainOpening.value;
  const closing = opening === null || !isNum(paid) ? null : closingDebt({ opening, incurred: totals.afterTax, paid });

  const sourceText = (s: OpeningDebtSource) => {
    switch (s.kind) {
      case "previous":
        return t("openingFrom.previous", { month: fmtMonth(s.month) });
      case "initial":
        return t("openingFrom.initial", { month: fmtMonth(s.month) });
      case "missing":
        return s.month ? t("openingFrom.missing", { month: fmtMonth(s.month) }) : t("openingFrom.none");
      case "manual":
        return t("openingFrom.manual", { month: fmtMonth(s.month) });
      default:
        return t("openingFrom.override");
    }
  };

  const payload = {
    calc_id: calcId,
    paid_in_period: isNum(paid) ? paid : 0,
    opening_debt_override: useOverride && isNum(override) ? override : null,
    note,
    transport: transport.map((r) => ({
      transport_price_id: r.priceId,
      trips: r.trips,
      cumulative_trips: r.cumulativeTrips,
      charge_mode: r.chargeMode,
      note: r.note,
    })),
    deductions: deductions.map((d) => ({ label: d.label, amount: d.amount ?? 0 })),
  };
  const intOrNull = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.trunc(Number(v))) || 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("periodTitle", { month: fmtMonth(month) })}</CardTitle>
        <p className="mt-1 text-sm text-slate-500">{t("periodSubtitle")}</p>
      </CardHeader>
      <CardBody>
        <form action={action} className="space-y-6">
          <input type="hidden" name="payload" value={JSON.stringify(payload)} />
          {block && block !== "viewer" && (
            <Alert tone="info" className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {t(`lock.${block}`)}
                {block === "locked" && ` ${isAdmin ? t("lockedHintAdmin") : t("lockedHint")}`}
              </span>
            </Alert>
          )}
          {state.success && <Alert tone="success">{state.success}</Alert>}
          {state.error && <Alert tone="error">{state.error}</Alert>}

          <fieldset disabled={readOnly} className="min-w-0 space-y-6">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">{t("transportSection")}</h3>
              {transport.length === 0 ? (
                <p className="text-sm text-slate-500">{t("noTransportPrices")}</p>
              ) : (
                <table className="responsive-table w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-500">
                      <th className="py-2 pr-3 font-medium">{t("vehicleName")}</th>
                      <th className="w-24 py-2 pr-3 text-right font-medium">{t("transportTrips")}</th>
                      <th className="w-24 py-2 pr-3 text-right font-medium">{t("transportCumulative")}</th>
                      <th className="w-36 py-2 pr-3 font-medium">{t("chargeMode")}</th>
                      <th className="py-2 pr-3 font-medium">{t("transportNote")}</th>
                      <th className="w-32 py-2 text-right font-medium">{t("amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transport.map((r) => {
                      const amount = r.chargeMode === "now" && r.trips ? r.trips * r.unitPrice : null;
                      return (
                        <tr key={r.priceId} className="border-b border-slate-50 last:border-0">
                          <td data-label={t("vehicleName")} className="py-2 pr-3">
                            <span className="font-medium text-slate-900">{r.name}</span>
                            <span className="block text-xs text-slate-500">
                              {t("pricePerTrip", { price: formatNumber(r.unitPrice), unit: r.unit.toLowerCase() })}
                            </span>
                          </td>
                          <td data-label={t("transportTrips")} className="py-2 pr-3">
                            <Input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={r.trips ?? ""}
                              onChange={(e) => setRow(r.priceId, { trips: intOrNull(e.target.value) })}
                              aria-label={t("transportTrips")}
                              className="text-right tabular-nums"
                            />
                          </td>
                          <td data-label={t("transportCumulative")} className="py-2 pr-3">
                            <Input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={r.cumulativeTrips ?? ""}
                              onChange={(e) => setRow(r.priceId, { cumulativeTrips: intOrNull(e.target.value) })}
                              aria-label={t("transportCumulative")}
                              className="text-right tabular-nums"
                            />
                          </td>
                          <td data-label={t("chargeMode")} className="py-2 pr-3">
                            <Select
                              value={r.chargeMode}
                              onChange={(e) => setRow(r.priceId, { chargeMode: e.target.value as HsttChargeMode })}
                              aria-label={t("chargeMode")}
                            >
                              <option value="now">{t("chargeNow")}</option>
                              <option value="end_of_term">{t("chargeEnd")}</option>
                            </Select>
                          </td>
                          <td data-label={t("transportNote")} className="py-2 pr-3">
                            <Input
                              value={r.note}
                              onChange={(e) => setRow(r.priceId, { note: e.target.value })}
                              aria-label={t("transportNote")}
                            />
                          </td>
                          <td data-label={t("amount")} className="py-2 tabular-nums md:text-right">
                            {amount === null ? "—" : `${formatNumber(amount)}đ`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">{t("deductionsTitle")}</h3>
              {deductions.length === 0 && <p className="text-sm text-slate-500">{t("noDeductions")}</p>}
              {deductions.map((d) => (
                <div key={d.key} className="flex flex-wrap items-start gap-2">
                  <Input
                    value={d.label}
                    onChange={(e) =>
                      setDeductions((ds) => ds.map((x) => (x.key === d.key ? { ...x, label: e.target.value } : x)))
                    }
                    placeholder={t("deductionLabel")}
                    aria-label={t("deductionLabel")}
                    className="min-w-0 flex-[2_1_14rem]"
                  />
                  <div className="min-w-0 flex-[1_1_10rem]">
                    <MoneyInput
                      defaultValue={d.amount}
                      onValue={(v) => setDeductions((ds) => ds.map((x) => (x.key === d.key ? { ...x, amount: v } : x)))}
                      ariaLabel={t("deductionAmount")}
                    />
                  </div>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1 w-8 px-0"
                      aria-label={t("remove")}
                      title={t("remove")}
                      onClick={() => setDeductions((ds) => ds.filter((x) => x.key !== d.key))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setDeductions((ds) => [...ds, { label: "", amount: null, key: `d${nextKey++}` }])}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {t("addDeduction")}
                </Button>
              )}
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <Field label={t("paidInPeriod")} htmlFor="paid_in_period">
                <MoneyInput id="paid_in_period" defaultValue={initialPaid} onValue={setPaid} allowNegative />
              </Field>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-slate-700">{t("openingDebtLabel")}</p>
                <p className="text-sm">
                  <span className="font-semibold tabular-nums text-slate-900">
                    {chainOpening.value === null ? "—" : `${formatNumber(chainOpening.value)}đ`}
                  </span>
                  <span className="block text-xs text-slate-500">{sourceText(chainOpening.source)}</span>
                </p>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={useOverride} onChange={(e) => setUseOverride(e.target.checked)} />
                  {t("overrideOpening")}
                </label>
                {useOverride && (
                  <MoneyInput defaultValue={override} onValue={setOverride} allowNegative ariaLabel={t("overrideOpening")} />
                )}
              </div>
              <div className="sm:col-span-2">
                <Field label={t("periodNote")} htmlFor="period_note">
                  <Textarea id="period_note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
              </div>
            </section>
          </fieldset>

          <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">{t("totalsTitle")}</h3>
            <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              <Total label={t("equipmentTotal")} value={totals.equipment} />
              <Total label={t("transportTotal")} value={totals.transport} />
              <Total label={t("beforeTax")} value={totals.beforeTax} strong />
              <Total label={t("vat", { rate: String(vatPercent).replace(".", ",") })} value={totals.vat} />
              {totals.deductions > 0 && <Total label={t("deductionsTotal")} value={-totals.deductions} />}
              <Total label={t("afterTax")} value={totals.afterTax} strong />
              <Total label={t("advancesShown")} value={advancesTotal} />
              <Total label={t("openingDebtLabel")} value={opening} />
              <Total label={t("paidInPeriod")} value={isNum(paid) ? paid : null} />
              <Total label={t("closingDebt")} value={closing} strong />
            </dl>
            <p className="mt-3 text-sm italic text-slate-700">
              {t("inWords")}: {amountInWords(totals.afterTax)}
            </p>
          </section>

          {!readOnly && (
            <Button type="submit" loading={pending} disabled={!valid}>
              {t("savePeriod")}
            </Button>
          )}
        </form>
      </CardBody>
    </Card>
  );
}

function Total({ label, value, strong = false }: { label: string; value: number | null; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-primary/10 py-1">
      <dt className={strong ? "font-semibold text-slate-900" : "text-slate-600"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-bold text-slate-900" : "text-slate-800"}`}>
        {value === null ? "—" : `${formatNumber(value)}đ`}
      </dd>
    </div>
  );
}
