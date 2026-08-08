import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACADEMY_BUCKET } from "@/lib/academy/constants";

/**
 * Streams a course's thumbnail image. Access is authorised by RLS: the course
 * select returns a row only if the caller may see it (published, or admin). The
 * image lives in the private `academy` bucket, so it's fetched with the service
 * role. Pages fall back to /logo-tp.png when a course has no thumbnail_path.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { data: course } = await supabase
    .from("courses")
    .select("thumbnail_path")
    .eq("id", courseId)
    .single();

  if (!course?.thumbnail_path) {
    return new NextResponse("Not found", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage
    .from(ACADEMY_BUCKET)
    .download(course.thumbnail_path);

  if (error || !blob) {
    return new NextResponse("Image unavailable", { status: 502 });
  }

  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": blob.type || "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
