import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Archive,
  CloudUpload,
  FileText,
  Folder,
  FolderOpen,
  Link2,
  Settings2,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/dal";
import { canManageContent } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import { formatBytes } from "@/lib/format";
import { env } from "@/lib/env";
import { DocumentSearch } from "../../document-search";
import { DocumentTable, type DocumentTableRow } from "../../document-table";
import {
  FolderShareManager,
  type FolderShareLinkView,
} from "./folder-share-manager";
import { ScrollToHighlight } from "./scroll-to-highlight";
import { AddProjectButton } from "./add-project-button";
import type { DocType } from "@/lib/db/types";

interface ClientRow {
  id: string;
  name: string;
  code: string;
  tax_code: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  status: "active" | "archived";
}

interface DocRow {
  id: string;
  canonical_name: string;
  doc_type: DocType;
  file_size: number;
  created_at: string;
  projects: { id: string; name: string; client_id: string } | null;
}

const PAGE_SIZE = 25;

type Tab = "files" | "share";

export default async function ClientWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{
    highlight?: string;
    page?: string;
    project?: string;
    tab?: string;
  }>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const highlight = sp.highlight ?? "";
  const tab: Tab = sp.tab === "share" ? "share" : "files";
  const user = await requireUser();
  const canManage = canManageContent(user.profile.role);
  const isAdmin = user.profile.role === "admin";
  const supabase = await createClient();
  const t = await getTranslations("DocWorkspace");
  const ts = await getTranslations("Shares");

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, code, tax_code")
    .eq("id", clientId)
    .single<ClientRow>();
  if (!client) notFound();

  // Projects ("thư mục") the user may see — RLS: all for admins/managers,
  // assigned ones for employees — plus per-project counts and total size from
  // the documents the user can see.
  const [{ data: projectData }, { data: statData }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, status")
      .eq("client_id", clientId)
      .order("status")
      .order("name"),
    supabase
      .from("documents")
      .select("project_id, file_size, projects!inner ( client_id )")
      .eq("projects.client_id", clientId),
  ]);

  const countByProject = new Map<string, number>();
  let totalBytes = 0;
  let totalFiles = 0;
  for (const row of (statData ?? []) as {
    project_id: string;
    file_size: number;
  }[]) {
    countByProject.set(
      row.project_id,
      (countByProject.get(row.project_id) ?? 0) + 1,
    );
    totalBytes += row.file_size;
    totalFiles += 1;
  }

  // Employees only see projects they belong to; for them hide assigned-but-
  // empty archived projects to keep the list short.
  const projects = ((projectData ?? []) as ProjectRow[]).filter(
    (p) =>
      canManage || p.status === "active" || (countByProject.get(p.id) ?? 0) > 0,
  );
  const selected = projects.find((p) => p.id === sp.project);
  const projectId = selected?.id ?? "";

  // ---- Documents (files tab) -------------------------------------------
  let pageNum = Math.max(1, Number(sp.page) || 1);

  // Search results deep-link with ?highlight=<docId> but no page; locate the
  // page containing that document (created_at desc) so it is rendered.
  if (tab === "files" && highlight && !sp.page && !projectId) {
    const { data: hlDoc } = await supabase
      .from("documents")
      .select("created_at, projects!inner ( client_id )")
      .eq("id", highlight)
      .eq("projects.client_id", clientId)
      .single<{ created_at: string }>();
    if (hlDoc) {
      const { count: newer } = await supabase
        .from("documents")
        .select("id, projects!inner ( client_id )", {
          count: "exact",
          head: true,
        })
        .eq("projects.client_id", clientId)
        .gt("created_at", hlDoc.created_at);
      pageNum = Math.floor((newer ?? 0) / PAGE_SIZE) + 1;
    }
  }

  let documents: DocumentTableRow[] = [];
  let total = 0;
  if (tab === "files") {
    const from = (pageNum - 1) * PAGE_SIZE;
    let query = supabase
      .from("documents")
      .select(
        `id, canonical_name, doc_type, file_size, created_at,
         projects!inner ( id, name, client_id )`,
        { count: "exact" },
      )
      .eq("projects.client_id", clientId)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, count } = await query;
    documents = ((data ?? []) as unknown as DocRow[]).map((d) => ({
      id: d.id,
      canonical_name: d.canonical_name,
      doc_type: d.doc_type,
      file_size: d.file_size,
      created_at: d.created_at,
      // Name the project only when the list spans several of them.
      context: projectId ? null : d.projects?.name,
    }));
    total = count ?? 0;
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ---- Share links (share tab) -----------------------------------------
  let shareLinks: FolderShareLinkView[] = [];
  if (tab === "share") {
    const { data: shareData } = await supabase
      .from("folder_share_links")
      .select("id, token, expires_at, revoked_at, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    shareLinks = (shareData ?? []).map((l) => ({
      id: l.id,
      url: `${env.siteUrl()}/share/folder/${l.token}`,
      expires_at: l.expires_at,
      revoked_at: l.revoked_at,
      created_at: l.created_at,
    }));
  }

  const base = `/documents/clients/${clientId}`;
  const projectHref = (id?: string) => (id ? `${base}?project=${id}` : base);
  const uploadHref = `/documents/upload?client=${clientId}`;

  const stats = [
    { label: t("statFiles"), value: String(totalFiles) },
    { label: t("statStorage"), value: formatBytes(totalBytes) },
    { label: t("statProjects"), value: String(projects.length) },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {highlight && <ScrollToHighlight targetId={`file-${highlight}`} />}

      {/* Heading + stats */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {t("eyebrow")}
          </p>
          <h1 className="mt-1.5 break-words text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {client.name}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {t("customerCode")}:{" "}
            <span className="font-mono text-slate-700">{client.code}</span>
            <span className="mx-2 text-slate-300">·</span>
            {client.tax_code ? (
              <>
                {t("taxCode")}:{" "}
                <span className="font-mono text-slate-700">
                  {client.tax_code}
                </span>
              </>
            ) : (
              t("noTaxCode")
            )}
          </p>
        </div>

        <dl className="grid shrink-0 grid-cols-3 gap-2 sm:gap-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:min-w-28 sm:px-4 sm:py-3"
            >
              <dt className="truncate text-xs text-slate-500 sm:text-sm">
                {s.label}
              </dt>
              <dd className="mt-0.5 truncate text-base font-bold text-slate-900 sm:text-xl">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Tabs + search */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav
          aria-label={t("tabsLabel")}
          className="inline-flex w-fit rounded-xl bg-slate-200/60 p-1"
        >
          {(
            [
              { id: "files", href: projectHref(projectId), Icon: FolderOpen, label: t("tabFiles") },
              { id: "share", href: `${base}?tab=share`, Icon: Link2, label: t("tabShare") },
            ] as const
          ).map((item) => (
            <Link
              key={item.id}
              href={item.href}
              aria-current={tab === item.id ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                tab === item.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900",
              )}
            >
              <item.Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
        <DocumentSearch />
      </div>

      {tab === "share" ? (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              {ts("folderShareTitle")}
            </h2>
          </header>
          <div className="min-w-0 overflow-hidden px-5 py-4">
            <FolderShareManager clientId={clientId} links={shareLinks} />
          </div>
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[17rem_minmax(0,1fr)]">
          {/* Projects ("thư mục") — card on xl, chip row below */}
          <section
            aria-label={t("projects")}
            className="hidden self-start rounded-2xl border border-slate-200 bg-white shadow-sm xl:block"
          >
            <header className="flex items-center justify-between px-5 pb-2 pt-4">
              <h2 className="font-semibold text-slate-900">{t("projects")}</h2>
              {canManage && (
                <AddProjectButton
                  client={{ id: client.id, name: client.name }}
                  label={t("addProject")}
                />
              )}
            </header>
            <ul className="space-y-0.5 px-3 pb-3">
              <li>
                <ProjectLink
                  href={projectHref()}
                  active={!projectId}
                  label={t("allFiles")}
                  count={totalFiles}
                  all
                />
              </li>
              {projects.map((p) => (
                <li key={p.id}>
                  <ProjectLink
                    href={projectHref(p.id)}
                    active={p.id === projectId}
                    label={p.name}
                    count={countByProject.get(p.id) ?? 0}
                    archived={p.status === "archived"}
                    archivedLabel={t("archived")}
                  />
                </li>
              ))}
              {projects.length === 0 && (
                <li className="px-3 py-4 text-sm text-slate-400">
                  {t("noProjects")}
                </li>
              )}
            </ul>
            {canManage && selected && (
              <footer className="border-t border-slate-100 px-5 py-3">
                <Link
                  href={`/admin/projects/${selected.id}`}
                  className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-primary"
                >
                  <Settings2 className="h-4 w-4" aria-hidden />
                  {t("manageProject")}
                </Link>
              </footer>
            )}
          </section>

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 xl:hidden">
            <Chip href={projectHref()} active={!projectId}>
              {t("allFiles")} · {totalFiles}
            </Chip>
            {projects.map((p) => (
              <Chip key={p.id} href={projectHref(p.id)} active={p.id === projectId}>
                {p.name} · {countByProject.get(p.id) ?? 0}
              </Chip>
            ))}
            {canManage && (
              <AddProjectButton
                client={{ id: client.id, name: client.name }}
                label={t("addProject")}
              />
            )}
          </div>

          {/* Files */}
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-slate-900">
                  {selected ? selected.name : t("allFiles")}
                </h2>
                <p className="text-sm text-slate-500">
                  {t("fileCount", { count: total })} · {t("uploadLimit")}
                </p>
              </div>
              <Link
                href={uploadHref}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover"
              >
                <CloudUpload className="h-4 w-4" aria-hidden />
                {t("upload")}
              </Link>
            </header>

            {documents.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <FileText className="h-6 w-6" aria-hidden />
                </span>
                <p className="text-sm text-slate-500">{t("noFiles")}</p>
              </div>
            ) : (
              <DocumentTable
                documents={documents}
                highlightId={highlight}
                canDelete={isAdmin}
              />
            )}

            {totalPages > 1 && (
              <div className="border-t border-slate-100 px-5 py-3">
                <Pagination
                  page={pageNum}
                  totalPages={totalPages}
                  total={total}
                  hrefForPage={(p) =>
                    projectId
                      ? `${base}?project=${projectId}&page=${p}`
                      : `${base}?page=${p}`
                  }
                />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ProjectLink({
  href,
  active,
  label,
  count,
  all = false,
  archived = false,
  archivedLabel,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  all?: boolean;
  archived?: boolean;
  archivedLabel?: string;
}) {
  const Icon = archived ? Archive : active ? FolderOpen : Folder;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
        active
          ? "bg-primary/10 font-semibold text-primary"
          : "text-slate-700 hover:bg-slate-50",
        archived && !active && "text-slate-400",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
      <span className={cn("min-w-0 flex-1 truncate", all && "font-medium")}>
        {label}
      </span>
      {archived && (
        <span className="sr-only">({archivedLabel})</span>
      )}
      <span
        className={cn(
          "shrink-0 text-xs tabular-nums",
          active ? "text-primary" : "text-slate-400",
        )}
      >
        {count}
      </span>
    </Link>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
      )}
    >
      {children}
    </Link>
  );
}
