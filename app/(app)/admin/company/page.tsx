import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { CompanyForm } from "./company-form";

/** "Thông tin công ty": Bên B of the HSTT (company_profile, 0038). Admin only. */
export default async function CompanyPage() {
  await requireAdmin();
  const t = await getTranslations("Hstt");
  const supabase = await createClient();
  const { data: company } = await supabase.from("company_profile").select("*").eq("id", 1).maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <ModuleEyebrow id="admin" />
        <h1 className={pageTitleClass}>{t("companyTitle")}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t("companySubtitle")}</p>
      </div>
      {company ? (
        <Card>
          <CardBody>
            <CompanyForm
              values={Object.fromEntries(
                Object.entries(company).filter(([, v]) => typeof v === "string"),
              ) as Record<string, string>}
            />
          </CardBody>
        </Card>
      ) : (
        <Alert tone="error">{t("errCompanyMissing")}</Alert>
      )}
    </div>
  );
}
