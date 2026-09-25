import { getTranslations } from "next-intl/server";
import { Trash2 } from "lucide-react";
import { deleteExcludedRange } from "@/app/actions/billing";
import { daysInclusive, formatVnDate } from "@/lib/billing/dates";
import type { BillingExcludedRange } from "@/lib/db/types";
import { ActionButton } from "../action-button";

/** Non-billable date ranges with a delete button per row. */
export async function RangesTable({
  ranges,
  contractLabels,
}: {
  ranges: BillingExcludedRange[];
  /** Pass to show which contract each range belongs to ("all" when null). */
  contractLabels?: Map<string, string>;
}) {
  const t = await getTranslations("Billing");
  if (ranges.length === 0) {
    return <p className="px-5 py-6 text-sm text-slate-500">{t("noRanges")}</p>;
  }
  return (
    <table className="responsive-table w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-left text-slate-500">
          <th className="px-5 py-3 font-medium">{t("dateRange")}</th>
          <th className="px-5 py-3 font-medium">{t("reason")}</th>
          {contractLabels && <th className="px-5 py-3 font-medium">{t("appliesTo")}</th>}
          <th className="px-5 py-3" />
        </tr>
      </thead>
      <tbody>
        {ranges.map((r) => (
          <tr key={r.id} className="border-b border-slate-50 last:border-0">
            <td data-label={t("dateRange")} className="whitespace-nowrap px-5 py-3 tabular-nums">
              {formatVnDate(r.date_from)} – {formatVnDate(r.date_to)}
              <span className="block text-xs text-slate-500">
                {t("dayCount", { count: daysInclusive(r.date_from, r.date_to) })}
              </span>
            </td>
            <td data-label={t("reason")} className="px-5 py-3 text-slate-700">
              {r.reason}
            </td>
            {contractLabels && (
              <td data-label={t("appliesTo")} className="px-5 py-3 text-slate-600">
                {r.contract_id ? (contractLabels.get(r.contract_id) ?? "—") : t("allContracts")}
              </td>
            )}
            <td className="px-5 py-3 text-right">
              <ActionButton
                action={deleteExcludedRange}
                id={r.id}
                label={t("deleteRange")}
                title={t("deleteRange")}
                body={t("deleteRangeBody", {
                  from: formatVnDate(r.date_from),
                  to: formatVnDate(r.date_to),
                })}
                confirmLabel={t("deleteRange")}
                variant="danger"
                icon={<Trash2 className="h-4 w-4" aria-hidden />}
                iconOnly
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
