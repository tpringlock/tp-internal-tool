import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { buildHstt } from "@/lib/billing/hstt-export";
import { validateTemplate } from "@/lib/billing/hstt-template";
import { HSTT_SAMPLE_INPUT } from "@/lib/billing/hstt-templates-server";
import { XLSX_MIME } from "@/lib/billing/server";

// exceljs needs Node APIs (Buffer, streams).
export const runtime = "nodejs";

const text = (body: string, status: number) =>
  new NextResponse(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

/**
 * Admin: trial HSTT from a template that is being uploaded (not stored),
 * filled with the 09/2026 Việt Panel data (800.796.900 after tax), so the
 * layout can be checked in Excel before saving the template.
 */
export async function POST(request: NextRequest) {
  const user = await requireBillingViewer();
  const t = await getTranslations("HsttTemplates");
  if (user.profile.role !== "admin") return text(t("errAdminOnly"), 403);

  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || file.size === 0) return text(t("errChooseFile"), 400);
  const buffer = Buffer.from(await file.arrayBuffer());
  const report = await validateTemplate(buffer);
  if (!report.ok) return text(t("errHasErrors"), 422);

  const result = await buildHstt(HSTT_SAMPLE_INPUT, buffer);
  const fileName = `THỬ - ${result.fileName}`;
  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="HSTT-thu.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
