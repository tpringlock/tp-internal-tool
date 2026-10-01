import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, Download, FileDown, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { canEditBilling } from "@/lib/auth/roles";
import { loadActiveCatalog } from "@/lib/billing/month-files-server";
import { buildPriceTable, hasMisaIssue } from "@/lib/billing/price-table";
import { contractLabel, getAllPriceLines, getProfileNames } from "@/lib/billing/queries";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DownloadLink } from "@/components/ui/download-link";
import { Pagination } from "@/components/ui/pagination";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { cn } from "@/lib/utils";
import { PriceFilters } from "./price-filters";

const PAGE_SIZE = 100;

/**
 * The flat price table (feedback items 2, 3): one row per (warehouse, MISA
 * code) for every real contract, with MISA name/unit differences flagged,
 * filters, Excel export of what is shown, and the import history.
 */
export default async function BillingPricesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; contract?: string; issues?: string; page?: string }>;
}) {
  const user = await requireBillingViewer();
  const canEdit = canEditBilling(user.profile.role);
  const sp = await searchParams;
  const t = await getTranslations("BillingPrices");
  const supabase = await createClient();

  const [{ data: contracts }, lines, { catalog, missing }, { data: imports }] = await Promise.all([
    supabase
      .from("billing_contracts")
      .select("id, code, misa_kho, misa_kho_name, contract_no, customer_name, project_name")
      .eq("is_demo", false)
      .order("customer_name"),
    getAllPriceLines(supabase, { demo: false }),
    loadActiveCatalog(supabase, { fill: false }),
    supabase.from("billing_price_imports").select("*").order("created_at", { ascending: false }).limit(10),
  ]);
  const filter = { q: sp.q?.trim() || undefined, contract: sp.contract || undefined, issues: sp.issues === "1" };
  const rows = buildPriceTable(contracts ?? [], lines, catalog, filter);
  const issueCount = filter.issues ? rows.length : rows.filter(hasMisaIssue).length;

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageNum = Math.min(totalPages, Math.max(1, Number(sp.page) || 1));
  const shown = rows.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE);
  const names = await getProfileNames(supabase, (imports ?? []).map((i) => i.created_by));

  const query = new URLSearchParams();
  if (filter.q) query.set("q", filter.q);
  if (filter.contract) query.set("contract", filter.contract);
  if (filter.issues) query.set("issues", "1");
  const qs = query.toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <ModuleEyebrow id="billing" />
          <h1 className={pageTitleClass}>{t("title")}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DownloadLink
            href={`/api/billing/prices/xlsx${qs ? `?${qs}` : ""}`}
            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 hover:border-primary hover:text-primary"
          >
            <Download className="h-4 w-4" aria-hidden />
            {filter.q || filter.contract || filter.issues ? t("exportFiltered", { count: total }) : t("exportAll")}
          </DownloadLink>
          <DownloadLink
            href="/api/billing/prices/template"
            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 hover:border-primary hover:text-primary"
          >
            <FileDown className="h-4 w-4" aria-hidden />
            {t("template")}
          </DownloadLink>
          {canEdit && (
            <Link
              href="/billing/prices/import"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-hover"
            >
              <Upload className="h-4 w-4" aria-hidden />
              {t("import")}
            </Link>
          )}
        </div>
      </div>

      <PriceFilters
        contracts={(contracts ?? []).map((c) => ({
          id: c.id,
          label: contractLabel(c),
          keywords: [c.misa_kho, c.misa_kho_name, c.customer_name, c.contract_no, c.project_name],
        }))}
        q={filter.q ?? ""}
        contract={filter.contract ?? ""}
        issues={filter.issues}
      />

      {!catalog ? (
        <p className="text-sm text-slate-500">{t("noCatalog")}</p>
      ) : (
        missing > 0 && <p className="text-sm text-slate-500">{t("catalogPartial", { count: missing })}</p>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t("rowCount", { count: total })}</CardTitle>
          {catalog && issueCount > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {t("issueCount", { count: issueCount })}
            </span>
          )}
        </CardHeader>
        <CardBody className="p-0">
          {shown.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">{t("noRowsFound")}</p>
          ) : (
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">{t("colWarehouse")}</th>
                  <th className="px-4 py-3 font-medium">{t("colCode")}</th>
                  <th className="px-4 py-3 font-medium">{t("colName")}</th>
                  <th className="px-4 py-3 font-medium">{t("colUnit")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("colPrice")}</th>
                  <th className="px-4 py-3 font-medium">{t("colPrinted")}</th>
                  <th className="px-4 py-3 font-medium">{t("colNote")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className={cn("border-b border-slate-50 align-top last:border-0", r.unit_price === 0 && "bg-slate-50/70")}>
                    <td data-label={t("colWarehouse")} className="px-4 py-2.5">
                      <Link href={`/billing/contracts/${r.contract_id}`} className="font-mono text-xs text-slate-900 hover:text-primary hover:underline">
                        {r.misa_kho}
                      </Link>
                      {r.khoNotInMisa && <Flag text={t("khoNotInMisa")} />}
                      <span className="block text-xs text-slate-500">
                        {r.customer_name}
                        {r.contract_no && ` · ${r.contract_no}`}
                      </span>
                    </td>
                    <td data-label={t("colCode")} className="px-4 py-2.5 font-mono text-xs">
                      {r.ma_vt}
                      {r.codeNotInMisa && <Flag text={t("codeNotInMisa")} />}
                    </td>
                    <td data-label={t("colName")} className="px-4 py-2.5 md:max-w-xs">
                      <span className="break-words">{r.ten_vt || <span className="text-slate-400">—</span>}</span>
                      {r.misaName && <Flag text={t("misaIs", { value: r.misaName })} />}
                    </td>
                    <td data-label={t("colUnit")} className="px-4 py-2.5">
                      {r.dvt || <span className="text-slate-400">—</span>}
                      {r.misaDvt && <Flag text={t("misaIs", { value: r.misaDvt })} />}
                    </td>
                    <td data-label={t("colPrice")} className="px-4 py-2.5 tabular-nums md:text-right">
                      {r.unit_price === 0 ? <span className="text-slate-500">{t("notBilled")}</span> : formatNumber(r.unit_price)}
                    </td>
                    <td data-label={t("colPrinted")} className="px-4 py-2.5 text-xs text-slate-600 md:max-w-xs">
                      {r.print_name || r.print_dvt ? (
                        <span className="break-words">
                          {r.print_name ?? t("sameAsMisa")}
                          {r.print_dvt && ` · ${r.print_dvt}`}
                        </span>
                      ) : (
                        <span className="text-slate-400">{t("sameAsMisa")}</span>
                      )}
                    </td>
                    <td data-label={t("colNote")} className="px-4 py-2.5 text-xs text-slate-600">
                      {r.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Pagination
        page={pageNum}
        totalPages={totalPages}
        total={total}
        hrefForPage={(p) => {
          const q = new URLSearchParams(query);
          q.set("page", String(p));
          return `/billing/prices?${q.toString()}`;
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("importsTitle")}</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {(imports ?? []).length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">{t("noImports")}</p>
          ) : (
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">{t("colWhen")}</th>
                  <th className="px-4 py-3 font-medium">{t("colFile")}</th>
                  <th className="px-4 py-3 font-medium">{t("colMode")}</th>
                  <th className="px-4 py-3 font-medium">{t("colChanges")}</th>
                </tr>
              </thead>
              <tbody>
                {(imports ?? []).map((i) => (
                  <tr key={i.id} className="border-b border-slate-50 align-top last:border-0">
                    <td data-label={t("colWhen")} className="px-4 py-2.5">
                      {formatDateTime(i.created_at)}
                      <span className="block text-xs text-slate-500">{names.get(i.created_by) ?? "—"}</span>
                    </td>
                    <td data-label={t("colFile")} className="px-4 py-2.5">
                      <DownloadLink href={`/api/billing/prices/imports/${i.id}`} className="break-all text-primary hover:underline">
                        {i.file_name}
                      </DownloadLink>
                      <span className="block text-xs text-slate-500">{t("fileRows", { count: i.row_count })}</span>
                    </td>
                    <td data-label={t("colMode")} className="px-4 py-2.5">
                      {i.mode === "replace" ? t("modeReplace") : t("modeUpsert")}
                    </td>
                    <td data-label={t("colChanges")} className="px-4 py-2.5 text-xs text-slate-600">
                      {t("importCounts", {
                        inserted: i.lines_inserted,
                        updated: i.lines_updated,
                        deleted: i.lines_deleted,
                        unchanged: i.lines_unchanged,
                        contracts: i.contracts_created,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Flag({ text }: { text: string }) {
  return (
    <span className="mt-0.5 flex items-start gap-1 text-xs text-amber-700">
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      <span className="break-words">{text}</span>
    </span>
  );
}
