import { requireUser } from "@/lib/auth/dal";
import { canManageContent } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { ClientSidebar, type SidebarClient } from "./client-sidebar";

interface DocClientRow {
  projects: { clients: { id: string; name: string } | null } | null;
}

/**
 * Documents workspace shell: the customer ("công ty") sidebar on the left and
 * the page on the right. Customers are derived from the documents the user can
 * see (documents RLS applies), so employees only get customers with files they
 * were given access to, and counts match what they can open. Content managers
 * also see customers without documents yet so they can start filing.
 */
export default async function DocumentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const canManage = canManageContent(user.profile.role);
  const supabase = await createClient();

  const [{ data: docRows }, clientRes] = await Promise.all([
    supabase
      .from("documents")
      .select("projects!inner ( clients!inner ( id, name ) )"),
    canManage
      ? supabase.from("clients").select("id, name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const byClient = new Map<string, SidebarClient>();
  for (const c of clientRes.data ?? []) {
    byClient.set(c.id, { id: c.id, name: c.name, count: 0 });
  }
  for (const row of (docRows ?? []) as unknown as DocClientRow[]) {
    const c = row.projects?.clients;
    if (!c) continue;
    const existing = byClient.get(c.id);
    if (existing) existing.count += 1;
    else byClient.set(c.id, { id: c.id, name: c.name, count: 1 });
  }
  const clients = [...byClient.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "vi"),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <ClientSidebar clients={clients} canManage={canManage} />
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </div>
    </div>
  );
}
