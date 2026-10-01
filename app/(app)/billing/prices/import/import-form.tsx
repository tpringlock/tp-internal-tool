"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, FileSpreadsheet, UploadCloud, XCircle } from "lucide-react";
import {
  confirmPriceImport,
  previewPriceImport,
  type ClientPricePreview,
  type PriceImportState,
} from "@/app/actions/billing-prices";
import type { FieldChange, LineValues, PriceImportMode } from "@/lib/billing/price-import";
import { columnHeader, type PriceColumnKey } from "@/lib/billing/price-sheet";
import { formatNumber } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Excel import of the price table: choose a file -> preview (every error and
 * warning per row, every changed cell old -> new, cleared cells in red) ->
 * confirm. "Thay toàn bộ" lists the rows it will delete and needs an
 * explicit tick. The server checks everything again on confirm.
 */
export function PriceImportForm() {
  const t = useTranslations("BillingPrices");
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<PriceImportMode>("upsert");
  const [ack, setAck] = useState(false);
  const [last, setLast] = useState<"preview" | "confirm">("preview");
  const [previewState, preview, previewing] = useActionState<PriceImportState, FormData>(previewPriceImport, {});
  const [confirmState, confirm, confirming] = useActionState<PriceImportState, FormData>(
    async (prev, fd) => {
      const r = await confirmPriceImport(prev, fd);
      if (r.imported) {
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
      }
      return r;
    },
    {},
  );

  const runPreview = (f: File, m: PriceImportMode) => {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("mode", m);
    setLast("preview");
    setAck(false);
    startTransition(() => preview(fd));
  };

  const state = last === "confirm" ? confirmState : previewState;
  const p: ClientPricePreview | undefined = file ? (state.preview ?? previewState.preview) : undefined;
  const busy = previewing || confirming;
  const needAck = !!p && p.mode === "replace" && p.counts.lines_deleted > 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-primary/60 hover:bg-primary/5",
            busy && "pointer-events-none opacity-70",
          )}
        >
          {busy ? <Spinner className="h-7 w-7 text-primary" /> : <UploadCloud className="h-7 w-7 text-primary" aria-hidden />}
          <span className="text-sm font-medium text-slate-900">
            {file ? file.name : t("chooseFile")}
          </span>
          <span className="text-xs text-slate-500">{t("chooseFileHint")}</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setFile(f);
              runPreview(f, mode);
            }}
          />
        </label>

        <fieldset className="space-y-2 rounded-2xl border border-slate-200 p-4 text-sm">
          <legend className="px-1 font-medium text-slate-700">{t("modeLabel")}</legend>
          {(["upsert", "replace"] as const).map((m) => (
            <label key={m} className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name="mode"
                value={m}
                checked={mode === m}
                onChange={() => {
                  setMode(m);
                  if (file) runPreview(file, m);
                }}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium text-slate-900">{m === "upsert" ? t("modeUpsert") : t("modeReplace")}</span>
                <span className="block text-xs text-slate-500">{m === "upsert" ? t("modeUpsertHint") : t("modeReplaceHint")}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>

      {!file && confirmState.imported && last === "confirm" && (
        <Alert tone="success">
          <p className="font-medium">{confirmState.success}</p>
          <p>{t("importCountsLong", { ...countsArgs(confirmState.imported) })}</p>
          <Link href="/billing/prices" className="font-medium underline">
            {t("backToTable")}
          </Link>
        </Alert>
      )}
      {file && state.error && <Alert tone="error">{state.error}</Alert>}

      {p && !previewing && (
        <>
          <Summary p={p} t={t} />
          {p.issues.length > 0 && <Issues p={p} t={t} />}
          {p.contracts.length > 0 && <Changes p={p} t={t} />}

          {needAck && (
            <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-900">
              <p className="font-semibold">{t("replaceWarning", { count: p.counts.lines_deleted })}</p>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="h-4 w-4" />
                {t("replaceAck", { count: p.counts.lines_deleted })}
              </label>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              loading={confirming}
              disabled={!p.canImport || (needAck && !ack) || busy}
              onClick={() => {
                const fd = new FormData();
                fd.append("file", file!);
                fd.append("mode", p.mode);
                fd.append("expected", JSON.stringify(p.counts));
                if (ack) fd.append("ack_delete", "1");
                setLast("confirm");
                startTransition(() => confirm(fd));
              }}
            >
              {t("confirmImport")}
            </Button>
            {!p.canImport && <span className="text-sm text-red-700">{t("fixErrorsFirst")}</span>}
          </div>
        </>
      )}
    </div>
  );
}

type T = ReturnType<typeof useTranslations<"BillingPrices">>;

function countsArgs(c: ClientPricePreview["counts"]) {
  return {
    inserted: c.lines_inserted,
    updated: c.lines_updated,
    deleted: c.lines_deleted,
    unchanged: c.lines_unchanged,
    created: c.contracts_created,
    contractsUpdated: c.contracts_updated,
  };
}

function Summary({ p, t }: { p: ClientPricePreview; t: T }) {
  const c = p.counts;
  const chip = (label: string, n: number, tone: string) => (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", n > 0 ? tone : "bg-slate-50 text-slate-400 ring-slate-200")}>
      {label}: {formatNumber(n)}
    </span>
  );
  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <FileSpreadsheet className="h-4 w-4 text-slate-500" aria-hidden />
        <span className="font-medium text-slate-900">{p.fileName}</span>
        <span>· {t("fileRows", { count: p.rowCount })}</span>
        <span>· {t("columnsFound", { columns: p.columns.map((k) => columnHeader(k)).join(", ") })}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {chip(t("countInserted"), c.lines_inserted, "bg-green-50 text-green-800 ring-green-200")}
        {chip(t("countUpdated"), c.lines_updated, "bg-blue-50 text-blue-800 ring-blue-200")}
        {chip(t("countDeleted"), c.lines_deleted, "bg-red-50 text-red-800 ring-red-200")}
        {chip(t("countUnchanged"), c.lines_unchanged, "bg-slate-50 text-slate-600 ring-slate-200")}
        {chip(t("countContractsCreated"), c.contracts_created, "bg-green-50 text-green-800 ring-green-200")}
        {chip(t("countContractsUpdated"), c.contracts_updated, "bg-blue-50 text-blue-800 ring-blue-200")}
        {chip(t("countErrors"), p.errorCount, "bg-red-50 text-red-800 ring-red-200")}
        {chip(t("countWarnings"), p.warningCount, "bg-amber-50 text-amber-800 ring-amber-200")}
      </div>
      {p.catalogMissing > 0 && <p className="text-xs text-slate-500">{t("previewCatalogMissing")}</p>}
    </div>
  );
}

function Issues({ p, t }: { p: ClientPricePreview; t: T }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <p className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900">{t("issuesTitle")}</p>
      <ul className="max-h-96 divide-y divide-slate-50 overflow-y-auto text-sm">
        {p.issues.map((i, n) => (
          <li key={n} className={cn("flex gap-2 px-4 py-2", i.level === "error" ? "bg-red-50/50" : "")}>
            {i.level === "error" ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            )}
            <span className="min-w-0">
              <span className="font-medium text-slate-700">
                {i.row === null ? t("wholeFile") : t("rowLabel", { row: i.row })}
                {i.column && ` · ${columnHeader(i.column)}`}
              </span>
              <span className={cn("block break-words", i.level === "error" ? "text-red-800" : "text-amber-900")}>{i.message}</span>
            </span>
          </li>
        ))}
      </ul>
      {p.issuesTruncated && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{t("issuesTruncated")}</p>}
    </div>
  );
}

