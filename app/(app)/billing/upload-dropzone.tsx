"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { uploadMisaFiles, type UploadState } from "@/app/actions/billing";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Drag-and-drop (or click) upload for MISA "Sổ chi tiết vật tư hàng hóa"
 * exports. Several files can go at once (e.g. August + September); the
 * server parses each before storing it and reports per-file problems.
 */
export function UploadDropzone({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Billing");
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [state, action, pending] = useActionState<UploadState, FormData>(
    async (prev, formData) => {
      const result = await uploadMisaFiles(prev, formData);
      formRef.current?.reset();
      return result;
    },
    {},
  );

  const submit = () => formRef.current?.requestSubmit();

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!inputRef.current || e.dataTransfer.files.length === 0) return;
          inputRef.current.files = e.dataTransfer.files;
          submit();
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 text-center transition-colors",
          compact ? "py-6" : "py-10",
          dragging
            ? "border-primary bg-primary/5"
            : "border-slate-300 bg-slate-50 hover:border-primary/60 hover:bg-primary/5",
          pending && "pointer-events-none opacity-70",
        )}
      >
        {pending ? (
          <Spinner className="h-7 w-7 text-primary" />
        ) : (
          <UploadCloud className="h-7 w-7 text-primary" aria-hidden />
        )}
        <span className="text-sm font-medium text-slate-900">
          {pending ? t("uploading") : t("dropHere")}
        </span>
        <span className="text-xs text-slate-500">{t("dropHint")}</span>
        <input
          ref={inputRef}
          type="file"
          name="files"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) submit();
          }}
        />
      </label>

      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && (
        <Alert tone="error">
          <p className="font-medium">{state.error}</p>
          {state.fileErrors && (
            <ul className="mt-1 space-y-0.5">
              {state.fileErrors.map((e) => (
                <li key={e} className="flex gap-1.5">
                  <FileSpreadsheet
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    aria-hidden
                  />
                  <span className="min-w-0 break-words">{e}</span>
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
    </form>
  );
}
