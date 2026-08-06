import Link from "next/link";
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

export default async function UploadPage() {
  await requireUser();
  const supabase = await createClient();

  // RLS returns only the projects this user may upload to (all for admins,
  // assigned projects for employees).
  const { data } = await supabase
    .from("projects")
    .select("id, name, client_id, clients(name)")
    .eq("status", "active")
    .order("name");

  const projects: UploadProject[] = ((data ?? []) as unknown as ProjectRow[]).map(
    (p) => ({
      id: p.id,
      name: p.name,
      clientId: p.client_id,
      clientName: p.clients?.name ?? "—",
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/documents"
          className="text-sm text-slate-500 underline hover:text-slate-900"
        >
          ← Documents
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">
          Upload a document
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload guidelines</CardTitle>
        </CardHeader>
        <CardBody className="text-sm text-slate-600">
          <ul className="list-disc space-y-1 pl-5">
            <li>Only signed documents may be uploaded.</li>
            <li>PDF files only, up to 25 MB.</li>
            <li>
              You can only upload to projects you are assigned to. Ask an admin
              if a project is missing.
            </li>
            <li>
              The file name is generated automatically as
              <span className="font-mono"> Client_Type_Project</span>.
            </li>
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          {projects.length === 0 ? (
            <Alert tone="info">
              You are not assigned to any active projects yet. Ask an admin to
              add you to a project before uploading.
            </Alert>
          ) : (
            <UploadForm projects={projects} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
