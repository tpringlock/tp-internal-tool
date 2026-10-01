import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { canEditBilling } from "@/lib/auth/roles";
import { Card, CardBody } from "@/components/ui/card";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { CustomerForm } from "../customer-form";

/** New Bên A. `?contract=<id>` comes back to that contract's HSTT tab. */
export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ contract?: string }>;
}) {
  const user = await requireBillingViewer();
  if (!canEditBilling(user.profile.role)) redirect("/billing/customers");
  const { contract = "" } = await searchParams;
  const t = await getTranslations("Hstt");
  const returnTo = /^[0-9a-f-]{36}$/.test(contract) ? `/billing/contracts/${contract}?tab=hstt` : undefined;

  return (
    <div className="space-y-6">
      <div>
        <ModuleEyebrow id="billing" />
        <h1 className={pageTitleClass}>{t("newCustomer")}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t("customersSubtitle")}</p>
      </div>
      <Card>
        <CardBody>
          <CustomerForm returnTo={returnTo} />
        </CardBody>
      </Card>
    </div>
  );
}
