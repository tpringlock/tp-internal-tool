import { type NextRequest, NextResponse } from "next/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { rentReportSchema } from "@/lib/validation";
import { getShowDemo } from "@/lib/billing/queries";
import { XLSX_MIME } from "@/lib/billing/server";
import { formatBillingMonth } from "@/lib/billing/periods";
import { reportFormValues, reportTitle, runReport } from "@/lib/billing/rent-report-server";
import { exportRentReportXlsx } from "@/lib/billing/rent-report-export";

// exceljs needs Node APIs (Buffer, streams).
export const runtime = "nodejs";
// 200+ warehouses: read the month files, run every contract, write ~200 sheets.
export const maxDuration = 60;

/**
 * The rent report over many projects as .xlsx (Tổng hợp, Danh sách dự án,
 * one sheet per project), with formulas and their computed values. POST
 * because the form carries up to a few hundred contract ids. Read-only:
 * recalculates from the active month files, nothing is saved, so "Chỉ xem"
 * accounts may export too.
 */
export async function POST(request: NextRequest) {
  await requireBillingViewer();
  const form = await request.formData();
  const parsed = rentReportSchema.safeParse(reportFormValues((k) => form.get(k), (k) => form.getAll(k)));
  if (!parsed.success) return new NextResponse("Tham số báo cáo không hợp lệ.", { status: 400 });

  const supabase = await createClient();
  let run;
  try {
    run = await runReport(supabase, parsed.data, { includeDemo: await getShowDemo(), keepResults: true });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Không tính được báo cáo.", { status: 422 });
  }
  if (!run.ok) return new NextResponse(run.error, { status: 422 });

  const buffer = await exportRentReportXlsx({
    report: run.report,
    results: run.report.results ?? new Map(),
    period: run.period,
    files: run.files.map((f) => `Tháng ${formatBillingMonth(f.month)} · v${f.version}`),
    title: reportTitle(parsed.data),
  });

  await logActivity(supabase, {
    action: "billing.report_exported",
    entityType: "billing_report",
    metadata: {
      from: run.period.from,
      to: run.period.to,
      projects: run.report.projects.length,
      errors: run.report.errorCount,
      total: run.report.total,
    },
    ip: request.headers.get("x-forwarded-for"),
  });

  const span = parsed.data.mode === "preset" ? parsed.data.month : `${run.period.from}_${run.period.to}`;
  const fileName = `bao-cao-tien-thue-${span}-${run.report.projects.length}-du-an.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
