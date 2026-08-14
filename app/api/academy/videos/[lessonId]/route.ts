import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACADEMY_BUCKET } from "@/lib/academy/constants";

/**
 * Streams a lesson's self-hosted video. Access is authorised by RLS: the select
 * returns the row only if the caller may see it (course published, or admin).
 *
 * Unlike the PDF route (which proxies the bytes), video is served by redirecting
 * to a short-lived Supabase signed URL. Supabase's storage endpoint honours HTTP
 * Range requests, so the <video> element can seek/scrub, and large files never
 * flow through the Next.js server. The signed URL is private and expires quickly.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, video_storage_path")
    .eq("id", lessonId)
    .single();

  if (!lesson?.video_storage_path) {
    return new NextResponse("Not found", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from(ACADEMY_BUCKET)
    .createSignedUrl(lesson.video_storage_path, 900); // 15 minutes

  if (error || !signed) {
    return new NextResponse("Video unavailable", { status: 502 });
  }

  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, no-store" },
  });
}
