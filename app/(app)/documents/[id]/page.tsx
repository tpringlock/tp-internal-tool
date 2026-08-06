import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes, formatDateTime } from "@/lib/format";
import { env } from "@/lib/env";
import { labelForAction } from "@/lib/activity-labels";
import { ShareManager, type ShareLinkView } from "./share-manager";
import type { DocType } from "@/lib/db/types";

interface DocDetail {
  id: string;
  canonical_name: string;
  doc_type: DocType;
  created_at: string;
  file_size: number;
  projects: { name: string; clients: { name: string } | null } | null;
  uploader: { full_name: string } | null;
}

interface ActivityRow {
  id: number;
  action: string;
  created_at: string;
  actor: { full_name: string } | null;
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser();
  const supabase = await createClient();
  const t = await getTranslations("Documents");
  const dt = await getTranslations("DocTypes");
  const ts = await getTranslations("Shares");
  const ta = await getTranslations("Activity");

  const { data: doc } = await supabase
    .from("documents")
    .select(
      `id, canonical_name, doc_type, created_at, file_size,
       projects ( name, clients ( name ) ),
       uploader:profiles!documents_uploaded_by_fkey ( full_name )`,
    )
    .eq("id", id)
    .single<DocDetail>();

  if (!doc) notFound();

  const { data: activityData } = await supabase
    .from("activity_log")
    .select(
      `id, action, created_at,
       actor:profiles!activity_log_actor_user_id_fkey ( full_name )`,
    )
    .eq("entity_type", "document")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  const activity = (activityData ?? []) as unknown as ActivityRow[];

  const { data: shareData } = await supabase
    .from("share_links")
    .select("id, token, expires_at, revoked_at, created_at")
    .eq("document_id", id)
    .order("created_at", { ascending: false });

  const shareLinks: ShareLinkView[] = (shareData ?? []).map((l) => ({
    id: l.id,
    url: `${env.siteUrl()}/share/${l.token}`,
    expires_at: l.expires_at,
    revoked_at: l.revoked_at,
    created_at: l.created_at,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/documents"
            className="text-sm text-slate-500 underline hover:text-slate-900"
          >
            ← {t("title")}
          </Link>
          <h1 className="mt-1 break-all text-xl font-semibold text-slate-900">
            {doc.canonical_name}
          </h1>
        </div>
        <div className="flex gap-2">
          <a href={`/api/documents/${doc.id}?dl=1`}>
            <Button>{t("download")}</Button>
          </a>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("preview")}</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <iframe
                title={doc.canonical_name}
                src={`/api/documents/${doc.id}`}
                className="h-[640px] w-full rounded-b-lg"
              />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("details")}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              <Detail label={t("type")} value={dt(doc.doc_type)} />
              <Detail label={t("project")} value={doc.projects?.name ?? "—"} />
              <Detail
                label={t("client")}
                value={doc.projects?.clients?.name ?? "—"}
              />
              <Detail
                label={t("colUploadedBy")}
                value={doc.uploader?.full_name ?? "—"}
              />
              <Detail label={t("uploaded")} value={formatDateTime(doc.created_at)} />
              <Detail label={t("size")} value={formatBytes(doc.file_size)} />
              <Detail label={t("signed")} value={t("signedValue")} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{ts("title")}</CardTitle>
            </CardHeader>
            <CardBody>
              <ShareManager documentId={doc.id} links={shareLinks} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("activity")}</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              {activity.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">
                  {t("noActivity")}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {activity.map((a) => (
                    <li key={a.id} className="px-5 py-2.5 text-sm">
                      <span className="text-slate-800">
                        {labelForAction(ta, a.action)}
                      </span>
                      <div className="text-xs text-slate-400">
                        {a.actor?.full_name ?? t("aClient")} ·{" "}
                        {formatDateTime(a.created_at)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}
