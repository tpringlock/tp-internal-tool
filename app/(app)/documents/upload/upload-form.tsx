"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { uploadDocument } from "@/app/actions/documents";
import type { FormState } from "@/app/actions/auth";
import type { DocType } from "@/lib/db/types";
import { buildCanonicalName } from "@/lib/documents/naming";
import { DOC_TYPES } from "@/lib/documents/constants";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export interface UploadProject {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
}

export function UploadForm({
  projects,
  defaultClientId = "",
}: {
  projects: UploadProject[];
  defaultClientId?: string;
}) {
  const t = useTranslations("Documents");
  const dt = useTranslations("DocTypes");
  const [state, action, pending] = useActionState<FormState, FormData>(
    uploadDocument,
    {},
  );

  const clients = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.clientId, p.clientName);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [projects]);

  // Preselect the client when arriving from its folder, and its project too if
  // there is only one — only if the user actually has access to it.
  const initialClientId = projects.some((p) => p.clientId === defaultClientId)
    ? defaultClientId
    : "";
  const initialProjects = projects.filter(
    (p) => p.clientId === initialClientId,
  );

  const [clientId, setClientId] = useState(initialClientId);
  const [projectId, setProjectId] = useState(
    initialProjects.length === 1 ? initialProjects[0].id : "",
  );
  const [docType, setDocType] = useState<DocType | "">("");

  const clientProjects = projects.filter((p) => p.clientId === clientId);
  const selectedProject = projects.find((p) => p.id === projectId);

  const preview =
    selectedProject && docType
      ? buildCanonicalName({
          clientName: selectedProject.clientName,
          projectName: selectedProject.name,
          docType,
          date: new Date(),
          disambiguator: "xxxx",
        })
      : null;

  return (
    <form action={action} className="space-y-5">
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <Field
        label={t("client")}
        htmlFor="client"
        error={state.fieldErrors?.project_id?.[0]}
      >
        <Select
          id="client"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setProjectId("");
          }}
        >
          <option value="" disabled>
            {t("selectClient")}
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t("project")} htmlFor="project">
        <Select
          id="project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={!clientId}
        >
          <option value="" disabled>
            {clientId ? t("selectProject") : t("chooseClientFirst")}
          </option>
          {clientProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <input type="hidden" name="project_id" value={projectId} />

      <Field
        label={t("documentType")}
        htmlFor="doc_type"
        error={state.fieldErrors?.doc_type?.[0]}
      >
        <Select
          id="doc_type"
          name="doc_type"
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocType)}
        >
          <option value="" disabled>
            {t("selectType")}
          </option>
          {DOC_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {dt(option.value)}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label={t("pdfFile")}
        htmlFor="file"
        error={state.fieldErrors?.file?.[0]}
        hint={t("pdfHint")}
      >
        <Input id="file" name="file" type="file" accept="application/pdf" />
      </Field>

      {preview && (
        <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {t("willBeSavedAs")}{" "}
          <span className="font-mono text-slate-800">{preview}</span>
        </div>
      )}

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="signed"
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
        />
        <span>
          {t.rich("signedConfirm", {
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </span>
      </label>
      {state.fieldErrors?.signed?.[0] && (
        <p className="text-xs text-red-600">{state.fieldErrors.signed[0]}</p>
      )}

      <Button type="submit" loading={pending}>
        {pending ? t("uploading") : t("uploadDocument")}
      </Button>
    </form>
  );
}
