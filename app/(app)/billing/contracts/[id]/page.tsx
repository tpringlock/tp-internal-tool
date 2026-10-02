import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, Calculator, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { canEditBilling } from "@/lib/auth/roles";
import { deleteBillingContract } from "@/app/actions/billing";
import { parseCodeList } from "@/lib/billing/contract-config";
import { contractLabel, getProfileNames } from "@/lib/billing/queries";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { ContractForm } from "../contract-form";
import { ContractPresetForm } from "../contract-preset-form";
import { PriceLinesEditor } from "../price-lines-editor";
import { loadActiveCatalog } from "@/lib/billing/month-files-server";
import { normalizeCode } from "@/lib/billing/text";
import { RangesTable } from "../../excluded-ranges/ranges";
import { RangeForm } from "../../excluded-ranges/range-form";
import { CalculationsTable } from "../../calculations-table";
import { ActionButton } from "../../action-button";
import { ContractHsttTab } from "../hstt/contract-hstt-tab";
import { cn } from "@/lib/utils";

export default async function BillingContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ add?: string; tab?: string }>;
}) {
  const user = await requireBillingViewer();
  const canEdit = canEditBilling(user.profile.role);
  const { id } = await params;
  const { add = "", tab } = await searchParams;
  const hsttTab = tab === "hstt";
  const t = await getTranslations("Billing");
  const supabase = await createClient();

  const { data: contract } = await supabase
    .from("billing_contracts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!contract) notFound();

  const [{ data: lines }, { catalog }, { data: ranges }, { data: calcs }, { data: presets }, { data: presetLink }] =
    await Promise.all([
      supabase
        .from("billing_price_lines")
        .select("*")
        .eq("contract_id", id)
        .order("sort_order")
        .order("ma_vt"),
      loadActiveCatalog(supabase, { fill: false }),
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
      supabase.from("billing_period_presets").select("id, name, active").order("sort_order").order("name"),
      supabase.from("billing_contract_period_presets").select("preset_id").eq("contract_id", id).maybeSingle(),
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
          {canEdit && (
          <Link
            href={`/billing?contract=${contract.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover"
          >
            <Calculator className="h-4 w-4" aria-hidden />
            {t("calculateForContract")}
          </Link>
          )}
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

      <nav aria-label={t("contractTabs")} className="flex gap-1 border-b border-slate-200">
        {[
          { href: `/billing/contracts/${contract.id}`, label: t("tabGeneral"), active: !hsttTab },
          { href: `/billing/contracts/${contract.id}?tab=hstt`, label: t("tabHstt"), active: hsttTab },
        ].map((x) => (
          <Link
            key={x.href}
            href={x.href}
            aria-current={x.active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              x.active ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-900",
            )}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {hsttTab ? (
        <ContractHsttTab contract={contract} canEdit={canEdit} />
      ) : (
      <>
      <Card>
        <CardHeader>
          <CardTitle>{t("pricesTitle")}</CardTitle>
          <p className="mt-1 text-sm text-slate-500">{t("pricesSubtitle")}</p>
        </CardHeader>
        <CardBody>
          {/* Remount when "?add=" changes so the pre-added lines refresh. */}
          <PriceLinesEditor
            key={add}
            contractId={contract.id}
            lines={(lines ?? []).map((l) => ({
              ma_vt: l.ma_vt,
              ten_vt: l.ten_vt,
              dvt: l.dvt,
              unit_price: l.unit_price,
              print_name: l.print_name,
              print_dvt: l.print_dvt,
              note: l.note,
            }))}
            addCodes={canEdit ? parseCodeList(add) : []}
            misa={misaFor(catalog, [...(lines ?? []).map((l) => l.ma_vt), ...parseCodeList(add)])}
            readOnly={!canEdit}
          />
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("contractInfo")}</CardTitle>
          </CardHeader>
          <CardBody>
            <ContractForm contract={contract} readOnly={!canEdit} />
          </CardBody>
          {presets && presets.length > 0 && (
            <CardBody className="border-t border-slate-100">
              <ContractPresetForm
                contractId={contract.id}
                presetId={presetLink?.preset_id ?? null}
                presets={presets}
                readOnly={!canEdit}
              />
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("contractRangesTitle")}</CardTitle>
            <p className="mt-1 text-sm text-slate-500">{t("contractRangesSubtitle")}</p>
          </CardHeader>
          <CardBody className="p-0">
            <RangesTable ranges={ranges ?? []} canDelete={canEdit} />
          </CardBody>
          {canEdit && (
            <CardBody className="border-t border-slate-100">
              <RangeForm contractId={contract.id} />
            </CardBody>
          )}
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
      </>
      )}
    </div>
  );
}

/** MISA name/unit of the given codes only (the full catalog stays on the server). */
function misaFor(
  catalog: Awaited<ReturnType<typeof loadActiveCatalog>>["catalog"],
  codes: string[],
): Record<string, { name: string; dvt: string }> | null {
  if (!catalog) return null;
  const out: Record<string, { name: string; dvt: string }> = {};
  for (const c of codes.map(normalizeCode)) if (catalog.items[c]) out[c] = catalog.items[c];
  return out;
}
