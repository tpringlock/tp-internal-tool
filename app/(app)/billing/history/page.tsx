import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireBillingUser } from "@/lib/auth/dal";
import {
  contractLabel,
  getContractLabels,
  getContractsWithCounts,
  getProfileNames,
} from "@/lib/billing/queries";
import type { BillingCalcStatus } from "@/lib/db/types";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { CalculationsTable } from "../calculations-table";

const PAGE_SIZE = 30;
const STATUSES: BillingCalcStatus[] = ["draft", "confirmed", "voided"];
/** Billing-month (HSTT) calculations vs custom date ranges. */
const KINDS = ["month", "range"] as const;
type Kind = (typeof KINDS)[number];

export default async function BillingHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ contract?: string; status?: string; kind?: string; page?: string }>;
}) {
  await requireBillingUser();
  const sp = await searchParams;
  const t = await getTranslations("Billing");
  const supabase = await createClient();

  const pageNum = Math.max(1, Number(sp.page) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;
  const contracts = await getContractsWithCounts(supabase);
  const contractId = contracts.some((c) => c.id === sp.contract) ? sp.contract! : "";
  const status = STATUSES.includes(sp.status as BillingCalcStatus)
    ? (sp.status as BillingCalcStatus)
    : "";
  const kind = KINDS.includes(sp.kind as Kind) ? (sp.kind as Kind) : "";

  let query = supabase
    .from("billing_rent_calculations")
    .select(
      "id, contract_id, period_month, period_from, period_to, total_amount, status, created_at, created_by",
      { count: "exact" },
    )
    .order("period_from", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (contractId) query = query.eq("contract_id", contractId);
  if (status) query = query.eq("status", status);
  if (kind === "month") query = query.not("period_month", "is", null);
  if (kind === "range") query = query.is("period_month", null);
  const { data, count } = await query;

  const rows = data ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const [labels, names] = await Promise.all([
    getContractLabels(supabase, rows.map((r) => r.contract_id)),
    getProfileNames(supabase, rows.map((r) => r.created_by)),
  ]);
  const hrefForPage = (p: number) => {
    const q = new URLSearchParams();
    if (contractId) q.set("contract", contractId);
    if (status) q.set("status", status);
    if (kind) q.set("kind", kind);
    q.set("page", String(p));
    return `/billing/history?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <ModuleEyebrow id="billing" />
        <h1 className={pageTitleClass}>{t("historyTitle")}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t("historySubtitle")}</p>
      </div>

      <Card>
        <CardBody>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:min-w-56 sm:flex-1">
              <label htmlFor="h-contract" className="mb-1 block text-xs font-medium text-slate-500">
                {t("contract")}
              </label>
              <Select id="h-contract" name="contract" defaultValue={contractId}>
                <option value="">{t("allContracts")}</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {contractLabel(c)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full sm:w-44">
              <label htmlFor="h-status" className="mb-1 block text-xs font-medium text-slate-500">
                {t("statusLabel")}
              </label>
              <Select id="h-status" name="status" defaultValue={status}>
                <option value="">{t("allStatuses")}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status_${s}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full sm:w-48">
              <label htmlFor="h-kind" className="mb-1 block text-xs font-medium text-slate-500">
                {t("kindLabel")}
              </label>
              <Select id="h-kind" name="kind" defaultValue={kind}>
                <option value="">{t("allKinds")}</option>
                <option value="month">{t("modeMonth")}</option>
                <option value="range">{t("modeRange")}</option>
              </Select>
            </div>
            <Button type="submit" variant="secondary" className="w-full sm:w-auto">
              {t("filter")}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("calculationCount", { count: total })}</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <CalculationsTable rows={rows} contractLabels={labels} creatorNames={names} />
        </CardBody>
      </Card>

      <Pagination page={pageNum} totalPages={totalPages} total={total} hrefForPage={hrefForPage} />
    </div>
  );
}
