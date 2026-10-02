import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { rentReportSchema } from "@/lib/validation";
import { formatVnDate } from "@/lib/billing/dates";
import { formatBillingMonth } from "@/lib/billing/periods";
import { getShowDemo } from "@/lib/billing/queries";
import { loadReportInput, reportFormValues, reportPeriodInput } from "@/lib/billing/rent-report-server";
import { computeReportProject, splitLedgerByWarehouse } from "@/lib/billing/rent-report";
import { normalizeCode } from "@/lib/billing/misa-parser";
import type { RentResult } from "@/lib/billing/types";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { RentItemCards, RentSummaryTable } from "../../../rent-result-tables";

export const maxDuration = 60;

/**
 * One project of the rent report: every voucher, like the calculation page,
 * recalculated from the active month files. Read-only: nothing is saved
 * (to keep or confirm it, calculate it on /billing).
 */
export default async function ReportProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireBillingViewer();
  const t = await getTranslations("BillingReports");
  const { id } = await params;
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const parsed = rentReportSchema.safeParse({ ...reportFormValues(one, () => [id]) });

  let error: string | null = null;
  let label = "";
  let isDemo = false;
  let result: RentResult | null = null;
  let files: string[] = [];
  if (!parsed.success) {
    error = t("badLink");
  } else {
    const supabase = await createClient();
    try {
      const loaded = await loadReportInput(supabase, {
        contractIds: [id],
        period: reportPeriodInput(parsed.data),
        includeDemo: await getShowDemo(),
      });
      if (!loaded.ok) {
        error = loaded.error;
      } else {
        const c = loaded.contracts[0];
        label = c.label;
        isDemo = c.isDemo;
        files = loaded.files.map((f) => `${formatBillingMonth(f.month)} v${f.version} (${f.file_name})`);
        const sub = splitLedgerByWarehouse(loaded.ledger).get(normalizeCode(c.misaKho)) ?? loaded.ledger;
        result = computeReportProject(sub, c);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <ModuleEyebrow id="billing" />
        <h1 className={pageTitleClass}>{label || t("detailTitle")}</h1>
        {result && (
          <p className="mt-1.5 text-sm text-slate-500">
            {t("periodPreview", { from: formatVnDate(result.period.from), to: formatVnDate(result.period.to) })}
            {" · "}
            {t("filesUsed", { files: files.join(", ") })}
          </p>
        )}
      </div>

      {isDemo && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>{t("demoProject")}</p>
        </div>
      )}

      <Alert tone="info">
        {t("detailNote")}{" "}
        <Link href={`/billing?contract=${id}`} className="font-medium underline">
          {t("openCalculate")}
        </Link>
      </Alert>

      {error && <Alert tone="error">{error}</Alert>}

      {result && (
        <>
          {result.warnings.length > 0 && (
            <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                {t("warningCount", { count: result.warnings.length })}
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{t("summaryTitle")}</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <RentSummaryTable result={result} />
            </CardBody>
          </Card>
          <div className="space-y-4">
            <RentItemCards result={result} />
          </div>
        </>
      )}
    </div>
  );
}
