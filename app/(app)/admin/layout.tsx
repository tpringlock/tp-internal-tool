import { requireAdmin } from "@/lib/auth/dal";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guards every /admin/* route. Non-admins are redirected home.
  await requireAdmin();
  return <>{children}</>;
}
