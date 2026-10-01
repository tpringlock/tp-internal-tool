import { type NextRequest, NextResponse } from "next/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { BILLING_BUCKET, XLSX_MIME } from "@/lib/billing/server";

/**
 * Download an uploaded MISA source file (any version, month file or legacy),
 * byte for byte as uploaded. Billing users and "Chỉ xem" accounts.
 * The row is read through RLS first (access check), then the object is
 * fetched with the service role; every download is logged.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireBillingViewer();
  const { id } = await params;

  const supabase = await createClient();
  const { data: upload } = await supabase
    .from("billing_misa_uploads")
    .select("id, storage_path, file_name, file_from, file_to")
    .eq("id", id)
    .maybeSingle();
  if (!upload) return new NextResponse("Not found", { status: 404 });

  const { data: month } = await supabase
    .from("billing_misa_month_files")
    .select("month, version")
    .eq("upload_id", id)
    .maybeSingle();

  const { data: blob, error } = await createAdminClient().storage.from(BILLING_BUCKET).download(upload.storage_path);
  if (error || !blob) return new NextResponse("File not available", { status: 404 });

  await logActivity(supabase, {
    action: "billing.upload_downloaded",
    entityType: "billing_upload",
    entityId: upload.id,
    metadata: { file_name: upload.file_name, month: month?.month ?? null, version: month?.version ?? null },
    ip: request.headers.get("x-forwarded-for"),
  });

  // "MISA-2026-08-v3.xlsx" for month files, the original name otherwise.
  const fileName = month ? `MISA-${month.month}-v${month.version}.xlsx` : upload.file_name;
  const ascii = fileName.normalize("NFD").replace(/[^\x20-\x7E]/g, "").replace(/["\\]/g, "") || "misa.xlsx";
  return new NextResponse(new Uint8Array(await blob.arrayBuffer()), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
