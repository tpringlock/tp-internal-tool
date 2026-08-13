import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileText, FolderOpen, Upload } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/dal";
import { canManageContent } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { AddFolderTile } from "@/components/add-folder-tile";
import { CreateProjectForm } from "@/app/(app)/admin/projects/project-forms";
import { formatBytes } from "@/lib/format";
import { env } from "@/lib/env";
import {
  FolderShareManager,
  type FolderShareLinkView,
} from "./folder-share-manager";
import { ScrollToHighlight } from "./scroll-to-highlight";
import type { DocType } from "@/lib/db/types";

interface DocRow {
  id: string;
  canonical_name: string;
  doc_type: DocType;
  file_size: number;
  created_at: string;
  projects: { id: string; name: string; client_id: string } | null;
}

interface ProjectGroup {
  id: string;
  name: string;
  documents: DocRow[];
}

export default async function ClientFolderPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ highlight?: string }>;
}) {
  const { clientId } = await params;
  const { highlight = "" } = await searchParams;
  const user = await requireUser();
  const canManage = canManageContent(user.profile.role);
  const supabase = await createClient();
  const t = await getTranslations("Documents");
  const dt = await getTranslations("DocTypes");
  const ts = await getTranslations("Shares");

  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .single<{ id: string; name: string }>();

  if (!client) notFound();

  const { data: docData } = await supabase
    .from("documents")
    .select(
      `id, canonical_name, doc_type, file_size, created_at,
       projects!inner ( id, name, client_id )`,
    )
    .eq("projects.client_id", clientId)
    .order("created_at", { ascending: false });

  const documents = (docData ?? []) as unknown as DocRow[];

  // Group by project (alphabetical by project name).
  const byProject = new Map<string, ProjectGroup>();
  for (const d of documents) {
    if (!d.projects) continue;
    const p = d.projects;
    let group = byProject.get(p.id);
    if (!group) {
      group = { id: p.id, name: p.name, documents: [] };
      byProject.set(p.id, group);
    }
    group.documents.push(d);
  }
  const groups = [...byProject.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const { data: shareData } = await supabase
    .from("folder_share_links")
    .select("id, token, expires_at, revoked_at, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  const shareLinks: FolderShareLinkView[] = (shareData ?? []).map((l) => ({
    id: l.id,
    url: `${env.siteUrl()}/share/folder/${l.token}`,
    expires_at: l.expires_at,
    revoked_at: l.revoked_at,
    created_at: l.created_at,
  }));

  return (
    <div className="space-y-6">
      {highlight && <ScrollToHighlight targetId={`file-${highlight}`} />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/documents"
            className="inline-flex items-center gap-1 text-sm text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("backToFolders")}
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold text-primary">
            <FolderOpen className="h-6 w-6" />
            {client.name}
          </h1>
        </div>
        <Link href={`/documents/upload?client=${clientId}`}>
          <Button>
            <Upload className="h-4 w-4" />
            {t("uploadToFolder")}
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {groups.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-sm text-slate-500">{t("noDocuments")}</p>
              </CardBody>
            </Card>
          ) : (
            groups.map((group) => (
              <Card key={group.id}>
                <CardHeader>
                  <CardTitle>{group.name}</CardTitle>
                </CardHeader>
                <CardBody className="p-0">
                  <ul className="divide-y divide-slate-100">
                    {group.documents.map((d) => (
                      <li
                        key={d.id}
                        id={`file-${d.id}`}
                        className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                          d.id === highlight
                            ? "bg-primary/10 ring-1 ring-inset ring-primary"
                            : ""
                        }`}
                      >
                        <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/documents/${d.id}`}
                            className="block truncate font-medium text-slate-900 underline-offset-2 hover:underline"
                          >
                            {d.canonical_name}
                          </Link>
                          <div className="text-xs text-slate-400">
                            {dt(d.doc_type)} · {formatBytes(d.file_size)}
                          </div>
                        </div>
                        <a
                          href={`/api/documents/${d.id}?dl=1`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                        >
                          <Download className="h-4 w-4" />
                          {t("download")}
                        </a>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ))
          )}

          {canManage && (
            <AddFolderTile
              label={t("addProject")}
              dialogTitle={t("addProjectTitle")}
            >
              <CreateProjectForm
                clients={[{ id: clientId, name: client.name }]}
              />
            </AddFolderTile>
          )}
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>{ts("folderShareTitle")}</CardTitle>
            </CardHeader>
            <CardBody>
              <FolderShareManager clientId={clientId} links={shareLinks} />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
