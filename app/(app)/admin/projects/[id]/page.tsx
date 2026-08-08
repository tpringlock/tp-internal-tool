import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EditProjectForm } from "../project-forms";
import { AssignMemberForm, RemoveMemberButton } from "./member-forms";
import type { Project } from "@/lib/db/types";

interface MemberRow {
  user_id: string;
  profiles: { full_name: string; role: string } | null;
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) notFound();

  const [{ data: clients }, { data: memberData }, { data: employees }] =
    await Promise.all([
      supabase.from("clients").select("id, name").order("name"),
      supabase
        .from("project_members")
        // project_members has two FKs to profiles (user_id + assigned_by), so
        // the embed must name which one to follow — an unqualified
        // `profiles(...)` is ambiguous and makes PostgREST error out (silently
        // yielding zero members here).
        .select("user_id, profiles!project_members_user_id_fkey(full_name, role)")
        .eq("project_id", id),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "employee")
        .eq("is_active", true)
        .order("full_name"),
    ]);

  const members = (memberData ?? []) as unknown as MemberRow[];
  const memberIds = new Set(members.map((m) => m.user_id));
  const candidates = (employees ?? []).filter((e) => !memberIds.has(e.id));
  const t = await getTranslations("Admin");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/projects"
          className="text-sm text-slate-500 underline hover:text-slate-900"
        >
          ← {t("backProjects")}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-primary">
          {(project as Project).name}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("projectDetails")}</CardTitle>
        </CardHeader>
        <CardBody>
          <EditProjectForm
            project={project as Project}
            clients={clients ?? []}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("members", { count: members.length })}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <AssignMemberForm projectId={id} candidates={candidates} />

          {members.length === 0 ? (
            <p className="text-sm text-slate-500">{t("noMembers")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {members.map((m) => (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between py-2.5"
                >
                  <span className="text-sm text-slate-800">
                    {m.profiles?.full_name ?? t("unknown")}
                  </span>
                  <RemoveMemberButton projectId={id} userId={m.user_id} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
