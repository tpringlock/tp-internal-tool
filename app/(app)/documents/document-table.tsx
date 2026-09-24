import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { formatBytes, formatDate } from "@/lib/format";
import type { DocType } from "@/lib/db/types";
import { DeleteDocumentButton } from "@/app/(app)/admin/projects/[id]/delete-document-button";

export interface DocumentTableRow {
  id: string;
  canonical_name: string;
  doc_type: DocType;
  file_size: number;
  created_at: string;
  /** Shown under the name when the table spans several projects/customers. */
  context?: string | null;
}

const TYPE_TONE: Record<DocType, string> = {
  contract: "border-emerald-200 bg-emerald-50 text-emerald-700",
  addendum: "border-teal-200 bg-teal-50 text-teal-700",
  payment_record: "border-sky-200 bg-sky-50 text-sky-700",
  invoice: "border-indigo-200 bg-indigo-50 text-indigo-700",
  debt_reconciliation: "border-amber-200 bg-amber-50 text-amber-700",
  handover_minutes: "border-violet-200 bg-violet-50 text-violet-700",
  correspondence: "border-slate-200 bg-slate-50 text-slate-700",
  meeting_minutes: "border-rose-200 bg-rose-50 text-rose-700",
};

/**
 * Document rows for the Documents workspace: name + meta, type, date and row
 * actions. Uses the global `.responsive-table` styles so rows collapse into
 * cards below `md`. Delete is rendered for admins only; RLS and the
 * requireAdmin guard in deleteDocument enforce it regardless.
 */
export async function DocumentTable({
  documents,
  highlightId,
  canDelete,
}: {
  documents: DocumentTableRow[];
  highlightId?: string;
  canDelete: boolean;
}) {
  const t = await getTranslations("DocWorkspace");
  const dt = await getTranslations("DocTypes");

  return (
    <table className="responsive-table w-full text-sm md:table-fixed">
      <thead>
        <tr className="border-b border-slate-200 text-left text-slate-600">
          <th className="px-5 py-3 font-medium">{t("colFile")}</th>
          <th className="px-3 py-3 font-medium md:w-48">{t("colType")}</th>
          <th className="px-3 py-3 font-medium md:w-28">{t("colDate")}</th>
          <th className="px-5 py-3 text-right font-medium md:w-28">
            {t("colActions")}
          </th>
        </tr>
      </thead>
      <tbody>
        {documents.map((d) => (
          <tr
            key={d.id}
            id={`file-${d.id}`}
            className={cn(
              "border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50/70",
              d.id === highlightId && "bg-primary/10 ring-1 ring-inset ring-primary",
            )}
          >
            <td data-label={t("colFile")} className="px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 sm:flex">
                  <FileText className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/documents/${d.id}`}
                    className="line-clamp-2 font-semibold text-slate-900 underline-offset-2 [overflow-wrap:anywhere] hover:text-primary hover:underline"
                  >
                    {d.canonical_name}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500 md:truncate">
                    {d.context ? `${d.context} · ` : ""}
                    {formatBytes(d.file_size)}
                  </p>
                </div>
              </div>
            </td>
            <td data-label={t("colType")} className="px-3 py-3.5">
              <span
                className={cn(
                  "inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  TYPE_TONE[d.doc_type],
                )}
              >
                {dt(d.doc_type)}
              </span>
            </td>
            <td
              data-label={t("colDate")}
              className="whitespace-nowrap px-3 py-3.5 text-slate-600"
            >
              {formatDate(d.created_at)}
            </td>
            <td className="px-5 py-3.5">
              <div className="flex items-center justify-end gap-1">
                <a
                  href={`/api/documents/${d.id}?dl=1`}
                  aria-label={t("downloadFile", { name: d.canonical_name })}
                  title={t("download")}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  <Download className="h-[18px] w-[18px]" aria-hidden />
                </a>
                {canDelete && (
                  <DeleteDocumentButton
                    documentId={d.id}
                    documentName={d.canonical_name}
                    variant="ghost"
                  />
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
