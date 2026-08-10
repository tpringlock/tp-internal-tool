import { headers } from "next/headers";
import { Download, FileText, FolderOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { resolveFolderShareToken } from "@/lib/documents/folder-share";
import { formatBytes } from "@/lib/format";

export default async function FolderSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("SharePage");
  const dt = await getTranslations("DocTypes");
  const share = await resolveFolderShareToken(token);

  if (!share) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 px-4 py-16">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-primary">
            {t("unavailableTitle")}
          </h1>
          <p className="mt-2 text-sm text-slate-500">{t("unavailableBody")}</p>
        </div>
      </div>
    );
  }

  // Record the anonymous open (service role bypasses RLS).
  const admin = createAdminClient();
  const hdrs = await headers();
  await logActivity(admin, {
    action: "folder_share.opened",
    entityType: "client",
    entityId: share.clientId,
    actorUserId: null,
    ip: hdrs.get("x-forwarded-for"),
    metadata: { token },
  });

  const fileCount = share.projects.reduce(
    (sum, p) => sum + p.documents.length,
    0,
  );

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3">
          <FolderOpen className="h-6 w-6 text-primary" />
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{t("sharedFolder")}</p>
            <h1 className="truncate text-sm font-semibold text-primary">
              {share.clientName}
            </h1>
          </div>
          <span className="ml-auto text-xs text-slate-400">
            {t("filesCount", { count: fileCount })}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        {fileCount === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
            {t("emptyFolder")}
          </p>
        ) : (
          share.projects.map((project) => (
            <section
              key={project.id}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">
                {project.name}
              </h2>
              <ul className="divide-y divide-slate-100">
                {project.documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <a
                        href={`/api/share/folder/${token}?doc=${doc.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {doc.canonicalName}
                      </a>
                      <div className="text-xs text-slate-400">
                        {dt(doc.docType)} · {formatBytes(doc.fileSize)}
                      </div>
                    </div>
                    <a
                      href={`/api/share/folder/${token}?doc=${doc.id}&dl=1`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                    >
                      <Download className="h-4 w-4" />
                      {t("download")}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
