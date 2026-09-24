import Link from "next/link";
import { Building2, CloudUpload, FileText, List } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { DocumentSearch } from "./document-search";
import { DocumentTable, type DocumentTableRow } from "./document-table";
import type { DocType } from "@/lib/db/types";

interface RecentRow {
  id: string;
  canonical_name: string;
  doc_type: DocType;
  file_size: number;
  created_at: string;
  projects: { name: string; clients: { name: string } | null } | null;
}

const RECENT_LIMIT = 10;

/**
 * Documents landing page: search, shortcuts and the latest uploads the user
 * can see. Customers are picked from the sidebar (drawer on small screens).
 */
export default async function DocumentsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const t = await getTranslations("DocWorkspace");

  const { data } = await supabase
    .from("documents")
    .select(
      `id, canonical_name, doc_type, file_size, created_at,
       projects ( name, clients ( name ) )`,
    )
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);

  const recent: DocumentTableRow[] = ((data ?? []) as unknown as RecentRow[]).map(
    (d) => ({
      id: d.id,
      canonical_name: d.canonical_name,
      doc_type: d.doc_type,
      file_size: d.file_size,
      created_at: d.created_at,
      context: [d.projects?.clients?.name, d.projects?.name]
        .filter(Boolean)
        .join(" / "),
    }),
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {t("moduleName")}
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {t("overviewTitle")}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {t("overviewSubtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/documents/list"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <List className="h-4 w-4" aria-hidden />
            {t("viewAsList")}
          </Link>
          <Link
            href="/documents/upload"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover"
          >
            <CloudUpload className="h-4 w-4" aria-hidden />
            {t("upload")}
          </Link>
        </div>
      </div>

      <DocumentSearch />

      <div className="hidden items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-5 py-4 text-sm text-slate-600 lg:flex">
        <Building2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        {t("pickCustomerHint")}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">{t("recentTitle")}</h2>
          <p className="text-sm text-slate-500">
            {t("recentSubtitle")}
          </p>
        </header>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <FileText className="h-6 w-6" aria-hidden />
            </span>
            <p className="text-sm text-slate-500">{t("noFiles")}</p>
          </div>
        ) : (
          <DocumentTable
            documents={recent}
            canDelete={user.profile.role === "admin"}
          />
        )}
      </section>
    </div>
  );
}
