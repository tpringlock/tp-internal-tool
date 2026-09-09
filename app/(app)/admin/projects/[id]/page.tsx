import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireContentManager } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes, formatDateTime } from "@/lib/format";
import { EditProjectForm } from "../project-forms";
import { AssignMemberForm, RemoveMemberButton } from "./member-forms";
import { DeleteDocumentButton } from "./delete-document-button";
import type { Project } from "@/lib/db/types";

interface MemberRow {
  user_id: string;
  profiles: { full_name: string; role: string } | null;
}

interface DocumentRow {
  id: string;
  canonical_name: string;
  file_size: number;
  created_at: string;
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Request-cached (already resolved by the admin layout); document deletion
  // is admin-only, so managers don't get the button.
  const user = await requireContentManager();
  const canDelete = user.profile.role === "admin";

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) notFound();

  const [{ data: clients }, { data: memberData }, { data: employees }, { data: docData }] =
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
      supabase
        .from("documents")
        .select("id, canonical_name, file_size, created_at")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
    ]);

  const members = (memberData ?? []) as unknown as MemberRow[];
  const documents = (docData ?? []) as DocumentRow[];
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

      <Card>
        <CardHeader>
          <CardTitle>{t("projectDocuments", { count: documents.length })}</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {documents.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">
              {t("noProjectDocuments")}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-3 px-5 py-2.5"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/documents/${doc.id}`}
                      className="block truncate text-sm font-medium text-slate-800 underline hover:text-slate-900"
                    >
                      {doc.canonical_name}
                    </Link>
                    <span className="text-xs text-slate-400">
                      {formatBytes(doc.file_size)} · {formatDateTime(doc.created_at)}
                    </span>
                  </div>
                  {canDelete && (
                    <DeleteDocumentButton
                      documentId={doc.id}
                      documentName={doc.canonical_name}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
