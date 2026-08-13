import { requireUser } from "@/lib/auth/dal";
import { TopNav } from "@/components/top-nav";
import { PageHeader } from "@/components/page-header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-sky-50 via-slate-50 to-slate-50">
      <TopNav fullName={user.profile.full_name} role={user.profile.role} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <PageHeader />
        {children}
      </main>
    </div>
  );
}
