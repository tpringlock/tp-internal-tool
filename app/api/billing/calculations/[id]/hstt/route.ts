import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { buildHstt } from "@/lib/billing/hstt-export";
import { missingMessage } from "@/lib/billing/hstt-data";
import { loadHsttContext, toHsttInput } from "@/lib/billing/hstt-server";
import { XLSX_MIME } from "@/lib/billing/server";

// exceljs needs Node APIs (Buffer, streams).
export const runtime = "nodejs";

/** Shipped with the server bundle via outputFileTracingIncludes (next.config.ts). */
const TEMPLATE = join(process.cwd(), "docs", "hstt", "hstt-template.xlsx");

/**
 * Download the HSTT (4 sheets) of a CONFIRMED billing-month calculation of a
 * real contract. Viewers may download. When data is missing, nothing is
 * generated: 409 with the list of what is missing (the page shows the same
 * list and hides the button).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireBillingViewer();
  const { id } = await params;
  const t = await getTranslations("Hstt");

  const supabase = await createClient();
  const ctx = await loadHsttContext(supabase, id);
  if (!ctx) return new NextResponse("Not found", { status: 404 });
  if (ctx.missing.length > 0) {
    const lines = ctx.missing.map((m) => `- ${missingMessage(t, m)}`);
    return new NextResponse(`${t("missingTitle")}\n${lines.join("\n")}`, {
      status: 409,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }

  const result = await buildHstt(toHsttInput(ctx), await readFile(TEMPLATE));

  await logActivity(supabase, {
    action: "billing.hstt_exported",
    entityType: "billing_calculation",
    entityId: ctx.calc.id,
    metadata: { month: ctx.calc.period_month, after_tax: result.totals.afterTax, closing: result.closingDebt },
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
