import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { alertsPeriodSchema } from "@/lib/validation";
import { formatVnDate } from "@/lib/billing/dates";
import { defaultBillingMonth, formatBillingMonth, nextMonth, recentMonths } from "@/lib/billing/periods";
import { getActivePresets, getShowDemo, todayIct } from "@/lib/billing/queries";
import { alertsInputFrom, runAlerts } from "@/lib/billing/alerts-server";
import { COMPANY_WAREHOUSE_RULES } from "@/lib/billing/company-warehouses";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { AlertsPeriodForm, type AlertsPeriodValue } from "./alerts-period-form";
import { AlertsView } from "./alerts-view";

/** Reads the month files of the period and checks every warehouse. */
export const maxDuration = 60;

const MONTHS_SHOWN = 24;

/**
 * Alert center (plan section 5): negative stock, codes without a price,
 * warehouses without a contract, price-table codes/warehouses gone from MISA,
 * names / units different from MISA. Read-only, for every billing role.
 * The period comes from the URL (GET form).
 */
export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireBillingViewer();
  const t = await getTranslations("BillingAlerts");
  const sp = await searchParams;
  const supabase = await createClient();
  const [presets, showDemo] = await Promise.all([getActivePresets(supabase), getShowDemo()]);

  const suggested = defaultBillingMonth(todayIct());
  const months = recentMonths(nextMonth(suggested), MONTHS_SHOWN);
  const first = presets[0];
  const raw = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = alertsPeriodSchema.safeParse(
    raw.mode ? raw : { mode: "preset", start_day: first.start_day, months: first.months, month: suggested },
  );

  const value: AlertsPeriodValue = {
    mode: parsed.success ? parsed.data.mode : "preset",
    start_day: parsed.success && parsed.data.mode === "preset" ? parsed.data.start_day : first.start_day,
    months: parsed.success && parsed.data.mode === "preset" ? parsed.data.months : first.months,
    month: parsed.success && parsed.data.mode === "preset" ? parsed.data.month : suggested,
    date_from: parsed.success && parsed.data.mode === "range" ? parsed.data.date_from : "",
    date_to: parsed.success && parsed.data.mode === "range" ? parsed.data.date_to : "",
  };
  const query = new URLSearchParams(
    value.mode === "preset"
      ? { mode: "preset", start_day: String(value.start_day), months: String(value.months), month: value.month }
      : { mode: "range", date_from: value.date_from, date_to: value.date_to },
  ).toString();

  let run = null;
  let error: string | null = parsed.success ? null : t("badPeriod");
  if (parsed.success) {
    try {
      run = await runAlerts(supabase, alertsInputFrom(parsed.data), showDemo);
      if (!run.ok) error = run.error;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <ModuleEyebrow id="billing" />
        <h1 className={pageTitleClass}>{t("title")}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t("subtitle")}</p>
      </div>

      <Card data-tour="alerts-period">
        <CardBody className="space-y-3">
          <AlertsPeriodForm presets={presets} months={months} value={value} />
          {run?.ok && (
            <p className="text-xs text-slate-500">
              {t("periodLine", {
                from: formatVnDate(run.period.from),
                to: formatVnDate(run.period.to),
                files: run.files.map((f) => `${formatBillingMonth(f.month)} v${f.version}`).join(", "),
                seconds: (run.loadMs / 1000).toFixed(1),
              })}
            </p>
          )}
        </CardBody>
      </Card>

      {showDemo && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>{t("demoOn")}</p>
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {run?.ok && <AlertsView alerts={run.alerts} query={query} />}

      <details className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600" data-tour="alerts-rules">
        <summary className="cursor-pointer font-medium text-slate-800">{t("rulesTitle")}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {(["negative_stock", "missing_price", "no_contract", "not_in_misa", "name_mismatch"] as const).map((k) => (
            <li key={k}>
              <span className="font-medium">{t(`kind.${k}`)}:</span> {t(`rule.${k}`)}
            </li>
          ))}
        </ul>
        <p className="mt-3 font-medium text-slate-800">{t("companyTitle")}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {COMPANY_WAREHOUSE_RULES.map((r) => (
            <li key={`${r.match}-${r.value}`}>
              <span className="font-mono text-xs">{r.value}</span> ({t(`match.${r.match}`)}): {r.reason}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">{t("companyNote")}</p>
      </details>
    </div>
  );
}
