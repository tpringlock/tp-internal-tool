"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { addProject, editProject } from "@/app/actions/projects";
import type { FormState } from "@/app/actions/auth";
import type { Project } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export interface ClientOption {
  id: string;
  name: string;
}

export function CreateProjectForm({ clients }: { clients: ClientOption[] }) {
  const t = useTranslations("Admin");
  const [state, action, pending] = useActionState<FormState, FormData>(
    addProject,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  if (clients.length === 0) {
    return <Alert tone="info">{t("addClientFirst")}</Alert>;
  }

  return (
    <form ref={formRef} action={action} className="space-y-4">
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")} htmlFor="name" error={state.fieldErrors?.name?.[0]}>
          <Input id="name" name="name" required />
        </Field>
        <Field
          label={t("code")}
          htmlFor="code"
          error={state.fieldErrors?.code?.[0]}
          hint={t("projectCodeHint")}
        >
          <Input id="code" name="code" required />
        </Field>
        <Field
          label={t("client")}
          htmlFor="client_id"
          error={state.fieldErrors?.client_id?.[0]}
        >
          <Select id="client_id" name="client_id" defaultValue="" required>
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
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? t("creating") : t("addProjectButton")}
      </Button>
    </form>
  );
}

export function EditProjectForm({
  project,
  clients,
}: {
  project: Project;
  clients: ClientOption[];
}) {
  const t = useTranslations("Admin");
  const [state, action, pending] = useActionState<FormState, FormData>(
    editProject,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={project.id} />
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")} error={state.fieldErrors?.name?.[0]}>
          <Input name="name" defaultValue={project.name} required />
        </Field>
        <Field label={t("code")} error={state.fieldErrors?.code?.[0]}>
          <Input name="code" defaultValue={project.code} required />
        </Field>
        <Field label={t("client")} error={state.fieldErrors?.client_id?.[0]}>
          <Select name="client_id" defaultValue={project.client_id} required>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("status")} error={state.fieldErrors?.status?.[0]}>
          <Select name="status" defaultValue={project.status}>
            <option value="active">{t("active")}</option>
            <option value="archived">{t("archived")}</option>
          </Select>
        </Field>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("saveChanges")}
      </Button>
    </form>
  );
}
