import { type NextRequest, NextResponse } from "next/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BILLING_BUCKET, XLSX_MIME } from "@/lib/billing/server";

/**
 * Download the file of a past price import, exactly as it was imported (for
 * audit). The log row is read through RLS first, then the object with the
 * service role.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireBillingViewer();
  const { id } = await params;
  const supabase = await createClient();
  const { data: imp } = await supabase
    .from("billing_price_imports")
    .select("storage_path, file_name")
    .eq("id", id)
    .maybeSingle();
  if (!imp) return new NextResponse("Not found", { status: 404 });
  const { data: blob, error } = await createAdminClient().storage.from(BILLING_BUCKET).download(imp.storage_path);
  if (error || !blob) return new NextResponse("File not available", { status: 404 });
  const ascii = imp.file_name.normalize("NFD").replace(/[^\x20-\x7E]/g, "").replace(/["\\]/g, "") || "bang-gia.xlsx";
  return new NextResponse(new Uint8Array(await blob.arrayBuffer()), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(imp.file_name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
