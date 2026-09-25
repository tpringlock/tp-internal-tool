import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireBillingUser } from "@/lib/auth/dal";
import { formatVnDate } from "@/lib/billing/dates";
import { getContractsWithCounts } from "@/lib/billing/queries";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { DialogButton } from "@/components/dialog-button";
import { ContractForm } from "./contract-form";

export default async function BillingContractsPage() {
  await requireBillingUser();
  const t = await getTranslations("Billing");
  const supabase = await createClient();
  const contracts = await getContractsWithCounts(supabase);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <ModuleEyebrow id="billing" />
          <h1 className={pageTitleClass}>{t("contractsTitle")}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t("contractsSubtitle")}</p>
        </div>
        <DialogButton label={t("addContract")}>
          <ContractForm />
        </DialogButton>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("contractCount", { count: contracts.length })}</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {contracts.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">{t("noContractsYet")}</p>
          ) : (
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t("customerName")}</th>
                  <th className="px-5 py-3 font-medium">{t("misaKho")}</th>
                  <th className="px-5 py-3 font-medium">{t("periodLabel")}</th>
                  <th className="px-5 py-3 text-right font-medium">{t("itemCount")}</th>
                  <th className="px-5 py-3 font-medium">{t("statusLabel")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td data-label={t("customerName")} className="px-5 py-3 md:max-w-sm">
                      <span className="block font-medium text-slate-900">{c.customer_name}</span>
                      <span className="block text-xs text-slate-500">
                        {c.project_name}
                        {c.contract_no && ` · ${c.contract_no}`}
                      </span>
                    </td>
                    <td data-label={t("misaKho")} className="px-5 py-3 font-mono text-xs text-slate-700">
                      {c.misa_kho}
                    </td>
                    <td data-label={t("periodLabel")} className="px-5 py-3 text-slate-600">
                      {t("periodRule", { start: c.period_start_day, end: c.period_start_day - 1 })}
                      {c.contract_start && (
                        <span className="block text-xs text-slate-400">
                          {t("fromDate", { date: formatVnDate(c.contract_start) })}
                        </span>
                      )}
                    </td>
                    <td data-label={t("itemCount")} className="px-5 py-3 tabular-nums md:text-right">
                      {c.item_count}
                    </td>
                    <td data-label={t("statusLabel")} className="px-5 py-3">
                      <span
                        className={
                          c.active
                            ? "inline-flex rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800 ring-1 ring-inset ring-green-200"
                            : "inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200"
                        }
                      >
                        {c.active ? t("contractActive") : t("contractInactive")}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/billing/contracts/${c.id}`}
                        className="whitespace-nowrap text-sm font-medium text-primary hover:underline"
                      >
                        {t("edit")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
