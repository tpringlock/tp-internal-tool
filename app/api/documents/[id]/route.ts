import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";

const STORAGE_BUCKET = "documents";

/**
 * Streams a document's PDF. Access is authorised by RLS (the select returns the
 * row only if the user may see it), every access is logged, and the file is
 * fetched with the service role since the bucket is private.
 *
 * `?dl=1` forces a download (attachment); otherwise it renders inline.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const download = request.nextUrl.searchParams.get("dl") === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("id, storage_path, canonical_name")
    .eq("id", id)
    .single();

  if (!doc) {
    return new NextResponse("Not found", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .download(doc.storage_path);

  if (error || !blob) {
    return new NextResponse("File unavailable", { status: 502 });
  }

  await logActivity(supabase, {
    action: download ? "document.downloaded" : "document.viewed",
    entityType: "document",
    entityId: doc.id,
    ip: request.headers.get("x-forwarded-for"),
  });

  const disposition = download ? "attachment" : "inline";
  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(
        doc.canonical_name,
      )}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
