"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { uploadDocument } from "@/app/actions/documents";
import type { FormState } from "@/app/actions/auth";
import type { DocType } from "@/lib/db/types";
import { buildCanonicalName } from "@/lib/documents/naming";
import {
  DOC_TYPES,
  MAX_FILE_SIZE,
  ACCEPTED_MIME,
} from "@/lib/documents/constants";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useFormStateToast } from "@/components/ui/toast";

export interface UploadProject {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
}

const NEW_PROJECT = "__new__";

export function UploadForm({
  projects,
  defaultClientId = "",
  allClients,
  canCreateProject = false,
}: {
  projects: UploadProject[];
  defaultClientId?: string;
  /** Full client list for content managers; falls back to clients derived from projects. */
  allClients?: { id: string; name: string }[];
  canCreateProject?: boolean;
}) {
  const t = useTranslations("Documents");
  const dt = useTranslations("DocTypes");
  const [state, action, pending] = useActionState<FormState, FormData>(
    uploadDocument,
    {},
  );
  useFormStateToast(state);

  const clients = useMemo(() => {
    if (allClients) return allClients;
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.clientId, p.clientName);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [projects, allClients]);

  // Preselect the client when arriving from its folder, and its project too if
  // there is only one — only if the user actually has access to it.
  const initialClientId = clients.some((c) => c.id === defaultClientId)
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
  const [newProjectName, setNewProjectName] = useState("");
  // Checked on selection so oversized/non-PDF files are rejected before the
  // form ever posts (a too-large body would otherwise die in the framework).
  const [fileError, setFileError] = useState<string | null>(null);

  const clientProjects = projects.filter((p) => p.clientId === clientId);
  const selectedProject = projects.find((p) => p.id === projectId);
  const creatingProject = projectId === NEW_PROJECT;

  const previewProjectName = creatingProject
    ? newProjectName.trim()
    : selectedProject?.name;
  const previewClientName = clients.find((c) => c.id === clientId)?.name;

  const preview =
    previewClientName && previewProjectName && docType
      ? buildCanonicalName({
          clientName: previewClientName,
          projectName: previewProjectName,
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
          {canCreateProject && clientId && (
            <option value={NEW_PROJECT}>{t("createNewProject")}</option>
          )}
        </Select>
      </Field>
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="client_id" value={clientId} />

      {creatingProject && (
        <Field
          label={t("newProjectName")}
          htmlFor="new_project_name"
          error={state.fieldErrors?.new_project_name?.[0]}
          hint={t("newProjectHint")}
        >
          <Input
            id="new_project_name"
            name="new_project_name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            required
            maxLength={120}
          />
        </Field>
      )}

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
        error={fileError ?? state.fieldErrors?.file?.[0]}
        hint={t("pdfHint")}
      >
        <Input
          id="file"
          name="file"
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) setFileError(null);
            else if (file.type !== ACCEPTED_MIME) setFileError(t("errFilePdf"));
            else if (file.size > MAX_FILE_SIZE) setFileError(t("errFileSize"));
            else setFileError(null);
          }}
        />
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

      <Button type="submit" loading={pending} disabled={!!fileError}>
        {pending ? t("uploading") : t("uploadDocument")}
      </Button>
    </form>
  );
}
