import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { CreateProjectForm } from "./project-forms";

const PAGE_SIZE = 50;

interface ProjectListRow {
  id: string;
  name: string;
  code: string;
  status: "active" | "archived";
  clients: { name: string } | null;
}

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;

  const supabase = await createClient();

  const [{ data: projectData, count }, { data: clientData }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, name, code, status, clients(name)", { count: "exact" })
        .order("name")
        .range(from, from + PAGE_SIZE - 1),
      supabase.from("clients").select("id, name").order("name"),
    ]);

  const projects = (projectData ?? []) as unknown as ProjectListRow[];
  const clients = clientData ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hrefForPage = (p: number) => `/admin/projects?page=${p}`;
  const t = await getTranslations("Admin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-primary">
          {t("projectsTitle")}
        </h1>
        <p className="text-sm text-slate-500">{t("projectsSubtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("addProject")}</CardTitle>
        </CardHeader>
        <CardBody>
          <CreateProjectForm clients={clients} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("allProjects", { count: total })}</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          {projects.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">
              {t("noProjects")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t("name")}</th>
                  <th className="px-5 py-3 font-medium">{t("code")}</th>
                  <th className="px-5 py-3 font-medium">{t("client")}</th>
                  <th className="px-5 py-3 font-medium">{t("status")}</th>
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
                        <span className="text-green-700">{t("active")}</span>
                      ) : (
                        <span className="text-slate-400">{t("archived")}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/projects/${p.id}`}
                        className="text-sm font-medium text-slate-700 underline hover:text-slate-900"
                      >
                        {t("manage")}
                      </Link>
                    </td>
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
        hrefForPage={hrefForPage}
      />
    </div>
  );
}
