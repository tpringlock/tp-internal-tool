import { requireAdmin } from "@/lib/auth/dal";
import { AdminNav } from "@/components/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guards every /admin/* route. Non-admins are redirected home.
  await requireAdmin();
  return (
    <div className="space-y-6">
      <AdminNav />
      {children}
    </div>
  );
}
