import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, CheckCircle2, Download, Trash2, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBillingUser } from "@/lib/auth/dal";
import {
  confirmCalculation,
  deleteDraftCalculation,
  voidCalculation,
} from "@/app/actions/billing";
import { formatVnDate } from "@/lib/billing/dates";
import { formatBillingMonth } from "@/lib/billing/periods";
import { getProfileNames } from "@/lib/billing/queries";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DownloadLink } from "@/components/ui/download-link";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { ActionButton } from "../../action-button";
import { StatusBadge } from "../../status-badge";
import { ScopeNotice } from "../../scope-notice";

export default async function CalculationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireBillingUser();
  const { id } = await params;
  const t = await getTranslations("Billing");
  const supabase = await createClient();

  const { data: calc } = await supabase
    .from("billing_rent_calculations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!calc) notFound();

  const [{ data: uploads }, names] = await Promise.all([
    supabase
      .from("billing_misa_uploads")
      .select("id, file_name, file_from, file_to")
      .in("id", calc.upload_ids),
    getProfileNames(supabase, [calc.created_by, calc.confirmed_by, calc.voided_by]),
  ]);

  const { result, contract_snapshot: contract } = calc;
  const monthLabel = calc.period_month ? formatBillingMonth(calc.period_month) : null;
  const periodText = {
    from: formatVnDate(calc.period_from),
    to: formatVnDate(calc.period_to),
  };
  const isAdmin = user.profile.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <ModuleEyebrow id="billing" />
          <div className="flex flex-wrap items-center gap-3">
            <h1 className={pageTitleClass}>
              {monthLabel
                ? t("calcTitle", { month: monthLabel })
                : t("calcTitleRange", periodText)}
            </h1>
            <StatusBadge status={calc.status} />
          </div>
          <p className="mt-1.5 text-sm text-slate-600">
            <Link
              href={`/billing/contracts/${calc.contract_id}`}
              className="font-medium text-slate-900 hover:text-primary hover:underline"
            >
              {contract.customerName} – {contract.projectName}
            </Link>
            {" · "}
            {t("khoLabel", { kho: contract.misaKho })}
            {contract.contractNo && ` · ${t("contractNoLabel", { no: contract.contractNo })}`}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {monthLabel ? t("periodRange", periodText) : t("customRangeNote")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <DownloadLink
            href={`/api/billing/calculations/${calc.id}/xlsx`}
            className="h-8 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:border-primary hover:bg-primary hover:text-white"
          >
            <Download className="h-4 w-4" aria-hidden />
            {t("downloadExcel")}
          </DownloadLink>
          {calc.status === "draft" && (
            <>
              <ActionButton
                action={deleteDraftCalculation}
                id={calc.id}
                label={t("deleteDraft")}
                title={t("deleteDraft")}
                body={t("deleteDraftBody")}
                confirmLabel={t("deleteDraft")}
                variant="danger"
                icon={<Trash2 className="h-4 w-4" aria-hidden />}
              />
              {monthLabel && (
                <ActionButton
                  action={confirmCalculation}
                  id={calc.id}
                  label={t("confirm")}
                  title={t("confirmTitle")}
                  body={t("confirmBody", {
                    month: monthLabel,
                    total: formatNumber(calc.total_amount),
                  })}
                  confirmLabel={t("confirm")}
                  variant="primary"
                  icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
                />
              )}
            </>
          )}
          {calc.status === "confirmed" && isAdmin && (
            <ActionButton
              action={voidCalculation}
              id={calc.id}
              label={t("void")}
              title={t("voidTitle")}
              body={t("voidBody")}
              confirmLabel={t("void")}
              variant="danger"
              icon={<Undo2 className="h-4 w-4" aria-hidden />}
            />
          )}
        </div>
      </div>

      <ScopeNotice />

      {!monthLabel && calc.status === "draft" && (
        <Alert tone="info">{t("rangeNotConfirmable")}</Alert>
      )}

      {result.warnings.length > 0 && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {t("warningsTitle", { count: result.warnings.length })}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            {result.warnings.map((w, i) => (
              <li key={i} className="break-words">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>{t("summaryTitle")}</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t("item")}</th>
                  <th className="px-5 py-3 text-right font-medium">{t("unitPrice")}</th>
                  <th className="px-5 py-3 text-right font-medium">{t("closingQty")}</th>
                  <th className="px-5 py-3 text-right font-medium">{t("amount")}</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((it, idx) => (
                  <tr key={it.name} className="border-b border-slate-50 last:border-0">
                    <td data-label={t("item")} className="px-5 py-2.5">
                      <a href={`#item-${idx}`} className="font-medium text-slate-900 hover:text-primary">
                        {it.name}
                      </a>
                    </td>
                    <td data-label={t("unitPrice")} className="px-5 py-2.5 tabular-nums md:text-right">
                      {t("pricePerDay", { price: formatNumber(it.unitPrice), unit: it.unit.toLowerCase() })}
                    </td>
                    <td data-label={t("closingQty")} className="px-5 py-2.5 tabular-nums md:text-right">
                      {formatNumber(it.closingQty)} {it.unit.toLowerCase()}
                    </td>
                    <td
                      data-label={t("amount")}
                      className="px-5 py-2.5 font-medium tabular-nums text-slate-900 md:text-right"
                    >
                      {formatNumber(it.amount)}đ
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td colSpan={3} className="hidden px-5 py-3 font-bold text-slate-900 md:table-cell">
                    {t("rentTotal")}
                  </td>
                  <td
                    data-label={t("rentTotal")}
                    className="px-5 py-3 text-base font-bold tabular-nums text-slate-900 md:text-right"
                  >
                    {formatNumber(result.totalAmount)}đ
                  </td>
                </tr>
              </tfoot>
            </table>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card className="border-primary/30 bg-primary/5">
            <CardBody>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                {t("rentTotal")}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                {formatNumber(result.totalAmount)}đ
              </p>
              <p className="mt-1 text-xs text-slate-500">{t("rentTotalNote")}</p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3 text-sm">
              <Meta label={t("createdBy")}>
                {names.get(calc.created_by) ?? "—"} · {formatDateTime(calc.created_at)}
              </Meta>
              {calc.confirmed_at && (
                <Meta label={t("confirmedBy")}>
                  {names.get(calc.confirmed_by ?? "") ?? "—"} · {formatDateTime(calc.confirmed_at)}
                </Meta>
              )}
              {calc.voided_at && (
                <Meta label={t("voidedBy")}>
                  {names.get(calc.voided_by ?? "") ?? "—"} · {formatDateTime(calc.voided_at)}
                </Meta>
              )}
              <Meta label={t("misaFiles")}>
                <ul className="space-y-0.5">
                  {(uploads ?? []).map((u) => (
                    <li key={u.id} className="break-words">
                      {u.file_name}{" "}
                      <span className="text-slate-400">
                        ({formatVnDate(u.file_from)} – {formatVnDate(u.file_to)})
                      </span>
                    </li>
                  ))}
                  {(uploads ?? []).length < calc.upload_ids.length && (
                    <li className="text-slate-400">{t("fileDeleted")}</li>
                  )}
                </ul>
              </Meta>
              <Meta label={t("excludedRangesApplied")}>
                {calc.excluded_ranges.length === 0 ? (
                  <span className="text-slate-400">{t("none")}</span>
                ) : (
                  <ul className="space-y-0.5">
                    {calc.excluded_ranges.map((r) => (
                      <li key={`${r.from}-${r.to}`}>
                        {formatVnDate(r.from)} – {formatVnDate(r.to)}: {r.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </Meta>
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">{t("detailTitle")}</h2>
        {result.items.map((it, idx) => (
          <Card key={it.name} id={`item-${idx}`} className="scroll-mt-24">
            <CardHeader className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <CardTitle>
                {idx + 1}. {it.name}
              </CardTitle>
              <span className="text-sm text-slate-500">
                {t("pricePerDay", { price: formatNumber(it.unitPrice), unit: it.unit.toLowerCase() })}
              </span>
            </CardHeader>
            <CardBody className="p-0">
              <table className="responsive-table w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-slate-500">
                    <th className="px-5 py-2.5 font-medium">{t("lineDate")}</th>
                    <th className="px-5 py-2.5 font-medium">{t("lineRef")}</th>
                    <th className="px-5 py-2.5 text-right font-medium">{t("lineQty")}</th>
                    <th className="px-5 py-2.5 text-right font-medium">{t("lineDays")}</th>
                    <th className="px-5 py-2.5 text-right font-medium">{t("amount")}</th>
                    <th className="px-5 py-2.5 font-medium">{t("explain")}</th>
                  </tr>
                </thead>
                <tbody>
                  {it.lines.map((l, i) => (
                    <tr
                      key={`${l.ref}-${l.date}-${i}`}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td data-label={t("lineDate")} className="whitespace-nowrap px-5 py-2 tabular-nums">
                        {formatVnDate(l.date)}
                      </td>
                      <td data-label={t("lineRef")} className="px-5 py-2">
                        {l.kind === "ton-dau-ky" ? (
                          <span className="font-medium text-slate-700">{t("openingLine")}</span>
                        ) : (
                          <span className="font-mono text-xs text-slate-700">{l.ref}</span>
                        )}
                      </td>
                      <td
                        data-label={t("lineQty")}
                        className={`px-5 py-2 tabular-nums md:text-right ${l.qty < 0 ? "text-red-600" : "text-slate-900"}`}
                      >
                        {l.qty > 0 && l.kind === "phat-sinh" ? "+" : ""}
                        {formatNumber(l.qty)}
                      </td>
                      <td data-label={t("lineDays")} className="px-5 py-2 tabular-nums md:text-right">
                        {l.days}
                        {l.excludedDays > 0 && (
                          <span className="block text-xs text-amber-700">
                            {t("excludedDaysShort", { days: l.excludedDays })}
                          </span>
                        )}
                      </td>
                      <td
                        data-label={t("amount")}
                        className={`px-5 py-2 font-medium tabular-nums md:text-right ${l.amount < 0 ? "text-red-600" : "text-slate-900"}`}
                      >
                        {formatNumber(l.amount)}đ
                      </td>
                      <td data-label={t("explain")} className="px-5 py-2 text-xs text-slate-500">
                        {l.explain}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                    <td className="hidden px-5 py-2.5 md:table-cell" colSpan={2}>
                      {t("sumLine")}
                    </td>
                    <td data-label={t("closingQty")} className="px-5 py-2.5 tabular-nums md:text-right">
                      {formatNumber(it.closingQty)}
                    </td>
                    <td className="hidden md:table-cell" />
                    <td data-label={t("sumLine")} className="px-5 py-2.5 tabular-nums md:text-right">
                      {formatNumber(it.amount)}đ
                    </td>
                    <td className="hidden md:table-cell" />
                  </tr>
                </tfoot>
              </table>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-0.5 text-slate-700">{children}</div>
    </div>
  );
}
