import { requireContentManager } from "@/lib/auth/dal";
import { AdminNav } from "@/components/admin-nav";

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
    <div className="space-y-6">
      <AdminNav role={user.profile.role} />
      {children}
    </div>
  );
}
