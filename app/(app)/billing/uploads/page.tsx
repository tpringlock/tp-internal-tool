import { getTranslations } from "next-intl/server";
import { AlertTriangle, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBillingUser } from "@/lib/auth/dal";
import { deleteMisaUpload } from "@/app/actions/billing";
import { formatVnDate } from "@/lib/billing/dates";
import { getProfileNames } from "@/lib/billing/queries";
import { formatBytes, formatDateTime } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { UploadDropzone } from "../upload-dropzone";
import { ActionButton } from "../action-button";

const PAGE_SIZE = 30;

export default async function BillingUploadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireBillingUser();
  const sp = await searchParams;
  const t = await getTranslations("Billing");
  const supabase = await createClient();

  const pageNum = Math.max(1, Number(sp.page) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;
  const { data, count } = await supabase
    .from("billing_misa_uploads")
    .select("*", { count: "exact" })
    .order("file_from", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  const uploads = data ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const names = await getProfileNames(supabase, uploads.map((u) => u.uploaded_by));
  const isAdmin = user.profile.role === "admin";

  return (
    <div className="space-y-6">
      <div>
        <ModuleEyebrow id="billing" />
        <h1 className={pageTitleClass}>{t("uploadsTitle")}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t("uploadsSubtitle")}</p>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <UploadDropzone />
          <details className="text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">
              {t("howToExport")}
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>{t("howToExport1")}</li>
              <li>{t("howToExport2")}</li>
              <li>{t("howToExport3")}</li>
            </ol>
          </details>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("uploadCount", { count: total })}</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {uploads.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">{t("noUploads")}</p>
          ) : (
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t("fileName")}</th>
                  <th className="px-5 py-3 font-medium">{t("fileSpanLabel")}</th>
                  <th className="px-5 py-3 font-medium">{t("fileWarnings")}</th>
                  <th className="px-5 py-3 font-medium">{t("uploadedBy")}</th>
                  {isAdmin && <th className="px-5 py-3" />}
                </tr>
              </thead>
              <tbody>
                {uploads.map((u) => (
                  <tr key={u.id} className="border-b border-slate-50 align-top last:border-0">
                    <td data-label={t("fileName")} className="px-5 py-3 md:max-w-xs">
                      <span className="block break-words font-medium text-slate-900">{u.file_name}</span>
                      <span className="block text-xs text-slate-500">
                        {t("layoutInfo", {
                          layout: u.layout,
                          size: formatBytes(u.size_bytes),
                          warehouses: u.warehouse_count,
                        })}
                      </span>
                    </td>
                    <td data-label={t("fileSpanLabel")} className="whitespace-nowrap px-5 py-3 tabular-nums">
                      {formatVnDate(u.file_from)} – {formatVnDate(u.file_to)}
                    </td>
                    <td data-label={t("fileWarnings")} className="px-5 py-3">
                      {u.warnings.length === 0 ? (
                        <span className="text-slate-400">{t("none")}</span>
                      ) : (
                        <details>
                          <summary className="flex cursor-pointer items-center gap-1.5 text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                            {t("warningCount", { count: u.warnings.length })}
                          </summary>
                          <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-slate-600">
                            {u.warnings.map((w, i) => (
                              <li key={i} className="break-words">
                                {w}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td data-label={t("uploadedBy")} className="px-5 py-3 text-slate-600">
                      {names.get(u.uploaded_by) ?? "—"}
                      <span className="block text-xs text-slate-400">{formatDateTime(u.created_at)}</span>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3 text-right">
                        <ActionButton
                          action={deleteMisaUpload}
                          id={u.id}
                          label={t("deleteFile")}
                          title={t("deleteFile")}
                          body={t("deleteFileBody", { name: u.file_name })}
                          confirmLabel={t("deleteFile")}
                          variant="danger"
                          icon={<Trash2 className="h-4 w-4" aria-hidden />}
                          iconOnly
                        />
                      </td>
                    )}
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
        hrefForPage={(p) => `/billing/uploads?page=${p}`}
      />
    </div>
  );
}
