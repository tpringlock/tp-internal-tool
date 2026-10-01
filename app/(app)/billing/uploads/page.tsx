import { getTranslations } from "next-intl/server";
import { AlertTriangle, Download, RotateCcw, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { canEditBilling } from "@/lib/auth/roles";
import { deleteMisaUpload } from "@/app/actions/billing";
import { refreshMonthCatalogs, restoreMonthFileVersion } from "@/app/actions/billing-files";
import { formatVnDate } from "@/lib/billing/dates";
import { missingMonths } from "@/lib/billing/month-files";
import { formatBillingMonth } from "@/lib/billing/periods";
import { getProfileNames } from "@/lib/billing/queries";
import type { BillingMisaMonthFile, BillingMisaUpload } from "@/lib/db/types";
import { formatBytes, formatDateTime } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DownloadLink } from "@/components/ui/download-link";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { cn } from "@/lib/utils";
import { UploadDropzone } from "../upload-dropzone";
import { ActionButton } from "../action-button";

/**
 * MISA source files by data month (feedback items 1, 1b): every version of
 * every month, which one is in use, who uploaded it and when, which
 * calculations used it, and a download link. Older uploads that are not a
 * whole month are listed apart.
 */
export default async function BillingUploadsPage() {
  const user = await requireBillingViewer();
  const canEdit = canEditBilling(user.profile.role);
  const isAdmin = user.profile.role === "admin";
  const t = await getTranslations("BillingFiles");
  const tb = await getTranslations("Billing");
  const supabase = await createClient();

  const [{ data: monthRows }, { data: uploadRows }, { data: calcs }] = await Promise.all([
    supabase
      .from("billing_misa_month_files")
      .select("*")
      .order("month", { ascending: false })
      .order("version", { ascending: false })
      .limit(1000),
    supabase.from("billing_misa_uploads").select("*").order("created_at", { ascending: false }).limit(1000),
    supabase.from("billing_rent_calculations").select("upload_ids, status").neq("status", "voided").limit(1000),
  ]);
  const months = monthRows ?? [];
  const uploads = new Map((uploadRows ?? []).map((u) => [u.id, u]));
  const inMonth = new Set(months.map((m) => m.upload_id));
  const legacy = (uploadRows ?? []).filter((u) => !inMonth.has(u.id));

  const uses = new Map<string, { all: number; confirmed: number }>();
  for (const c of calcs ?? []) {
    for (const id of c.upload_ids) {
      const u = uses.get(id) ?? { all: 0, confirmed: 0 };
      u.all++;
      if (c.status === "confirmed") u.confirmed++;
      uses.set(id, u);
    }
  }
  const names = await getProfileNames(supabase, (uploadRows ?? []).map((u) => u.uploaded_by));
  const byMonth = new Map<string, BillingMisaMonthFile[]>();
  for (const m of months) byMonth.set(m.month, [...(byMonth.get(m.month) ?? []), m]);
  const gaps = missingMonths([...byMonth.keys()]);
  const monthList = [...new Set([...byMonth.keys(), ...gaps])].sort().reverse();
  const noCatalog = months.filter((m) => m.status === "active" && m.catalog === null).length;

  return (
    <div className="space-y-6">
      <div>
        <ModuleEyebrow id="billing" />
        <h1 className={pageTitleClass}>{t("title")}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t("subtitle")}</p>
      </div>

      {canEdit && (
        <Card>
          <CardBody className="space-y-3">
            <UploadDropzone />
            <details className="text-sm text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-700">{tb("howToExport")}</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>{tb("howToExport1")}</li>
                <li>{t("howToMonth")}</li>
                <li>{tb("howToExport3")}</li>
              </ol>
            </details>
          </CardBody>
        </Card>
      )}

      {canEdit && noCatalog > 0 && (
        <Alert tone="info">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t("catalogMissing", { count: noCatalog })}</span>
            <ActionButton
              action={refreshMonthCatalogs}
              id="all"
              label={t("readCatalogs")}
              title={t("readCatalogs")}
              body={t("readCatalogsBody")}
              confirmLabel={t("readCatalogs")}
            />
          </div>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("monthFilesTitle", { count: byMonth.size })}</CardTitle>
          {gaps.length > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              {t("gaps", { months: gaps.map(formatBillingMonth).join(", ") })}
            </p>
          )}
        </CardHeader>
        <CardBody className="p-0">
          {monthList.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">{t("noMonthFiles")}</p>
          ) : (
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t("colMonth")}</th>
                  <th className="px-5 py-3 font-medium">{t("colFile")}</th>
                  <th className="px-5 py-3 font-medium">{t("colContent")}</th>
                  <th className="px-5 py-3 font-medium">{t("colUploaded")}</th>
                  <th className="px-5 py-3 font-medium">{t("colUsed")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {monthList.map((month) => {
                  const versions = byMonth.get(month);
                  if (!versions) {
                    return (
                      <tr key={month} className="border-t border-slate-200 bg-amber-50/60">
                        <td data-label={t("colMonth")} className="px-5 py-3 font-semibold text-slate-900">
                          {formatBillingMonth(month)}
                        </td>
                        <td colSpan={5} className="px-5 py-3 text-amber-800">
                          {t("monthMissing")}
                        </td>
                      </tr>
                    );
                  }
                  return versions.map((v, i) => (
                    <VersionRow
                      key={v.id}
                      v={v}
                      upload={uploads.get(v.upload_id)}
                      first={i === 0}
                      count={versions.length}
                      uploader={names.get(uploads.get(v.upload_id)?.uploaded_by ?? "") ?? "—"}
                      use={uses.get(v.upload_id)}
                      isAdmin={isAdmin}
                      t={t}
                    />
                  ));
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {legacy.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("legacyTitle", { count: legacy.length })}</CardTitle>
            <p className="mt-1 text-sm text-slate-500">{t("legacySubtitle")}</p>
          </CardHeader>
          <CardBody className="p-0">
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t("colFile")}</th>
                  <th className="px-5 py-3 font-medium">{t("colSpan")}</th>
                  <th className="px-5 py-3 font-medium">{t("colUploaded")}</th>
                  <th className="px-5 py-3 font-medium">{t("colUsed")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {legacy.map((u) => (
                  <tr key={u.id} className="border-b border-slate-50 align-top last:border-0">
                    <td data-label={t("colFile")} className="px-5 py-3 md:max-w-xs">
                      <span className="block break-words font-medium text-slate-900">{u.file_name}</span>
                      <span className="block text-xs text-slate-500">
                        {formatBytes(u.size_bytes)} · {t("warehouses", { count: u.warehouse_count })}
                      </span>
                    </td>
                    <td data-label={t("colSpan")} className="whitespace-nowrap px-5 py-3 tabular-nums">
                      {formatVnDate(u.file_from)} – {formatVnDate(u.file_to)}
                    </td>
                    <td data-label={t("colUploaded")} className="px-5 py-3 text-slate-600">
                      {names.get(u.uploaded_by) ?? "—"}
                      <span className="block text-xs text-slate-400">{formatDateTime(u.created_at)}</span>
                    </td>
                    <td data-label={t("colUsed")} className="px-5 py-3 text-slate-600">
                      <UseCount use={uses.get(u.id)} t={t} />
                    </td>
                    <td className="px-5 py-3">
                      <FileActions upload={u} isAdmin={isAdmin} t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"BillingFiles">>>;

function VersionRow({
  v,
  upload,
  first,
  count,
  uploader,
  use,
  isAdmin,
  t,
}: {
  v: BillingMisaMonthFile;
  upload: BillingMisaUpload | undefined;
  first: boolean;
  count: number;
  uploader: string;
  use: { all: number; confirmed: number } | undefined;
  isAdmin: boolean;
  t: T;
}) {
  const active = v.status === "active";
  return (
    <tr
      className={cn(
        "align-top",
        first ? "border-t border-slate-200" : "border-t border-slate-50",
        active ? "bg-white" : "bg-slate-50/60 text-slate-500",
      )}
    >
      <td data-label={t("colMonth")} className="px-5 py-3">
        {first && <span className="block font-semibold text-slate-900">{formatBillingMonth(v.month)}</span>}
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="tabular-nums">{t("version", { version: v.version })}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-medium ring-1 ring-inset",
              active ? "bg-green-50 text-green-800 ring-green-200" : "bg-slate-100 text-slate-500 ring-slate-200",
            )}
          >
            {active ? t("active") : t("superseded")}
          </span>
        </span>
        {first && count > 1 && <span className="block text-xs text-slate-400">{t("versionCount", { count })}</span>}
      </td>
      <td data-label={t("colFile")} className="px-5 py-3 md:max-w-xs">
        <span className={cn("block break-words", active && "font-medium text-slate-900")}>{upload?.file_name ?? "—"}</span>
        {upload && (
          <span className="block text-xs text-slate-500">
            {formatBytes(upload.size_bytes)} · {upload.layout}
          </span>
        )}
      </td>
      <td data-label={t("colContent")} className="px-5 py-3 text-xs">
        <span className="block">{t("warehouses", { count: upload?.warehouse_count ?? 0 })}</span>
        <span className="block">
          {v.voucher_count === null ? t("vouchersUnknown") : t("vouchers", { count: v.voucher_count })}
        </span>
        {upload && upload.warnings.length > 0 && (
          <details>
            <summary className="flex cursor-pointer items-center gap-1 text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {t("warningCount", { count: upload.warnings.length })}
            </summary>
            <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-slate-600">
              {upload.warnings.map((w, i) => (
                <li key={i} className="break-words">
                  {w}
                </li>
              ))}
            </ul>
          </details>
        )}
      </td>
      <td data-label={t("colUploaded")} className="px-5 py-3">
        {uploader}
        <span className="block text-xs text-slate-400">{formatDateTime(v.created_at)}</span>
        {v.superseded_at && (
          <span className="block text-xs text-slate-400">
            {t("supersededAt", { date: formatDateTime(v.superseded_at) })}
          </span>
        )}
      </td>
      <td data-label={t("colUsed")} className="px-5 py-3">
        <UseCount use={use} t={t} />
      </td>
      <td className="px-5 py-3">
        {upload && (
          <FileActions upload={upload} isAdmin={isAdmin} t={t}>
            {isAdmin && !active && (
              <ActionButton
                action={restoreMonthFileVersion}
                id={v.id}
                label={t("restore")}
                title={t("restoreTitle", { month: formatBillingMonth(v.month), version: v.version })}
                body={t("restoreBody")}
                confirmLabel={t("restore")}
                icon={<RotateCcw className="h-4 w-4" aria-hidden />}
                iconOnly
              />
            )}
          </FileActions>
        )}
      </td>
    </tr>
  );
}

function UseCount({ use, t }: { use: { all: number; confirmed: number } | undefined; t: T }) {
  if (!use) return <span className="text-xs text-slate-400">{t("notUsed")}</span>;
  return (
    <span className="text-xs">
      {t("usedIn", { count: use.all })}
      {use.confirmed > 0 && (
        <span className="block font-medium text-green-700">{t("confirmedIn", { count: use.confirmed })}</span>
      )}
    </span>
  );
}

function FileActions({
  upload,
  isAdmin,
  t,
  children,
}: {
  upload: BillingMisaUpload;
  isAdmin: boolean;
  t: T;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <DownloadLink
        href={`/api/billing/uploads/${upload.id}`}
        title={t("download")}
        className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900 hover:border-primary hover:text-primary"
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        {t("download")}
      </DownloadLink>
      {children}
      {isAdmin && (
        <ActionButton
          action={deleteMisaUpload}
          id={upload.id}
          label={t("delete")}
          title={t("delete")}
          body={t("deleteBody", { name: upload.file_name })}
          confirmLabel={t("delete")}
          variant="danger"
          icon={<Trash2 className="h-4 w-4" aria-hidden />}
          iconOnly
        />
      )}
    </div>
  );
}
