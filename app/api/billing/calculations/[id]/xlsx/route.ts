import { type NextRequest, NextResponse } from "next/server";
import { requireBillingUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { exportRentXlsx } from "@/lib/billing/export-xlsx";
import { XLSX_MIME } from "@/lib/billing/server";

// exceljs needs Node APIs (Buffer, streams).
export const runtime = "nodejs";

/**
 * Download a saved rent calculation as .xlsx in the HSTT "I. Thiết bị vật tư"
 * layout. Built from the stored result + contract snapshot, so the file always
 * matches what was calculated (and confirmed), even if prices changed later.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireBillingUser();
  const { id } = await params;

  // RLS: only billing users can read calculations.
  const supabase = await createClient();
  const { data: calc } = await supabase
    .from("billing_rent_calculations")
    .select("id, period_month, status, result, contract_snapshot")
    .eq("id", id)
    .maybeSingle();
  if (!calc) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = await exportRentXlsx(calc.result, calc.contract_snapshot);

  await logActivity(supabase, {
    action: "billing.exported",
    entityType: "billing_calculation",
    entityId: calc.id,
    ip: request.headers.get("x-forwarded-for"),
  });

  const kho = calc.contract_snapshot.misaKho.replace(/[^A-Za-z0-9_-]+/g, "-");
  const draft = calc.status === "draft" ? "-nhap" : calc.status === "voided" ? "-da-huy" : "";
  const result = calc.result;
  const span = calc.period_month ?? `${result.period.from}_${result.period.to}`;
  const fileName = `tien-thue-${kho}-${span}${draft}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
