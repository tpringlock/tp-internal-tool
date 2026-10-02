import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { defaultBillingMonth, nextMonth, recentMonths } from "@/lib/billing/periods";
import { presetPeriod } from "@/lib/billing/period-presets";
import { contractLabel, getActivePresets, getContractsWithCounts, getShowDemo, todayIct } from "@/lib/billing/queries";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { ReportForm } from "./report-form";

/** The report action (on this page) reads every month file and runs 200+ contracts. */
export const maxDuration = 60;

const MONTHS_SHOWN = 24;

/**
 * Rent report over many projects (plan section 4): read-only, open to every
 * billing role including "Chỉ xem". Demo contracts are offered only while
 * "Hiện dữ liệu giả định" is on.
 */
export default async function RentReportPage() {
  await requireBillingViewer();
  const t = await getTranslations("BillingReports");
  const supabase = await createClient();
  const showDemo = await getShowDemo();
  const [contracts, presets] = await Promise.all([getContractsWithCounts(supabase, showDemo), getActivePresets(supabase)]);

  const suggested = defaultBillingMonth(todayIct());
  const months = recentMonths(nextMonth(suggested), MONTHS_SHOWN);
  const running = presetPeriod({ start_day: 26, months: 1 }, nextMonth(suggested));

  return (
    <div className="space-y-6">
      <div>
        <ModuleEyebrow id="billing" />
        <h1 className={pageTitleClass}>{t("title")}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t("subtitle")}</p>
      </div>

      <ReportForm
        contracts={contracts.map((c) => ({
          id: c.id,
          label: contractLabel(c),
          misaKho: c.misa_kho,
          active: c.active,
          isDemo: c.is_demo,
          keywords: [c.misa_kho, c.misa_kho_name, c.customer_name, c.contract_no, c.project_name],
        }))}
        presets={presets}
        months={months}
        defaultMonth={suggested}
        defaultRange={{ from: running.from, to: todayIct() }}
      />
    </div>
  );
}