const LINE_FIELDS: (keyof LineValues)[] = ["ten_vt", "dvt", "unit_price", "print_name", "print_dvt", "note"];

function show(v: string | number | null): string {
  if (v === null || v === "") return "∅";
  return typeof v === "number" ? formatNumber(v) : v;
}

function CellChange({ c }: { c: FieldChange }) {
  return (
    <span className="block break-words text-xs">
      <span className="font-medium text-slate-700">{columnHeader(c.field as PriceColumnKey)}: </span>
      <span className="text-slate-500 line-through">{show(c.old)}</span>
      {" → "}
      <span className={cn("font-medium", c.cleared ? "rounded bg-red-100 px-1 text-red-800" : "text-slate-900")}>{show(c.new)}</span>
    </span>
  );
}

function Changes({ p, t }: { p: ClientPricePreview; t: T }) {
  return (
    <div className="space-y-4">
      {p.contracts.map((c) => (
        <div key={c.misaKho} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-900">
              <span className="font-mono">{c.misaKho}</span>
              {c.isNew && (
                <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 ring-1 ring-inset ring-green-200">
                  {t("newWarehouse", { code: c.code })}
                </span>
              )}
            </p>
            <p className="text-xs text-slate-500">
              {[c.header.misa_kho_name, c.header.customer_name, c.header.contract_no].filter(Boolean).join(" · ")}
              {c.unchanged > 0 && ` · ${t("unchangedRows", { count: c.unchanged })}`}
            </p>
            {c.headerChanges.map((h) => (
              <CellChange key={h.field} c={h} />
            ))}
          </div>
          {c.lines.length > 0 && (
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">{t("colRow")}</th>
                  <th className="px-4 py-2 font-medium">{t("colCode")}</th>
                  <th className="px-4 py-2 font-medium">{t("colAction")}</th>
                  <th className="px-4 py-2 font-medium">{t("colChanges")}</th>
                </tr>
              </thead>
              <tbody>
                {c.lines.map((l) => (
                  <tr
                    key={`${l.maVt}-${l.op}`}
                    className={cn("border-b border-slate-50 align-top last:border-0", l.op === "delete" && "bg-red-50/60")}
                  >
                    <td data-label={t("colRow")} className="px-4 py-2 tabular-nums text-slate-500">
                      {l.row ?? "—"}
                    </td>
                    <td data-label={t("colCode")} className="px-4 py-2 font-mono text-xs">
                      {l.maVt}
                    </td>
                    <td data-label={t("colAction")} className="px-4 py-2 text-xs font-medium">
                      <span
                        className={
                          l.op === "insert" ? "text-green-700" : l.op === "delete" ? "text-red-700" : "text-blue-700"
                        }
                      >
                        {l.op === "insert" ? t("opInsert") : l.op === "delete" ? t("opDelete") : t("opUpdate")}
                      </span>
                    </td>
                    <td data-label={t("colChanges")} className="px-4 py-2">
                      {l.op === "update"
                        ? l.changes.map((ch) => <CellChange key={ch.field} c={ch} />)
                        : LINE_FIELDS.filter((f) => l.values[f] !== "" && l.values[f] !== null).map((f) => (
                            <span key={f} className={cn("block break-words text-xs", l.op === "delete" && "text-red-800 line-through")}>
                              <span className="font-medium">{columnHeader(f as PriceColumnKey)}: </span>
                              {show(l.values[f])}
                            </span>
                          ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      {p.changesTruncated && <p className="text-xs text-slate-500">{t("changesTruncated")}</p>}
    </div>
  );
}
