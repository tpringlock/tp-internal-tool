import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { DOC_TYPES } from "@/lib/documents/constants";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { DocType } from "@/lib/db/types";

interface DocRow {
  id: string;
  canonical_name: string;
  doc_type: DocType;
  created_at: string;
  file_size: number;
  projects: { id: string; name: string; clients: { name: string } | null } | null;
  uploader: { full_name: string } | null;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; type?: string; q?: string }>;
}) {
  await requireUser();
  const { project = "", type = "", q = "" } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("Documents");
  const dt = await getTranslations("DocTypes");

  const { data: projectOptions } = await supabase
    .from("projects")
    .select("id, name")
    .order("name");

  let query = supabase
    .from("documents")
    .select(
      `id, canonical_name, doc_type, created_at, file_size,
       projects ( id, name, clients ( name ) ),
       uploader:profiles!documents_uploaded_by_fkey ( full_name )`,
    )
    .order("created_at", { ascending: false });

  if (project) query = query.eq("project_id", project);
  if (type) query = query.eq("doc_type", type as DocType);
  if (q) query = query.ilike("canonical_name", `%${q}%`);

  const { data } = await query;
  const documents = (data ?? []) as unknown as DocRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        <Link href="/documents/upload">
          <Button>{t("uploadDocument")}</Button>
        </Link>
      </div>

      <Card>
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="min-w-48 flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                {t("project")}
              </label>
              <Select name="project" defaultValue={project}>
                <option value="">{t("allProjects")}</option>
                {(projectOptions ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-48 flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                {t("type")}
              </label>
              <Select name="type" defaultValue={type}>
                <option value="">{t("allTypes")}</option>
                {DOC_TYPES.map((docType) => (
                  <option key={docType.value} value={docType.value}>
                    {dt(docType.value)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-48 flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                {t("search")}
              </label>
              <Input name="q" defaultValue={q} placeholder={t("fileNamePlaceholder")} />
            </div>
            <Button type="submit" variant="secondary">
              {t("filter")}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="overflow-x-auto p-0">
          {documents.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">
              {t("noDocuments")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t("colName")}</th>
                  <th className="px-5 py-3 font-medium">{t("type")}</th>
                  <th className="px-5 py-3 font-medium">{t("project")}</th>
                  <th className="px-5 py-3 font-medium">{t("colUploadedBy")}</th>
                  <th className="px-5 py-3 font-medium">{t("colDate")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/documents/${d.id}`}
                        className="font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {d.canonical_name}
                      </Link>
                      <div className="text-xs text-slate-400">
                        {formatBytes(d.file_size)}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {dt(d.doc_type)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {d.projects?.name ?? "—"}
                      {d.projects?.clients?.name && (
                        <div className="text-xs text-slate-400">
                          {d.projects.clients.name}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {d.uploader?.full_name ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {formatDateTime(d.created_at)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <a
                        href={`/api/documents/${d.id}?dl=1`}
                        className="text-sm font-medium text-slate-700 underline hover:text-slate-900"
                      >
                        {t("download")}
                      </a>
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
