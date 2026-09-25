import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, Calculator, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBillingUser } from "@/lib/auth/dal";
import { deleteBillingContract } from "@/app/actions/billing";
import { parseCodeList } from "@/lib/billing/contract-config";
import { contractLabel, getProfileNames } from "@/lib/billing/queries";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { ContractForm } from "../contract-form";
import { ContractConfigEditor } from "../config-editor";
import { RangesTable } from "../../excluded-ranges/ranges";
import { RangeForm } from "../../excluded-ranges/range-form";
import { CalculationsTable } from "../../calculations-table";
import { ActionButton } from "../../action-button";

export default async function BillingContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ add?: string }>;
}) {
  const user = await requireBillingUser();
  const { id } = await params;
  const { add = "" } = await searchParams;
  const t = await getTranslations("Billing");
  const supabase = await createClient();

  const { data: contract } = await supabase
    .from("billing_contracts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!contract) notFound();

  const [{ data: items }, { data: excluded }, { data: ranges }, { data: calcs }] =
    await Promise.all([
      supabase
        .from("billing_contract_items")
        .select("*")
        .eq("contract_id", id)
        .order("sort_order")
        .order("name"),
      supabase
        .from("billing_excluded_codes")
        .select("ma_hang")
        .eq("contract_id", id)
        .order("ma_hang"),
      supabase
        .from("billing_excluded_ranges")
        .select("*")
        .eq("contract_id", id)
        .order("date_from", { ascending: false }),
      supabase
        .from("billing_rent_calculations")
        .select("id, contract_id, period_month, period_from, period_to, total_amount, status, created_at, created_by")
        .eq("contract_id", id)
        .order("period_from", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(12),
    ]);
  const names = await getProfileNames(supabase, (calcs ?? []).map((c) => c.created_by));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <ModuleEyebrow id="billing" />
          <h1 className={pageTitleClass}>{contract.customer_name}</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {contract.project_name} · {t("khoLabel", { kho: contract.misa_kho })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/billing?contract=${contract.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover"
          >
            <Calculator className="h-4 w-4" aria-hidden />
            {t("calculateForContract")}
          </Link>
          {user.profile.role === "admin" && (
            <ActionButton
              action={deleteBillingContract}
              id={contract.id}
              label={t("deleteContract")}
              title={t("deleteContract")}
              body={t("deleteContractBody", { name: contractLabel(contract) })}
              confirmLabel={t("deleteContract")}
              variant="danger"
              icon={<Trash2 className="h-4 w-4" aria-hidden />}
              iconOnly
            />
          )}
        </div>
      </div>

      {contract.is_demo && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>{t("demoBanner")}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("pricesTitle")}</CardTitle>
          <p className="mt-1 text-sm text-slate-500">{t("pricesSubtitle")}</p>
        </CardHeader>
        <CardBody>
          {/* Remount when "?add=" changes so the pre-added lines refresh. */}
          <ContractConfigEditor
            key={add}
            contractId={contract.id}
            items={(items ?? []).map((i) => ({
              name: i.name,
              unit: i.unit,
              unit_price: i.unit_price,
              ma_hang: i.ma_hang,
            }))}
            excluded={(excluded ?? []).map((e) => e.ma_hang)}
            addCodes={parseCodeList(add)}
          />
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("contractInfo")}</CardTitle>
          </CardHeader>
          <CardBody>
            <ContractForm contract={contract} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("contractRangesTitle")}</CardTitle>
            <p className="mt-1 text-sm text-slate-500">{t("contractRangesSubtitle")}</p>
          </CardHeader>
          <CardBody className="p-0">
            <RangesTable ranges={ranges ?? []} />
          </CardBody>
          <CardBody className="border-t border-slate-100">
            <RangeForm contractId={contract.id} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <CardTitle>{t("contractCalculations")}</CardTitle>
          <Link
            href={`/billing/history?contract=${contract.id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {t("viewAll")}
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          <CalculationsTable
            rows={calcs ?? []}
            contractLabels={new Map()}
            creatorNames={names}
            showContract={false}
          />
        </CardBody>
      </Card>
    </div>
  );
}
