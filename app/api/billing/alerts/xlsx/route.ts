import { type NextRequest, NextResponse } from "next/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { alertsPeriodSchema } from "@/lib/validation";
import { getShowDemo } from "@/lib/billing/queries";
import { XLSX_MIME } from "@/lib/billing/server";
import { formatBillingMonth } from "@/lib/billing/periods";
import { ALERT_KINDS, filterAlerts, type AlertKind } from "@/lib/billing/alerts";
import { ALERT_KIND_LABELS, exportAlertsXlsx } from "@/lib/billing/alerts-export";
import { alertsInputFrom, runAlerts } from "@/lib/billing/alerts-server";

// exceljs needs Node APIs (Buffer, streams).
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The alert center as .xlsx, for the same period and filter as the page
 * (query string). Read-only: recomputed from the active month files.
 */
export async function GET(request: NextRequest) {
  await requireBillingViewer();
  const sp = request.nextUrl.searchParams;
  const parsed = alertsPeriodSchema.safeParse(Object.fromEntries(sp));
  if (!parsed.success) return new NextResponse("Tham số kỳ không hợp lệ.", { status: 400 });

  const supabase = await createClient();
  let run;
  try {
    run = await runAlerts(supabase, alertsInputFrom(parsed.data), await getShowDemo());
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Không đọc được dữ liệu.", { status: 422 });
  }
  if (!run.ok) return new NextResponse(run.error, { status: 422 });

  const kindParam = sp.get("kind") ?? "";
  const kind = (ALERT_KINDS as readonly string[]).includes(kindParam) ? (kindParam as AlertKind) : "";
  const q = sp.get("q") ?? "";
  const company = sp.get("company") !== "0";
  const alerts = filterAlerts(run.alerts, { kind, q, company });
  const filter = [
    kind ? ALERT_KIND_LABELS[kind] : "mọi loại",
    q ? `tìm "${q}"` : null,
    company ? "gồm kho công ty" : "không gồm kho công ty",
  ]
    .filter(Boolean)
    .join(", ");

  const buffer = await exportAlertsXlsx({
    alerts,
    period: run.period,
    files: run.files.map((f) => `Tháng ${formatBillingMonth(f.month)} · v${f.version}`),
    filter,
  });

  await logActivity(supabase, {
    action: "billing.alerts_exported",
    entityType: "billing_alerts",
    metadata: { from: run.period.from, to: run.period.to, count: alerts.length, kind: kind || null },
    ip: request.headers.get("x-forwarded-for"),
  });

  const fileName = `canh-bao-${run.period.from}_${run.period.to}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
