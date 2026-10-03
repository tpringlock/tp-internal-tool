"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, UploadCloud } from "lucide-react";
import { checkHsttTemplate, saveHsttTemplate, type TemplateCheckState } from "@/app/actions/billing-hstt-templates";
import { fetchDownload } from "@/lib/fetch-download";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { TemplateReportView } from "./template-report";

/**
 * Admin upload of a customer template in two steps: pick a file -> the
 * server checks it and shows the report; a trial HSTT (09/2026 Việt Panel)
 * can be downloaded -> "Lưu mẫu" stores it as a new template or as the next
 * version of an existing one (checked again on the server).
 */
export function TemplateUpload({ templates }: { templates: { id: string; name: string }[] }) {
  const t = useTranslations("HsttTemplates");
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [checkedFor, setCheckedFor] = useState<File | null>(null);
  const [mode, setMode] = useState<"new" | "version">("new");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [previewing, setPreviewing] = useState(false);

  const [checked, check, checking] = useActionState<TemplateCheckState, FormData>(async (prev, fd) => {
    const r = await checkHsttTemplate(prev, fd);
    setCheckedFor(fd.get("file") as File);
    return r;
  }, {});
  const [saved, save, saving] = useActionState<TemplateCheckState, FormData>(async (prev, fd) => {
    const r = await saveHsttTemplate(prev, fd);
    if (r.success) {
      setFile(null);
      setName("");
      setNote("");
      if (inputRef.current) inputRef.current.value = "";
    }
    return r;
  }, {});

  const pick = (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    setFile(f);
    const fd = new FormData();
    fd.append("file", f);
    startTransition(() => check(fd));
  };
  const report = file && checkedFor === file && !checking ? checked.report : undefined;
  const busy = checking || saving;

  const preview = async () => {
    if (!file) return;
    setPreviewing(true);
    const body = new FormData();
    body.append("file", file);
    const error = await fetchDownload("/api/billing/hstt-templates/preview", { method: "POST", body }, "HSTT-thu.xlsx", t("previewFailed"));
    setPreviewing(false);
    if (error) toast(error, { tone: "error" });
  };
  const submit = () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("note", note);
    if (mode === "version") fd.append("template_id", templateId);
    else fd.append("name", name);
    startTransition(() => save(fd));
  };

  return (
    <div className="space-y-4">
      {!file && saved.success && <Alert tone="success">{saved.success}</Alert>}

      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition-colors hover:border-primary/60 hover:bg-primary/5",
          busy && "pointer-events-none opacity-70",
        )}
      >
        {checking ? <Spinner className="h-7 w-7 text-primary" /> : <UploadCloud className="h-7 w-7 text-primary" aria-hidden />}
        <span className="text-sm font-medium text-slate-900">{file ? file.name : t("chooseFile")}</span>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => pick(e.target.files)}
        />
      </label>

      {file && checkedFor === file && checked.error && <Alert tone="error">{checked.error}</Alert>}
      {report && <TemplateReportView report={report} fileName={file?.name} />}

      {report?.ok && (
        <div className="space-y-4 rounded-xl border border-slate-200 p-4">
          <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm" disabled={saving}>
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" checked={mode === "new"} onChange={() => setMode("new")} />
              {t("modeNew")}
            </label>
            <label className={cn("flex items-center gap-2", templates.length === 0 && "opacity-50")}>
              <input
                type="radio"
                name="mode"
                checked={mode === "version"}
                disabled={templates.length === 0}
                onChange={() => setMode("version")}
              />
              {t("modeVersion")}
            </label>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === "new" ? (
              <Field label={t("name")} htmlFor="tpl-name" error={saved.fieldErrors?.name?.[0]}>
                <Input
                  id="tpl-name"
                  value={name}
                  maxLength={120}
                  placeholder={t("namePlaceholder")}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
            ) : (
              <Field label={t("template")} htmlFor="tpl-id">
                <Select id="tpl-id" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  {templates.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={t("note")} htmlFor="tpl-note">
              <Input
                id="tpl-note"
                value={note}
                maxLength={500}
                placeholder={t("notePlaceholder")}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
          {saved.error && <Alert tone="error">{saved.error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" loading={previewing} disabled={saving} onClick={preview}>
              <Download className="h-4 w-4" aria-hidden />
              {t("preview")}
            </Button>
            <Button
              type="button"
              loading={saving}
              disabled={previewing || (mode === "new" ? !name.trim() : !templateId)}
              onClick={submit}
            >
              {t("save")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
