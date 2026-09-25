import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatVnDate } from "@/lib/billing/dates";
import { formatBillingMonth } from "@/lib/billing/periods";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { BillingRentCalculation } from "@/lib/db/types";
import { StatusBadge } from "./status-badge";

export type CalculationRow = Pick<
  BillingRentCalculation,
  "id" | "contract_id" | "period_month" | "period_from" | "period_to" | "total_amount" | "status" | "created_at" | "created_by"
>;

/** Saved rent calculations (history, dashboard, contract page). */
export async function CalculationsTable({
  rows,
  contractLabels,
  creatorNames,
  showContract = true,
}: {
  rows: CalculationRow[];
  contractLabels: Map<string, string>;
  creatorNames: Map<string, string>;
  showContract?: boolean;
}) {
  const t = await getTranslations("Billing");

  if (rows.length === 0) {
    return <p className="px-5 py-6 text-sm text-slate-500">{t("noCalculations")}</p>;
  }

  return (
    <table className="responsive-table w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-left text-slate-500">
          <th className="px-5 py-3 font-medium">{t("period")}</th>
          {showContract && <th className="px-5 py-3 font-medium">{t("contract")}</th>}
          <th className="px-5 py-3 text-right font-medium">{t("rentTotal")}</th>
          <th className="px-5 py-3 font-medium">{t("statusLabel")}</th>
          <th className="px-5 py-3 font-medium">{t("createdBy")}</th>
          <th className="px-5 py-3" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-slate-50 last:border-0">
            <td data-label={t("period")} className="px-5 py-3">
              <span className="font-medium text-slate-900">
                {r.period_month
                  ? t("monthShort", { month: formatBillingMonth(r.period_month) })
                  : t("customRange")}
              </span>
              <span className="block text-xs text-slate-500">
                {formatVnDate(r.period_from)} – {formatVnDate(r.period_to)}
              </span>
            </td>
            {showContract && (
              <td data-label={t("contract")} className="px-5 py-3 text-slate-700 md:max-w-xs">
                {contractLabels.get(r.contract_id) ?? "—"}
              </td>
            )}
            <td
              data-label={t("rentTotal")}
              className="px-5 py-3 font-semibold tabular-nums text-slate-900 md:text-right"
            >
              {formatNumber(r.total_amount)}đ
            </td>
            <td data-label={t("statusLabel")} className="px-5 py-3">
              <StatusBadge status={r.status} />
            </td>
            <td data-label={t("createdBy")} className="px-5 py-3 text-slate-600">
              {creatorNames.get(r.created_by) ?? "—"}
              <span className="block text-xs text-slate-400">{formatDateTime(r.created_at)}</span>
            </td>
            <td className="px-5 py-3 text-right">
              <Link
                href={`/billing/calculations/${r.id}`}
                className="whitespace-nowrap text-sm font-medium text-primary hover:underline"
              >
                {t("view")}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
