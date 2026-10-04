"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import {
  ALERT_CATEGORIES,
  alertCategory,
  countAlerts,
  filterAlerts,
  isOpeningNegative,
  type AlertCategory,
  type BillingAlert,
} from "@/lib/billing/alert-list";
import { formatVnDate } from "@/lib/billing/dates";
import { formatNumber } from "@/lib/format";
import { fetchDownload } from "@/lib/fetch-download";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

/** Rows rendered at once per table; the rest is reached by filtering (the Excel has all). */
const MAX_ROWS = 500;

/**
 * Alert list with filters (category, search over warehouse / contract /
 * code, company warehouses on/off) and the Excel export of exactly that
 * filter. Negative stock is split: "Âm mới trong kỳ" in the main list,
 * "Âm sẵn từ đầu kỳ" in its own collapsed card (old MISA balances that would
 * otherwise bury the new ones).
 */
export function AlertsView({ alerts, query }: { alerts: BillingAlert[]; query: string }) {
  const t = useTranslations("BillingAlerts");
  const { toast } = useToast();
  const [category, setCategory] = useState<AlertCategory | "">("");
  const [q, setQ] = useState("");
  const [company, setCompany] = useState(true);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const scoped = filterAlerts(alerts, { q, company });
  const counts = countAlerts(scoped);
  const shown = filterAlerts(scoped, { category });
  const main = shown.filter((a) => !isOpeningNegative(a));
  const opening = shown.filter(isOpeningNegative);

  const pick = (c: AlertCategory) => {
    const next = category === c ? "" : c;
    setCategory(next);
    if (next === "negative_opening") setOpeningOpen(true);
  };

  const exportExcel = async () => {
    setExporting(true);
    const params = new URLSearchParams(query);
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    if (!company) params.set("company", "0");
    const error = await fetchDownload(`/api/billing/alerts/xlsx?${params}`, {}, "canh-bao.xlsx", t("exportFailed"));
    setExporting(false);
    if (error) toast(error, { tone: "error" });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-tour="alerts-summary">
        {ALERT_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => pick(c)}
            aria-pressed={category === c}
            className={cn(
              "rounded-2xl border px-4 py-3 text-left transition-colors",
              category === c ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:border-slate-300",
            )}
          >
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{t(`category.${c}`)}</span>
            <span
              className={cn(
                "mt-1 block text-2xl font-bold tabular-nums",
                counts[c] === 0 ? "text-slate-400" : c === "negative_opening" ? "text-slate-600" : "text-amber-700",
              )}
            >
              {counts[c]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3" data-tour="alerts-filters">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="min-w-0 flex-1 basis-56"
        />
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value as AlertCategory | "")}
          aria-label={t("kindFilter")}
          className="w-auto"
        >
          <option value="">{t("allKinds")}</option>
          {ALERT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`category.${c}`)}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={company} onChange={(e) => setCompany(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          {t("showCompany")}
        </label>
        <Button type="button" variant="secondary" loading={exporting} onClick={exportExcel}>
          <Download className="h-4 w-4" aria-hidden />
          {t("exportExcel")}
        </Button>
      </div>

      {(category !== "negative_opening" || main.length > 0) && (
        <Card>
          <CardBody className="p-0">
            <AlertTable alerts={main} />
          </CardBody>
        </Card>
      )}

      {opening.length > 0 && (
        <details
          open={openingOpen}
          onToggle={(e) => setOpeningOpen((e.currentTarget as HTMLDetailsElement).open)}
          className="rounded-2xl border border-slate-200 bg-white"
        >
          <summary className="cursor-pointer px-5 py-3.5 text-sm font-semibold text-slate-800">
            {t("openingTitle", { count: opening.length })}
            <span className="block text-xs font-normal text-slate-500">{t("openingHint")}</span>
          </summary>
          <div className="border-t border-slate-100">
            <AlertTable alerts={opening} />
          </div>
        </details>
      )}
    </div>
  );
}

function AlertTable({ alerts }: { alerts: BillingAlert[] }) {
  const t = useTranslations("BillingAlerts");
  if (alerts.length === 0) return <p className="px-5 py-6 text-sm text-slate-500">{t("empty")}</p>;
  return (
    <>
      <table className="responsive-table w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-slate-500">
            <th className="px-4 py-3 font-medium">{t("colKind")}</th>
            <th className="px-4 py-3 font-medium">{t("colKho")}</th>
            <th className="px-4 py-3 font-medium">{t("colItem")}</th>
            <th className="px-4 py-3 font-medium">{t("colDetail")}</th>
          </tr>
        </thead>
        <tbody>
          {alerts.slice(0, MAX_ROWS).map((a, i) => (
            <tr key={`${a.kind}-${a.kho}-${a.maVt}-${i}`} className="border-b border-slate-50 align-top last:border-0">
              <td data-label={t("colKind")} className="whitespace-nowrap px-4 py-2.5">
                <span className="font-medium text-slate-900">{t(`category.${alertCategory(a)}`)}</span>
                {a.company && <span className="block text-xs text-slate-500">{t("companyBadge")}</span>}
              </td>
              <td data-label={t("colKho")} className="px-4 py-2.5">
                <span className="font-mono text-xs text-slate-900">{a.kho}</span>
                {a.khoName && <span className="block text-xs text-slate-500">{a.khoName}</span>}
                {a.company && <span className="block text-xs text-slate-500">{a.company}</span>}
                {a.contractId && (
                  <Link href={`/billing/contracts/${a.contractId}`} className="block text-xs font-medium text-primary hover:underline">
                    {a.isDemo ? `${t("demoPrefix")} ` : ""}
                    {a.contractLabel}
                  </Link>
                )}
              </td>
              <td data-label={t("colItem")} className="px-4 py-2.5">
                {a.maVt ? (
                  <>
                    <span className="font-mono text-xs text-slate-900">{a.maVt}</span>
                    {a.tenVt && <span className="block text-xs text-slate-500">{a.tenVt}</span>}
                  </>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td data-label={t("colDetail")} className="px-4 py-2.5 text-slate-700">
                {a.message}
                {a.kind === "negative_stock" && (
                  <span className="block text-xs text-slate-500">
                    {a.negativeGroup === "opening"
                      ? t("openingMeta", { opening: formatNumber(a.openingBalance ?? 0), balance: formatNumber(a.balance ?? 0) })
                      : t("negativeMeta", {
                          date: formatVnDate(a.date ?? ""),
                          refs: a.refs?.join(", ") || "—",
                          balance: formatNumber(a.balance ?? 0),
                        })}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {alerts.length > MAX_ROWS && (
        <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
          {t("truncated", { shown: MAX_ROWS, total: alerts.length })}
        </p>
      )}
    </>
  );
}
