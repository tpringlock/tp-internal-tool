import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACADEMY_BUCKET } from "@/lib/academy/constants";

/**
 * Streams a course-level PDF document. Access is authorised by RLS: the select
 * returns the row only if the caller may see it (the course is published, or the
 * caller is an admin). The file is then fetched with the service role, since the
 * `academy` bucket is private. Mirrors the lesson-file route.
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

  const { data: file } = await supabase
    .from("course_files")
    .select("id, storage_path, file_name")
    .eq("id", id)
    .single();

  if (!file) {
    return new NextResponse("Not found", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage
    .from(ACADEMY_BUCKET)
    .download(file.storage_path);

  if (error || !blob) {
    return new NextResponse("File unavailable", { status: 502 });
  }

  const disposition = download ? "attachment" : "inline";
  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(
        file.file_name,
      )}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
