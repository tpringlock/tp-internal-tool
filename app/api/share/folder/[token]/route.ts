import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { resolveFolderShareFile } from "@/lib/documents/folder-share";

const STORAGE_BUCKET = "documents";

/**
 * Public: streams one document from a shared client folder. No auth required,
 * but the token must be valid (unexpired/unrevoked) AND the requested `?doc=<id>`
 * must belong to that token's client. `?dl=1` downloads and is logged as an
 * anonymous download; inline loads (viewer preview) are not logged here.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const documentId = request.nextUrl.searchParams.get("doc") ?? "";
  const file = await resolveFolderShareFile(token, documentId);
  if (!file) {
    return new NextResponse("This link is invalid or has expired.", {
      status: 410,
    });
  }

  const download = request.nextUrl.searchParams.get("dl") === "1";
  const admin = createAdminClient();

  const { data: blob, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .download(file.storagePath);
  if (error || !blob) {
    return new NextResponse("File unavailable", { status: 502 });
  }

  if (download) {
    await logActivity(admin, {
      action: "folder_share.downloaded",
      entityType: "document",
      entityId: file.documentId,
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
        file.canonicalName,
      )}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
