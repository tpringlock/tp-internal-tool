import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { resolveShareToken } from "@/lib/documents/share";

const STORAGE_BUCKET = "documents";

/**
 * Public: streams a shared document's PDF for a valid token. No auth required,
 * but the token must exist and be unexpired/unrevoked. `?dl=1` downloads and is
 * logged as an anonymous open; inline loads (the viewer preview) are not logged
 * here, since the viewer page already records the open.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const share = await resolveShareToken(token);
  if (!share) {
    return new NextResponse("This link is invalid or has expired.", {
      status: 410,
    });
  }

  const download = request.nextUrl.searchParams.get("dl") === "1";
  const admin = createAdminClient();

  const { data: blob, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .download(share.storagePath);
  if (error || !blob) {
    return new NextResponse("File unavailable", { status: 502 });
  }

  if (download) {
    await logActivity(admin, {
      action: "share.downloaded",
      entityType: "document",
      entityId: share.documentId,
      actorUserId: null,
      ip: request.headers.get("x-forwarded-for"),
      metadata: { token },
    });
  }

  const disposition = download ? "attachment" : "inline";
  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(
        share.canonicalName,
      )}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
