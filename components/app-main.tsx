"use client";

import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/page-header";

/**
 * Main content frame below the header. The Documents module is a full-bleed
 * workspace (its own sidebar, no breadcrumb), so it gets the whole width; every
 * other module keeps the centred container with the breadcrumb bar.
 */
export function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed =
    pathname === "/documents" || pathname.startsWith("/documents/");

  if (fullBleed) {
    return <main className="flex min-w-0 flex-1 flex-col">{children}</main>;
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <PageHeader />
      {children}
    </main>
  );
}
