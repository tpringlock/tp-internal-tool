import { requireUser } from "@/lib/auth/dal";
import { TopNav } from "@/components/top-nav";
import { AppMain } from "@/components/app-main";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <TopNav
        fullName={user.profile.full_name}
        email={user.email}
        role={user.profile.role}
      />
      <AppMain>{children}</AppMain>
    </div>
  );
}
