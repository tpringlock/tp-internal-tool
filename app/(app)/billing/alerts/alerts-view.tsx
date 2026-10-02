"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { ALERT_KINDS, countAlerts, filterAlerts, type AlertKind, type BillingAlert } from "@/lib/billing/alert-list";
import { formatVnDate } from "@/lib/billing/dates";
import { formatNumber } from "@/lib/format";
import { fetchDownload } from "@/lib/fetch-download";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

/** Rows rendered at once; the rest is reached by filtering (the Excel has all). */
const MAX_ROWS = 500;

/**
 * Alert list with filters (kind, search over warehouse / contract / code,
 * company warehouses on/off) and the Excel export of exactly that filter.
 */
export function AlertsView({ alerts, query }: { alerts: BillingAlert[]; query: string }) {
  const t = useTranslations("BillingAlerts");
  const { toast } = useToast();
  const [kind, setKind] = useState<AlertKind | "">("");
  const [q, setQ] = useState("");
  const [company, setCompany] = useState(true);
  const [exporting, setExporting] = useState(false);

  const scoped = filterAlerts(alerts, { q, company });
  const counts = countAlerts(scoped);
  const shown = filterAlerts(scoped, { kind });

  const exportExcel = async () => {
    setExporting(true);
    const params = new URLSearchParams(query);
    if (kind) params.set("kind", kind);
    if (q) params.set("q", q);
    if (!company) params.set("company", "0");
    const error = await fetchDownload(`/api/billing/alerts/xlsx?${params}`, {}, "canh-bao.xlsx", t("exportFailed"));
    setExporting(false);
    if (error) toast(error, { tone: "error" });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ALERT_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(kind === k ? "" : k)}
            aria-pressed={kind === k}
            className={cn(
              "rounded-2xl border px-4 py-3 text-left transition-colors",
              kind === k ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:border-slate-300",
            )}
          >
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{t(`kind.${k}`)}</span>
            <span className={cn("mt-1 block text-2xl font-bold tabular-nums", counts[k] > 0 ? "text-amber-700" : "text-slate-400")}>
              {counts[k]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="min-w-0 flex-1 basis-56"
        />
        <Select value={kind} onChange={(e) => setKind(e.target.value as AlertKind | "")} aria-label={t("kindFilter")} className="w-auto">
          <option value="">{t("allKinds")}</option>
          {ALERT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`kind.${k}`)}
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

      <Card>
        <CardBody className="p-0">
          {shown.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">{t("empty")}</p>
          ) : (
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
                {shown.slice(0, MAX_ROWS).map((a, i) => (
                  <tr key={`${a.kind}-${a.kho}-${a.maVt}-${i}`} className="border-b border-slate-50 align-top last:border-0">
                    <td data-label={t("colKind")} className="whitespace-nowrap px-4 py-2.5">
                      <span className="font-medium text-slate-900">{t(`kind.${a.kind}`)}</span>
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
                      {a.date && (
                        <span className="block text-xs text-slate-500">
                          {t("negativeMeta", { date: formatVnDate(a.date), balance: formatNumber(a.balance ?? 0) })}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {shown.length > MAX_ROWS && (
            <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
              {t("truncated", { shown: MAX_ROWS, total: shown.length })}
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
