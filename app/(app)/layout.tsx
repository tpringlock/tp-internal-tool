import Image from "next/image";
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
    <div className="relative flex min-h-dvh flex-col">
      <Image
        src="/app-bg.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-10 object-cover"
      />
      {/* Light scrim so cards/text stay legible over the photo. */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-white/60" />
      <TopNav fullName={user.profile.full_name} role={user.profile.role} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <PageHeader />
        {children}
      </main>
    </div>
  );
}
