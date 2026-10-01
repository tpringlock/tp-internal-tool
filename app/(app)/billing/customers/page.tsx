import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { requireBillingViewer } from "@/lib/auth/dal";
import { canEditBilling } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody } from "@/components/ui/card";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";

/** Bên A list (billing_customers, 0038) with how many contracts use each. */
export default async function CustomersPage() {
  const user = await requireBillingViewer();
  const canEdit = canEditBilling(user.profile.role);
  const t = await getTranslations("Hstt");
  const supabase = await createClient();
  const [{ data: customers }, { data: links }] = await Promise.all([
    supabase.from("billing_customers").select("*").order("ten_in_hoa"),
    supabase.from("billing_contract_hstt").select("customer_id"),
  ]);
  const used = new Map<string, number>();
  for (const l of links ?? []) if (l.customer_id) used.set(l.customer_id, (used.get(l.customer_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <ModuleEyebrow id="billing" />
          <h1 className={pageTitleClass}>{t("customersTitle")}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t("customersSubtitle")}</p>
        </div>
        {canEdit && (
          <Link
            href="/billing/customers/new"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("newCustomer")}
          </Link>
        )}
      </div>

      <Card>
        <CardBody className="p-0">
          {(customers ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">{t("emptyCustomers")}</p>
          ) : (
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t("fields.ten_in_hoa")}</th>
                  <th className="px-5 py-3 font-medium">{t("fields.mst")}</th>
                  <th className="px-5 py-3 font-medium">{t("fields.dai_dien")}</th>
                  <th className="px-5 py-3 text-right font-medium">{t("colContracts")}</th>
                </tr>
              </thead>
              <tbody>
                {(customers ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td data-label={t("fields.ten_in_hoa")} className="px-5 py-2.5">
                      <Link href={`/billing/customers/${c.id}`} className="font-medium text-slate-900 hover:text-primary">
                        {c.ten_in_hoa}
                      </Link>
                      {c.ten_rut_gon && <span className="block text-xs text-slate-500">{c.ten_rut_gon}</span>}
                    </td>
                    <td data-label={t("fields.mst")} className="px-5 py-2.5 font-mono text-xs">
                      {c.mst || "—"}
                    </td>
                    <td data-label={t("fields.dai_dien")} className="px-5 py-2.5">
                      {c.dai_dien ? `${c.dai_dien}${c.chuc_vu ? ` · ${c.chuc_vu}` : ""}` : "—"}
                    </td>
                    <td data-label={t("colContracts")} className="px-5 py-2.5 tabular-nums md:text-right">
                      {used.get(c.id) ?? 0}
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
