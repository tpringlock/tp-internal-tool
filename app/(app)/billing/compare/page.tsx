import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBillingUser } from "@/lib/auth/dal";
import { Card, CardBody } from "@/components/ui/card";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { CompareForm } from "./compare-form";

/**
 * Admin-only: run every demo ("giả định") contract over a date range and
 * list totals per warehouse, to check against the Excel tool's report.
 */
export default async function BillingComparePage() {
  const user = await requireBillingUser();
  if (user.profile.role !== "admin") redirect("/billing");
  const t = await getTranslations("Billing");
  const supabase = await createClient();

  const [{ data: uploads }, { count: demoCount }] = await Promise.all([
    supabase
      .from("billing_misa_uploads")
      .select("id, file_name, file_from, file_to, created_at")
      .order("file_from", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("billing_contracts")
      .select("id", { count: "exact", head: true })
      .eq("is_demo", true),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <ModuleEyebrow id="billing" />
        <h1 className={pageTitleClass}>{t("compareTitle")}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t("compareSubtitle")}</p>
      </div>

      <div
        role="alert"
        className="flex items-start gap-3 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p>{t("compareBanner", { count: demoCount ?? 0 })}</p>
      </div>

      <Card>
        <CardBody>
          <CompareForm uploads={uploads ?? []} demoCount={demoCount ?? 0} />
        </CardBody>
      </Card>
    </div>
  );
}
