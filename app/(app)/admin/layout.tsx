import { Suspense } from "react";
import { requireContentManager } from "@/lib/auth/dal";
import { AdminNav } from "@/components/admin-nav";
import { WorkspaceContent } from "@/components/workspace-content";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guards every /admin/* route: admins and managers get in, everyone else is
  // redirected home. The users + activity sections add their own admin-only
  // guard and are hidden from managers in AdminNav.
  const user = await requireContentManager();
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <Suspense>
        <AdminNav role={user.profile.role} />
      </Suspense>
      <WorkspaceContent>{children}</WorkspaceContent>
    </div>
  );
}
