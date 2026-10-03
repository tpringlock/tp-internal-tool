"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { TemplateIssue, TemplateReport } from "@/lib/billing/hstt-template";
import { issueValues, sortIssues } from "@/lib/billing/hstt-template-issues";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The check report of an uploaded template: verdict, sheets and their roles, errors, warnings. */
export function TemplateReportView({ report, fileName }: { report: TemplateReport; fileName?: string }) {
  const t = useTranslations("HsttTemplates");
  const order = report.sheets.map((s) => s.name);
  const errors = sortIssues(report.errors, order);
  const warnings = sortIssues(report.warnings, order);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <p
        className={cn(
          "flex items-start gap-2 font-medium",
          report.ok ? (warnings.length ? "text-amber-800" : "text-green-700") : "text-red-700",
        )}
      >
        {report.ok ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        )}
        <span>
          {report.ok
            ? warnings.length
              ? t("reportOkWarnings", { count: warnings.length })
              : t("reportOk")
            : t("reportErrors", { count: errors.length })}
          {fileName && (
            <span className="block break-words text-xs font-normal text-slate-500">
              {fileName} · {formatBytes(report.size)}
            </span>
          )}
        </span>
      </p>

      {report.sheets.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("sheetsTitle")}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {report.sheets.map((s) => (
              <li key={s.name} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                <span className="font-medium">{s.name}</span>
                {": "}
                {s.role === null ? t("roleNone") : s.role === "huong-dan" ? t("roleGuide") : t(`roles.${s.role}`)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <IssueList title={t("errorsTitle")} issues={errors} tone="error" />
      <IssueList title={t("warningsTitle")} issues={warnings} tone="warning" />
    </div>
  );
}

function IssueList({ title, issues, tone }: { title: string; issues: TemplateIssue[]; tone: "error" | "warning" }) {
  const t = useTranslations("HsttTemplates");
  if (issues.length === 0) return null;
  return (
    <div>
      <p className={cn("text-xs font-semibold uppercase tracking-wide", tone === "error" ? "text-red-700" : "text-amber-700")}>
        {title}
      </p>
      <ul className="mt-1 space-y-1.5">
        {issues.map((issue, i) => (
          <li key={i} className="flex gap-2">
            {tone === "error" ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            )}
            <span className="min-w-0 break-words text-slate-700">
              {t(`issue.${issue.code}`, issueValues(issue))}
              {issue.sheet && (
                <span className="block text-xs text-slate-500">
                  {issue.cell ? t("whereCell", { sheet: issue.sheet, cell: issue.cell }) : t("where", { sheet: issue.sheet })}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
