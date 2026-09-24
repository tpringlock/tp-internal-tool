import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireContentManager } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EditClientForm, DeleteClientButton } from "../client-forms";
import { ClientProjectsManager, type ClientProject } from "./client-projects-manager";
import type { Client } from "@/lib/db/types";
import { ModuleEyebrow } from "@/components/page-title";

export default async function ClientManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Request-cached (already resolved by the admin layout); deletion is
  // admin-only, so managers don't get the delete controls.
  const user = await requireContentManager();
  const canDelete = user.profile.role === "admin";

  const supabase = await createClient();
  const [{ data: client }, { data: projectData }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single<Client>(),
    supabase
      .from("projects")
      .select("id, name, code, status")
      .eq("client_id", id)
      .order("name"),
  ]);

  if (!client) notFound();
  const projects = (projectData ?? []) as ClientProject[];
  const t = await getTranslations("Admin");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/clients"
            className="text-sm text-slate-500 underline hover:text-slate-900"
          >
            ← {t("backClients")}
          </Link>
          <ModuleEyebrow id="admin" className="mt-2" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {client.name}
          </h1>
        </div>
        {canDelete && (
          <DeleteClientButton client={client} redirectTo="/admin/clients" />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("clientDetails")}</CardTitle>
        </CardHeader>
        <CardBody>
          <EditClientForm client={client} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("clientProjects", { count: projects.length })}</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <ClientProjectsManager projects={projects} canDelete={canDelete} />
        </CardBody>
      </Card>
    </div>
  );
}
