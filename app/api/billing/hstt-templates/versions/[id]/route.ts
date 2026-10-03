import { type NextRequest, NextResponse } from "next/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { downloadTemplateFile } from "@/lib/billing/hstt-templates-server";
import { XLSX_MIME } from "@/lib/billing/server";

/**
 * Download one version of a customer HSTT template, byte for byte as
 * uploaded. The row is read through RLS first (access check), then the
 * object is fetched with the service role; every download is logged.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireBillingViewer();
  const { id } = await params;

  const supabase = await createClient();
  const { data: v } = await supabase
    .from("billing_hstt_template_versions")
    .select("id, template_id, version, storage_path, file_name")
    .eq("id", id)
    .maybeSingle();
  if (!v) return new NextResponse("Not found", { status: 404 });
  const { data: tpl } = await supabase.from("billing_hstt_templates").select("name").eq("id", v.template_id).maybeSingle();

  const file = await downloadTemplateFile(v.storage_path);
  if (!file) return new NextResponse("File not available", { status: 404 });

  await logActivity(supabase, {
    action: "billing.hstt_template_downloaded",
    entityType: "billing_hstt_template",
    entityId: v.template_id,
    metadata: { version: v.version, file_name: v.file_name },
    ip: request.headers.get("x-forwarded-for"),
  });

  const fileName = `${tpl?.name ?? "Mẫu HSTT"} - v${v.version}.xlsx`.replace(/[\\/:*?"<>|]/g, "-");
  const ascii = fileName.normalize("NFD").replace(/[^\x20-\x7E]/g, "").replace(/["\\]/g, "") || "mau-hstt.xlsx";
  return new NextResponse(new Uint8Array(file), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
