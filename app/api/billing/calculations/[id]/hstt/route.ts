import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { buildHstt } from "@/lib/billing/hstt-export";
import { missingMessage } from "@/lib/billing/hstt-data";
import { loadHsttContext, toHsttInput } from "@/lib/billing/hstt-server";
import { HsttTemplateError } from "@/lib/billing/hstt-template";
import { resolveHsttTemplate } from "@/lib/billing/hstt-templates-server";
import { XLSX_MIME } from "@/lib/billing/server";

// exceljs needs Node APIs (Buffer, streams).
export const runtime = "nodejs";

const text = (body: string, status: number) =>
  new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });

/**
 * Download the HSTT (4 sheets) of a CONFIRMED billing-month calculation of a
 * real contract, filled into the contract's template (GĐ4) or the standard
 * TP one. Viewers may download. When data is missing, nothing is generated:
 * 409 with the list of what is missing (the page shows the same list and
 * hides the button). Every download is logged in billing_hstt_exports with
 * the template version and sha256 it was generated from.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireBillingViewer();
  const { id } = await params;
  const t = await getTranslations("Hstt");
  const tt = await getTranslations("HsttTemplates");

  const supabase = await createClient();
  const ctx = await loadHsttContext(supabase, id);
  if (!ctx) return text("Not found", 404);
  if (ctx.missing.length > 0) {
    const lines = ctx.missing.map((m) => `- ${missingMessage(t, m)}`);
    return text(`${t("missingTitle")}\n${lines.join("\n")}`, 409);
  }

  const template = await resolveHsttTemplate(supabase, ctx.contract.id);
  if ("error" in template) return text(tt("errTemplateFileMissing", { name: template.template.name }), 409);

  const input = toHsttInput(ctx);
  let result: Awaited<ReturnType<typeof buildHstt>>;
  try {
    result = await buildHstt(input, template.buffer);
  } catch (e) {
    if (e instanceof HsttTemplateError) {
      return text(tt("errTemplateBroken", { name: template.template?.name ?? tt("standard") }), 409);
    }
    throw e;
  }

  const { error: logError } = await supabase.from("billing_hstt_exports").insert({
    contract_id: ctx.contract.id,
    calculation_id: ctx.calc.id,
    contract_code: ctx.contract.code,
    customer_name: input.customer.ten_in_hoa,
    period_month: input.month,
    template_version_id: template.template?.versionId ?? null,
    template_sha256: template.sha256,
    file_name: result.fileName,
    after_tax: result.totals.afterTax,
    closing_debt: result.closingDebt,
    exported_by: user.id,
  });
  // The file must be traceable to its template: no log, no file.
  if (logError) return text(tt("errExportLog", { message: logError.message }), 500);

  await logActivity(supabase, {
    action: "billing.hstt_exported",
    entityType: "billing_calculation",
    entityId: ctx.calc.id,
    metadata: {
      month: ctx.calc.period_month,
      after_tax: result.totals.afterTax,
      closing: result.closingDebt,
      template_id: template.template?.templateId ?? null,
      template_version: template.template?.version ?? null,
    },
    ip: request.headers.get("x-forwarded-for"),
  });

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="HSTT.xlsx"; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
