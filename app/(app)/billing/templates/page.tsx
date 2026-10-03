import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Download, FileSpreadsheet, Power, RotateCcw, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import {
  deleteHsttTemplate,
  reuseHsttTemplateVersion,
  setHsttTemplateStatus,
} from "@/app/actions/billing-hstt-templates";
import { getProfileNames } from "@/lib/billing/queries";
import type { BillingHsttTemplate, BillingHsttTemplateVersion } from "@/lib/db/types";
import { formatBytes, formatDateTime } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DownloadLink } from "@/components/ui/download-link";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { cn } from "@/lib/utils";
import { ActionButton } from "../action-button";
import { TemplateUpload } from "./template-upload";

/**
 * Customer HSTT templates (GĐ4): the standard TP template (download prepared
 * for editing), every customer template with its current version, the
 * contracts using it, how many HSTT files it produced and its version
 * history. Admins upload / reuse versions / retire / delete; everyone with
 * billing access can read and download.
 */
export default async function HsttTemplatesPage() {
  const user = await requireBillingViewer();
  const isAdmin = user.profile.role === "admin";
  const t = await getTranslations("HsttTemplates");
  const supabase = await createClient();

  const [{ data: tplRows }, { data: verRows }, { data: links }, { data: exportRows }] = await Promise.all([
    supabase.from("billing_hstt_templates").select("*").order("status").order("name").limit(1000),
    supabase.from("billing_hstt_template_versions").select("*").order("version", { ascending: false }).limit(1000),
    supabase.from("billing_contract_hstt_templates").select("contract_id, template_id").limit(1000),
    supabase.from("billing_hstt_exports").select("template_version_id").not("template_version_id", "is", null).limit(1000),
  ]);
  const templates = tplRows ?? [];
  const versions = new Map<string, BillingHsttTemplateVersion[]>();
  for (const v of verRows ?? []) versions.set(v.template_id, [...(versions.get(v.template_id) ?? []), v]);
  const exportsByVersion = new Map<string, number>();
  for (const e of exportRows ?? []) {
    if (e.template_version_id) exportsByVersion.set(e.template_version_id, (exportsByVersion.get(e.template_version_id) ?? 0) + 1);
  }
  const contractIds = [...new Set((links ?? []).map((l) => l.contract_id))];
  const { data: contracts } = contractIds.length
    ? await supabase.from("billing_contracts").select("id, code").in("id", contractIds)
    : { data: [] };
  const codeOf = new Map((contracts ?? []).map((c) => [c.id, c.code]));
  const contractsOf = new Map<string, { id: string; code: string }[]>();
  for (const l of links ?? []) {
    contractsOf.set(l.template_id, [...(contractsOf.get(l.template_id) ?? []), { id: l.contract_id, code: codeOf.get(l.contract_id) ?? "?" }]);
  }
  const names = await getProfileNames(supabase, (verRows ?? []).map((v) => v.created_by));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <ModuleEyebrow id="billing" />
          <h1 className={pageTitleClass}>{t("title")}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        <DownloadLink
          href="/api/billing/hstt-templates/standard"
          className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 hover:border-primary hover:text-primary"
        >
          <Download className="h-4 w-4" aria-hidden />
          {t("downloadStandard")}
        </DownloadLink>
      </div>

      <Card>
        <CardBody className="text-sm text-slate-600">
          <details>
            <summary className="cursor-pointer font-medium text-slate-800">{t("howToTitle")}</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>{t("howTo1")}</li>
              <li>{t("howTo2")}</li>
              <li className="font-medium text-slate-800">{t("howTo3")}</li>
              <li>{t("howTo4")}</li>
              <li>{t("howTo5")}</li>
            </ol>
            <p className="mt-2 text-xs text-slate-500">{t("howToDoc")}</p>
          </details>
        </CardBody>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{t("uploadTitle")}</CardTitle>
            <p className="mt-1 text-sm text-slate-500">{t("uploadSubtitle")}</p>
          </CardHeader>
          <CardBody>
            <TemplateUpload templates={templates.filter((x) => x.status === "active").map((x) => ({ id: x.id, name: x.name }))} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="flex items-start gap-3 text-sm">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="font-semibold text-slate-900">{t("standard")}</p>
            <p className="text-slate-500">{t("standardHint")}</p>
          </div>
        </CardBody>
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">{t("templatesTitle", { count: templates.length })}</h2>
        {templates.length === 0 && <p className="text-sm text-slate-500">{t("noTemplates")}</p>}
        {templates.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            tpl={tpl}
            versions={versions.get(tpl.id) ?? []}
            contracts={contractsOf.get(tpl.id) ?? []}
            exportsByVersion={exportsByVersion}
            names={names}
            isAdmin={isAdmin}
            t={t}
          />
        ))}
      </section>
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"HsttTemplates">>>;

