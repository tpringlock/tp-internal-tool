import { getTranslations } from "next-intl/server";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { deletePeriodPreset } from "@/app/actions/billing-periods";
import { formatVnDate } from "@/lib/billing/dates";
import { defaultBillingMonth, formatBillingMonth } from "@/lib/billing/periods";
import { presetPeriod, presetUsage } from "@/lib/billing/period-presets";
import { todayIct } from "@/lib/billing/queries";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { DialogButton } from "@/components/dialog-button";
import { ActionButton } from "../action-button";
import { PresetForm } from "./preset-form";
import { EditPresetButton } from "./edit-preset-button";

/** Period presets ("mẫu kỳ"): everyone in billing reads, admins edit (0040). */
export default async function PeriodPresetsPage() {
  const user = await requireBillingViewer();
  const isAdmin = user.profile.role === "admin";
  const t = await getTranslations("BillingPresets");
  const supabase = await createClient();

  const [{ data: presets, error }, { data: links }] = await Promise.all([
    supabase.from("billing_period_presets").select("*").order("sort_order").order("name"),
    supabase.from("billing_contract_period_presets").select("preset_id"),
  ]);
  const usedBy = presetUsage(links ?? []);
  const exampleMonth = defaultBillingMonth(todayIct());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <ModuleEyebrow id="billing" />
          <h1 className={pageTitleClass}>{t("title")}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        {isAdmin && !error && (
          <DialogButton label={t("add")}>
            <PresetForm exampleMonth={exampleMonth} />
          </DialogButton>
        )}
      </div>

      {error && <Alert tone="error">{t("notMigrated")}</Alert>}
      {!isAdmin && <Alert tone="info">{t("adminOnlyNotice")}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>{t("count", { count: presets?.length ?? 0 })}</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <table className="responsive-table w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="px-5 py-3 font-medium">{t("name")}</th>
                <th className="px-5 py-3 font-medium">{t("rule")}</th>
                <th className="px-5 py-3 font-medium">
                  {t("exampleHeader", { month: formatBillingMonth(exampleMonth) })}
                </th>
                <th className="px-5 py-3 font-medium">{t("status")}</th>
                {isAdmin && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody>
              {(presets ?? []).map((p) => {
                const ex = presetPeriod(p, exampleMonth);
                const used = usedBy.get(p.id) ?? 0;
                return (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0">
                    <td data-label={t("name")} className="px-5 py-3 font-medium text-slate-900">
                      {p.name}
                      {used > 0 && (
                        <span className="block text-xs font-normal text-slate-500">
                          {t("usedBy", { count: used })}
                        </span>
                      )}
                    </td>
                    <td data-label={t("rule")} className="px-5 py-3 text-slate-700">
                      {p.start_day === 1
                        ? t("ruleCalendar", { months: p.months })
                        : t("ruleDay", { start: p.start_day, end: p.start_day - 1, months: p.months })}
                    </td>
                    <td
                      data-label={t("exampleHeader", { month: formatBillingMonth(exampleMonth) })}
                      className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-700"
                    >
                      {formatVnDate(ex.from)} – {formatVnDate(ex.to)}
                    </td>
                    <td data-label={t("status")} className="px-5 py-3">
                      {p.active ? (
                        <span className="text-green-700">{t("active")}</span>
                      ) : (
                        <span className="text-slate-400">{t("inactive")}</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <EditPresetButton preset={p} exampleMonth={exampleMonth} />
                          <ActionButton
                            action={deletePeriodPreset}
                            id={p.id}
                            label={t("delete")}
                            title={t("delete")}
                            body={used > 0 ? t("errInUse", { count: used }) : t("deleteBody", { name: p.name })}
                            confirmLabel={t("delete")}
                            variant="danger"
                            icon={<Trash2 className="h-4 w-4" aria-hidden />}
                            iconOnly
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(presets ?? []).length === 0 && !error && (
            <p className="px-5 py-6 text-sm text-slate-500">{t("empty")}</p>
          )}
        </CardBody>
      </Card>

      <p className="text-sm text-slate-500">{t("confirmRule")}</p>
    </div>
  );
}
