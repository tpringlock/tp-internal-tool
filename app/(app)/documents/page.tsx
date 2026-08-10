import Link from "next/link";
import { Folder, List, Upload } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { DocumentSearch } from "./document-search";

interface DocClientRow {
  projects: { clients: { id: string; name: string } | null } | null;
}

interface ClientFolder {
  id: string;
  name: string;
  count: number;
}

export default async function DocumentsPage() {
  await requireUser();
  const supabase = await createClient();
  const t = await getTranslations("Documents");

  // Derive folders from documents the user can actually see (documents RLS
  // applies), so employees only get folders for clients with visible files and
  // the counts are accurate.
  const { data } = await supabase
    .from("documents")
    .select("projects!inner ( clients!inner ( id, name ) )");

  const rows = (data ?? []) as unknown as DocClientRow[];
  const byClient = new Map<string, ClientFolder>();
  for (const row of rows) {
    const c = row.projects?.clients;
    if (!c) continue;
    const existing = byClient.get(c.id);
    if (existing) existing.count += 1;
    else byClient.set(c.id, { id: c.id, name: c.name, count: 1 });
  }
  const folders = [...byClient.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-primary">{t("title")}</h1>
          <p className="text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/documents/list">
            <Button variant="secondary">
              <List className="mr-1.5 h-4 w-4" />
              {t("viewAsList")}
            </Button>
          </Link>
          <Link href="/documents/upload">
            <Button>
              <Upload className="mr-1.5 h-4 w-4" />
              {t("uploadDocument")}
            </Button>
          </Link>
        </div>
      </div>

      <DocumentSearch />

      {folders.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-500">{t("noDocuments")}</p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((f) => (
            <Link
              key={f.id}
              href={`/documents/clients/${f.id}`}
              className="group"
            >
              <Card className="h-full transition group-hover:border-primary group-hover:shadow-md">
                <CardBody className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Folder className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {f.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {t("filesCount", { count: f.count })}
                    </p>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
