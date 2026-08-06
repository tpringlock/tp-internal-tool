import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { resolveShareToken } from "@/lib/documents/share";
import { Button } from "@/components/ui/button";

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await resolveShareToken(token);

  if (!share) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 px-4 py-16">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-slate-900">
            Link unavailable
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            This share link is invalid, has been revoked, or has expired. Please
            ask your contact for a new link.
          </p>
        </div>
      </div>
    );
  }

  // Record the anonymous open (service role bypasses RLS).
  const admin = createAdminClient();
  const hdrs = await headers();
  await logActivity(admin, {
    action: "share.opened",
    entityType: "document",
    entityId: share.documentId,
    actorUserId: null,
    ip: hdrs.get("x-forwarded-for"),
    metadata: { token },
  });

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Shared document</p>
            <h1 className="truncate text-sm font-semibold text-slate-900">
              {share.canonicalName}
            </h1>
          </div>
          <a href={`/api/share/${token}?dl=1`}>
            <Button size="sm">Download</Button>
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 p-4">
        <iframe
          title={share.canonicalName}
          src={`/api/share/${token}`}
          className="h-[80vh] w-full rounded-lg border border-slate-200 bg-white"
        />
      </main>
    </div>
  );
}
