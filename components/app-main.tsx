"use client";

import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/page-header";

/** Modules that render their own workspace shell (sidebar + content). */
const WORKSPACES = ["/documents", "/academy", "/admin"];

/**
 * Main content frame below the header. Module workspaces are full-bleed (their
 * layout adds the sidebar and content column, no breadcrumb); pages outside a
 * module (/, /profile) keep the centred container with the breadcrumb bar.
 */
export function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = WORKSPACES.some(
    (w) => pathname === w || pathname.startsWith(w + "/"),
  );

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
