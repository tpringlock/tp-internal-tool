import { NextResponse } from "next/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { buildEditableTemplate } from "@/lib/billing/hstt-template";
import { readStandardTemplate } from "@/lib/billing/hstt-templates-server";
import { XLSX_MIME } from "@/lib/billing/server";

// exceljs needs Node APIs (Buffer, streams).
export const runtime = "nodejs";

/**
 * "Tải mẫu chuẩn để chỉnh": the standard TP template with column Z (roles +
 * row markers) visible and a HUONG_DAN sheet listing the placeholders.
 * Nothing secret in it: any billing account may download it.
 */
export async function GET() {
  await requireBillingViewer();
  const { buffer } = await readStandardTemplate();
  const file = await buildEditableTemplate(buffer);
  const fileName = "Mẫu HSTT chuẩn TP - để chỉnh.xlsx";
  return new NextResponse(new Uint8Array(file), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="mau-hstt-chuan-tp.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
