import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { canManageContent } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceContent } from "@/components/workspace-content";
import { documentCountsByClient } from "@/lib/documents/counts";
import { ClientSidebar, type SidebarClient } from "./client-sidebar";
import { ClientMessages } from "@/components/client-messages";

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

  const [counts, clientRes] = await Promise.all([
    documentCountsByClient(supabase),
    canManage
      ? supabase.from("clients").select("id, name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const byClient = new Map<string, SidebarClient>();
  // Content managers also see customers without documents yet (count stays 0).
  for (const c of clientRes.data ?? []) {
    byClient.set(c.id, { id: c.id, name: c.name, count: 0 });
  }
  for (const row of counts) {
    const existing = byClient.get(row.id);
    if (existing) existing.count = row.count;
    else byClient.set(row.id, { id: row.id, name: row.name, count: row.count });
  }
  const clients = [...byClient.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "vi"),
  );

  return (
    <ClientMessages module="documents">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Suspense>
          <ClientSidebar clients={clients} canManage={canManage} />
        </Suspense>
        <WorkspaceContent>{children}</WorkspaceContent>
      </div>
    </ClientMessages>
  );
}
