"use server";

import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { rentReportSchema, translateFieldErrors } from "@/lib/validation";
import { getShowDemo } from "@/lib/billing/queries";
import { reportFormValues, reportPeriodQuery, runReport, type ReportSourceFile } from "@/lib/billing/rent-report-server";
import type { RentReport } from "@/lib/billing/rent-report";
import type { Period } from "@/lib/billing/types";
import type { FormState } from "@/app/actions/auth";

// Rent report over many projects (plan section 4). Read-only: nothing is
// saved, so "Chỉ xem" accounts may run it (the read guard, like the pages).

/** Warnings kept per project in the response (the detail page has them all). */
const MAX_WARNINGS = 20;

export interface ReportState extends FormState {
  result?: {
    report: Omit<RentReport, "results">;
    period: Period;
    files: ReportSourceFile[];
    /** Period part of the query string, for the project detail links. */
    query: string;
    loadMs: number;
    calcMs: number;
  };
}

export async function runRentReport(_prev: ReportState, formData: FormData): Promise<ReportState> {
  await requireBillingViewer();
  const parsed = rentReportSchema.safeParse(
    reportFormValues((k) => formData.get(k), (k) => formData.getAll(k)),
  );
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  let run;
  try {
    run = await runReport(supabase, parsed.data, { includeDemo: await getShowDemo() });
  } catch (e) {
    // Parser / merge errors carry a Vietnamese message meant for the user.
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (!run.ok) return { error: run.error };

  const report = {
    ...run.report,
    projects: run.report.projects.map((p) => ({ ...p, warnings: p.warnings.slice(0, MAX_WARNINGS) })),
  };
  return {
    result: {
      report,
      period: run.period,
      files: run.files,
      query: reportPeriodQuery(parsed.data),
      loadMs: run.loadMs,
      calcMs: run.calcMs,
    },
  };
}
