import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { UploadForm, type UploadProject } from "./upload-form";

interface ProjectRow {
  id: string;
  name: string;
  client_id: string;
  clients: { name: string } | null;
}

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client = "" } = await searchParams;
  await requireUser();
  const supabase = await createClient();
  const t = await getTranslations("Documents");

  // RLS returns only the projects this user may upload to (all for admins,
  // assigned projects for employees).
  const { data } = await supabase
    .from("projects")
    .select("id, name, client_id, clients(name)")
    .eq("status", "active")
    .order("name");

  const projects: UploadProject[] = (
    (data ?? []) as unknown as ProjectRow[]
  ).map((p) => ({
    id: p.id,
    name: p.name,
    clientId: p.client_id,
    clientName: p.clients?.name ?? "—",
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/documents"
          className="text-sm text-slate-500 underline hover:text-slate-900"
        >
          ← {t("title")}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-primary">
          {t("uploadTitle")}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("guidelines")}</CardTitle>
        </CardHeader>
        <CardBody className="text-sm text-slate-600">
          <ul className="list-disc space-y-1 pl-5">
            <li>{t("guidelineSigned")}</li>
            <li>{t("guidelinePdf")}</li>
            <li>{t("guidelineProjects")}</li>
            <li>
              {t("guidelineNaming")}
              <span className="font-mono">
                {" "}
                Tên khách hàng_Loại tài liệu_Dự án
              </span>
              .
            </li>
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          {projects.length === 0 ? (
            <Alert tone="info">{t("noActiveProjects")}</Alert>
          ) : (
            <UploadForm projects={projects} defaultClientId={client} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
