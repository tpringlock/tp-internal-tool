import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireBillingUser } from "@/lib/auth/dal";
import {
  contractPeriod,
  defaultBillingMonth,
  nextMonth,
  recentMonths,
} from "@/lib/billing/periods";
import {
  contractLabel,
  getContractLabels,
  getContractsWithCounts,
  getProfileNames,
  getShowDemo,
  todayIct,
} from "@/lib/billing/queries";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { CalculateForm } from "./calculate-form";
import { UploadDropzone } from "./upload-dropzone";
import { CalculationsTable } from "./calculations-table";
import { ScopeNotice } from "./scope-notice";

/** Months offered in the picker (newest = the month after the suggested one). */
const MONTHS_SHOWN = 24;

export default async function BillingCalculatePage({
  searchParams,
}: {
  searchParams: Promise<{ contract?: string; month?: string }>;
}) {
  await requireBillingUser();
  const sp = await searchParams;
  const t = await getTranslations("Billing");
  const supabase = await createClient();
  const showDemo = await getShowDemo();

  let recentQuery = supabase
    .from("billing_rent_calculations")
    .select("id, contract_id, period_month, period_from, period_to, total_amount, status, created_at, created_by")
    .order("created_at", { ascending: false })
    .limit(5);
  if (!showDemo) recentQuery = recentQuery.eq("is_demo", false);

  const [contracts, { data: uploads }, { data: recent }] = await Promise.all([
    getContractsWithCounts(supabase, showDemo),
    supabase
      .from("billing_misa_uploads")
      .select("id, file_name, file_from, file_to, layout, created_at, warnings")
      .order("file_from", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    recentQuery,
  ]);

  const active = contracts.filter((c) => c.active);
  const suggested = defaultBillingMonth(todayIct());
  const months = recentMonths(nextMonth(suggested), MONTHS_SHOWN);
  const defaultMonth = sp.month && months.includes(sp.month) ? sp.month : suggested;
  const defaultContractId =
    active.find((c) => c.id === sp.contract)?.id ?? active[0]?.id ?? "";
  // Custom range defaults to "the running period so far": its start -> today.
  const today = todayIct();
  const running = contractPeriod(nextMonth(suggested), 26, null);
  const defaultRange = { from: running.from, to: today };

  const rows = recent ?? [];
  const [labels, names] = await Promise.all([
    getContractLabels(supabase, rows.map((r) => r.contract_id)),
    getProfileNames(supabase, rows.map((r) => r.created_by)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <ModuleEyebrow id="billing" />
        <h1 className={pageTitleClass}>{t("calculateTitle")}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t("calculateSubtitle")}</p>
      </div>

      <ScopeNotice />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>{t("step2Title")}</CardTitle>
          </CardHeader>
          <CardBody>
            <CalculateForm
              contracts={active.map((c) => ({
                id: c.id,
                label: contractLabel(c),
                misa_kho: c.misa_kho,
                period_start_day: c.period_start_day,
                contract_start: c.contract_start,
                item_count: c.item_count,
              }))}
              uploads={(uploads ?? []).map((u) => ({
                id: u.id,
                file_name: u.file_name,
                file_from: u.file_from,
                file_to: u.file_to,
                layout: u.layout,
                created_at: u.created_at,
                warning_count: u.warnings.length,
              }))}
              months={months}
              defaultContractId={defaultContractId}
              defaultMonth={defaultMonth}
              defaultRange={defaultRange}
            />
          </CardBody>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t("step1Title")}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-500">{t("step1Hint")}</p>
            <UploadDropzone compact />
            <Link
              href="/billing/uploads"
              className="inline-block text-sm font-medium text-primary hover:underline"
            >
              {t("manageUploads")}
            </Link>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <CardTitle>{t("recentCalculations")}</CardTitle>
          <Link href="/billing/history" className="text-sm font-medium text-primary hover:underline">
            {t("viewAll")}
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          <CalculationsTable rows={rows} contractLabels={labels} creatorNames={names} />
        </CardBody>
      </Card>
    </div>
  );
}