function TemplateCard({
  tpl,
  versions,
  contracts,
  exportsByVersion,
  names,
  isAdmin,
  t,
}: {
  tpl: BillingHsttTemplate;
  versions: BillingHsttTemplateVersion[];
  contracts: { id: string; code: string }[];
  exportsByVersion: Map<string, number>;
  names: Map<string, string>;
  isAdmin: boolean;
  t: T;
}) {
  const current = versions[0];
  const active = tpl.status === "active";
  const exports = versions.reduce((n, v) => n + (exportsByVersion.get(v.id) ?? 0), 0);
  const byId = new Map(versions.map((v) => [v.id, v]));

  return (
    <Card className={cn(!active && "bg-slate-50/60")}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="break-words">{tpl.name}</CardTitle>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-medium ring-1 ring-inset",
                  active ? "bg-green-50 text-green-800 ring-green-200" : "bg-slate-100 text-slate-500 ring-slate-200",
                )}
              >
                {active ? t("active") : t("retired")}
              </span>
              {current && <span>{t("currentVersion", { version: current.version })}</span>}
              <span>{t("exportsCount", { count: exports })}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {current && <VersionDownload v={current} t={t} />}
            {isAdmin && (
              <ActionButton
                action={setHsttTemplateStatus}
                id={tpl.id}
                fields={{ status: active ? "retired" : "active" }}
                label={active ? t("retire") : t("reactivate")}
                title={active ? t("retireTitle", { name: tpl.name }) : t("reactivateTitle", { name: tpl.name })}
                body={active ? t("retireBody") : t("reactivateBody")}
                confirmLabel={active ? t("retire") : t("reactivate")}
                icon={<Power className="h-4 w-4" aria-hidden />}
                iconOnly
              />
            )}
            {isAdmin && (
              <ActionButton
                action={deleteHsttTemplate}
                id={tpl.id}
                label={t("delete")}
                title={t("deleteTitle", { name: tpl.name })}
                body={t("deleteBody")}
                confirmLabel={t("delete")}
                variant="danger"
                icon={<Trash2 className="h-4 w-4" aria-hidden />}
                iconOnly
              />
            )}
          </div>
        </div>
      </CardHeader>
      <CardBody className="space-y-3 text-sm">
        {current && (
          <p className="break-words text-slate-600">
            <span className="font-medium text-slate-900">{current.file_name}</span> · {formatBytes(current.size_bytes)}
            {current.report.warnings.length > 0 && (
              <span className="text-amber-700"> · {t("warningsCount", { count: current.report.warnings.length })}</span>
            )}
            <span className="block text-xs text-slate-500">
              {t("uploaded", { name: names.get(current.created_by) ?? "—", date: formatDateTime(current.created_at) })}
              {current.note && ` · ${current.note}`}
            </span>
          </p>
        )}
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("contractsUsing")}</span>
          {contracts.length === 0 ? (
            <p className="text-slate-500">{t("noContracts")}</p>
          ) : (
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              {contracts.map((c) => (
                <Link key={c.id} href={`/billing/contracts/${c.id}?tab=hstt`} className="font-medium text-primary hover:underline">
                  {c.code}
                </Link>
              ))}
            </p>
          )}
        </div>
        {versions.length > 1 && (
          <details>
            <summary className="cursor-pointer font-medium text-slate-700">{t("historyTitle", { count: versions.length })}</summary>
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {versions.map((v, i) => (
                <li key={v.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0 text-xs text-slate-600">
                    <p className="text-sm">
                      <span className="font-semibold text-slate-900">{t("versionShort", { version: v.version })}</span>{" "}
                      <span className="break-words">{v.file_name}</span>
                      {v.reused_from && byId.get(v.reused_from) && (
                        <span className="text-slate-500"> · {t("reusedFrom", { version: byId.get(v.reused_from)!.version })}</span>
                      )}
                    </p>
                    <p>
                      {t("uploaded", { name: names.get(v.created_by) ?? "—", date: formatDateTime(v.created_at) })}
                      {v.note && ` · ${v.note}`}
                      {" · "}
                      {t("exportsCount", { count: exportsByVersion.get(v.id) ?? 0 })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <VersionDownload v={v} t={t} />
                    {isAdmin && active && i > 0 && (
                      <ActionButton
                        action={reuseHsttTemplateVersion}
                        id={v.id}
                        label={t("reuse")}
                        title={t("reuseTitle", { version: v.version })}
                        body={t("reuseBody", { version: v.version })}
                        confirmLabel={t("reuse")}
                        icon={<RotateCcw className="h-4 w-4" aria-hidden />}
                        iconOnly
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardBody>
    </Card>
  );
}

function VersionDownload({ v, t }: { v: BillingHsttTemplateVersion; t: T }) {
  return (
    <DownloadLink
      href={`/api/billing/hstt-templates/versions/${v.id}`}
      title={t("download")}
      className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900 hover:border-primary hover:text-primary"
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      {t("download")}
    </DownloadLink>
  );
}
