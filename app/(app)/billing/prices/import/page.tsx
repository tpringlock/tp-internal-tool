import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { canEditBilling } from "@/lib/auth/roles";
import { Card, CardBody } from "@/components/ui/card";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { PriceImportForm } from "./import-form";

/** Excel import of the price table (accountants and admins; viewers are sent back). */
export default async function BillingPriceImportPage() {
  const user = await requireBillingViewer();
  if (!canEditBilling(user.profile.role)) redirect("/billing/prices");
  const t = await getTranslations("BillingPrices");

  return (
    <div className="space-y-6">
      <div>
        <ModuleEyebrow id="billing" />
        <h1 className={pageTitleClass}>{t("importTitle")}</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          {t("importSubtitle")}{" "}
          <a href="/api/billing/prices/template" className="font-medium text-primary hover:underline">
            {t("template")}
          </a>
          {" · "}
          <Link href="/billing/prices" className="font-medium text-primary hover:underline">
            {t("backToTable")}
          </Link>
        </p>
      </div>
      <Card>
        <CardBody>
          <PriceImportForm />
        </CardBody>
      </Card>
    </div>
  );
}
