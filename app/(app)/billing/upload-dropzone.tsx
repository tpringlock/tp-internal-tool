"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, FileSpreadsheet, UploadCloud, XCircle } from "lucide-react";
import {
  inspectMonthFiles,
  saveMonthFiles,
  type MonthFileRow,
  type MonthFilesState,
} from "@/app/actions/billing-files";
import { formatVnDate } from "@/lib/billing/dates";
import { formatBillingMonth } from "@/lib/billing/periods";
import { formatBytes } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Upload of MISA month files in two steps: pick/drop one or more exports ->
 * the server reads each one and shows the month it covers (or why it is
 * refused: not "Kho: <<Tất cả>>", not a whole month, already uploaded…) ->
 * "Lưu" stores the valid ones as new month versions.
 */
export function UploadDropzone({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("BillingFiles");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, inspect, inspecting] = useActionState<MonthFilesState, FormData>(inspectMonthFiles, {});
  const [result, save, saving] = useActionState<MonthFilesState, FormData>(
    async (prev, fd) => {
      const r = await saveMonthFiles(prev, fd);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      return r;
    },
    {},
  );

  const formData = (list: File[]) => {
    const fd = new FormData();
    for (const f of list) fd.append("files", f);
    return fd;
  };
  const pick = (list: FileList | null) => {
    const chosen = Array.from(list ?? []);
    if (chosen.length === 0) return;
    setFiles(chosen);
    startTransition(() => inspect(formData(chosen)));
  };

  // The preview belongs to the files currently chosen; after saving, the result replaces it.
  const rows: MonthFileRow[] = files.length > 0 ? (preview.files ?? []) : (result.files ?? []);
  const showingResult = files.length === 0 && !!result.files;
  const valid = files.length > 0 ? rows.filter((r) => r.ok).length : 0;
  const busy = inspecting || saving;

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 text-center transition-colors",
          compact ? "py-6" : "py-10",
          dragging
            ? "border-primary bg-primary/5"
            : "border-slate-300 bg-slate-50 hover:border-primary/60 hover:bg-primary/5",
          busy && "pointer-events-none opacity-70",
        )}
      >
        {busy ? <Spinner className="h-7 w-7 text-primary" /> : <UploadCloud className="h-7 w-7 text-primary" aria-hidden />}
        <span className="text-sm font-medium text-slate-900">
          {inspecting ? t("reading") : saving ? t("saving") : t("dropHere")}
        </span>
        <span className="text-xs text-slate-500">{t("dropHint")}</span>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          className="sr-only"
          onChange={(e) => pick(e.target.files)}
        />
      </label>

      {files.length > 0 && preview.error && <Alert tone="error">{preview.error}</Alert>}
      {showingResult && result.success && <Alert tone="success">{result.success}</Alert>}
      {showingResult && result.error && <Alert tone="error">{result.error}</Alert>}

      {rows.length > 0 && !inspecting && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className="flex gap-3 px-3 py-2.5 text-sm">
              {r.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  {r.month && <span className="font-semibold text-slate-900">{t("monthLabel", { month: formatBillingMonth(r.month) })}</span>}
                  <span className="min-w-0 break-words text-slate-600">
                    <FileSpreadsheet className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                    {r.name} · {formatBytes(r.size)}
                  </span>
                </p>
                {r.ok ? (
                  <p className="text-xs text-slate-500">
                    {formatVnDate(r.from!)} – {formatVnDate(r.to!)} · {t("fileStats", { warehouses: r.warehouses!, vouchers: r.vouchers! })}
                    {r.warningCount ? ` · ${t("warningCount", { count: r.warningCount })}` : ""}
                    {" · "}
                    <span className="font-medium text-slate-700">
                      {r.saved
                        ? t("savedAs", { version: r.version! })
                        : r.replaces
                          ? t("willReplace", { version: r.version!, old: r.replaces })
                          : t("willBeFirst")}
                    </span>
                    {r.laterInBatch && !r.saved && <span className="block text-amber-700">{t("laterInBatch")}</span>}
                  </p>
                ) : (
                  <p className="text-xs text-red-700">{r.error}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && !inspecting && preview.files && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            loading={saving}
            disabled={valid === 0}
            onClick={() => startTransition(() => save(formData(files)))}
          >
            {t("saveValid", { count: valid })}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() => {
              setFiles([]);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            {t("cancel")}
          </Button>
        </div>
      )}
    </div>
  );
}
