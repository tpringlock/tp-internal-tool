import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateProjectForm } from "./project-forms";

interface ProjectListRow {
  id: string;
  name: string;
  code: string;
  status: "active" | "archived";
  clients: { name: string } | null;
}

export default async function AdminProjectsPage() {
  const supabase = await createClient();

  const [{ data: projectData }, { data: clientData }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, code, status, clients(name)")
      .order("name"),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  const projects = (projectData ?? []) as unknown as ProjectListRow[];
  const clients = clientData ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Projects</h1>
        <p className="text-sm text-slate-500">
          The project repository. Assign employees to a project to let them
          upload its documents.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a project</CardTitle>
        </CardHeader>
        <CardBody>
          <CreateProjectForm clients={clients} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All projects ({projects.length})</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          {projects.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">
              No projects yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Code</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {p.name}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{p.code}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {p.clients?.name ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      {p.status === "active" ? (
                        <span className="text-green-700">Active</span>
                      ) : (
                        <span className="text-slate-400">Archived</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/projects/${p.id}`}
                        className="text-sm font-medium text-slate-700 underline hover:text-slate-900"
                      >
                        Manage
                      </Link>
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
