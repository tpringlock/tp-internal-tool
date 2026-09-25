import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireBillingUser } from "@/lib/auth/dal";
import { contractLabel, getContractsWithCounts } from "@/lib/billing/queries";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { DialogButton } from "@/components/dialog-button";
import { RangesTable } from "./ranges";
import { RangeForm } from "./range-form";

export default async function ExcludedRangesPage() {
  await requireBillingUser();
  const t = await getTranslations("Billing");
  const supabase = await createClient();

  const [{ data }, contracts] = await Promise.all([
    supabase
      .from("billing_excluded_ranges")
      .select("*")
      .order("date_from", { ascending: false }),
    getContractsWithCounts(supabase),
  ]);
  const labels = new Map(contracts.map((c) => [c.id, contractLabel(c)]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <ModuleEyebrow id="billing" />
          <h1 className={pageTitleClass}>{t("rangesTitle")}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t("rangesSubtitle")}</p>
        </div>
        <DialogButton label={t("addRange")}>
          <RangeForm contracts={contracts.map((c) => ({ id: c.id, label: contractLabel(c) }))} />
        </DialogButton>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("rangeCount", { count: data?.length ?? 0 })}</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <RangesTable ranges={data ?? []} contractLabels={labels} />
        </CardBody>
      </Card>
    </div>
  );
}
