import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Trash2 } from "lucide-react";
import { requireBillingViewer } from "@/lib/auth/dal";
import { canEditBilling } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { deleteBillingCustomer } from "@/app/actions/billing-hstt";
import { contractLabel } from "@/lib/billing/queries";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { ActionButton } from "../../action-button";
import { CustomerForm } from "../customer-form";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireBillingViewer();
  const canEdit = canEditBilling(user.profile.role);
  const { id } = await params;
  const t = await getTranslations("Hstt");
  const supabase = await createClient();

  const [{ data: customer }, { data: links }] = await Promise.all([
    supabase.from("billing_customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("billing_contract_hstt").select("contract_id").eq("customer_id", id),
  ]);
  if (!customer) notFound();
  const contractIds = (links ?? []).map((l) => l.contract_id);
  const { data: contracts } = contractIds.length
    ? await supabase.from("billing_contracts").select("*").in("id", contractIds).order("code")
    : { data: [] };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <ModuleEyebrow id="billing" />
          <h1 className={pageTitleClass}>{customer.ten_in_hoa}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t("customersSubtitle")}</p>
        </div>
        {user.profile.role === "admin" && (
          <ActionButton
            action={deleteBillingCustomer}
            id={customer.id}
            label={t("deleteCustomer")}
            title={t("deleteCustomer")}
            body={t("deleteCustomerBody", { name: customer.ten_in_hoa })}
            confirmLabel={t("deleteCustomer")}
            variant="danger"
            icon={<Trash2 className="h-4 w-4" aria-hidden />}
            iconOnly
          />
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardBody>
            <CustomerForm customer={customer} readOnly={!canEdit} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("customerContracts")}</CardTitle>
          </CardHeader>
          <CardBody>
            {(contracts ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">{t("noContracts")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(contracts ?? []).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/billing/contracts/${c.id}?tab=hstt`}
                      className="font-medium text-primary hover:underline"
                    >
                      {contractLabel(c)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
