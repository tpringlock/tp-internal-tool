"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { addClient, editClient, deleteClient } from "@/app/actions/clients";
import type { FormState } from "@/app/actions/auth";
import type { Client } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
import { useToast, useFormStateToast } from "@/components/ui/toast";

export function CreateClientForm() {
  const t = useTranslations("Admin");
  const [state, action, pending] = useActionState<FormState, FormData>(
    addClient,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

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
          hint={t("clientCodeHint")}
        >
          <Input id="code" name="code" required />
        </Field>
      </div>

      <Button type="submit" loading={pending}>
        {pending ? t("creating") : t("addClientButton")}
      </Button>
    </form>
  );
}

/** Edit form for the client manage page. */
export function EditClientForm({ client }: { client: Client }) {
  const t = useTranslations("Admin");
  const [state, action, pending] = useActionState<FormState, FormData>(
    editClient,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={client.id} />
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")} error={state.fieldErrors?.name?.[0]}>
          <Input name="name" defaultValue={client.name} required />
        </Field>
        <Field
          label={t("code")}
          error={state.fieldErrors?.code?.[0]}
          hint={t("clientCodeHint")}
        >
          <Input name="code" defaultValue={client.code} required />
        </Field>
      </div>
      <Button type="submit" size="sm" loading={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}

/**
 * Delete control for a client: danger button + confirmation dialog, shown to
 * admins only (RLS keeps deletion admin-only regardless). Deleting a client
 * that still has projects is blocked by the DB and surfaced as a toast. When
 * `redirectTo` is set (manage page), the ACTION redirects server-side on
 * success — a client-side push would race the action re-rendering the
 * now-deleted client's page into a 404.
 */
export function DeleteClientButton({
  client,
  redirectTo,
}: {
  client: Client;
  redirectTo?: string;
}) {
  const t = useTranslations("Admin");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    deleteClient,
    {},
  );
  useFormStateToast(state);

  useEffect(() => {
    // Close on any outcome; the toast carries the result. On success with a
    // redirect the action navigates away and this state never arrives.
    if (state.success || state.error) setOpen(false);
    if (state.success) toast(state.success, { tone: "success" });
  }, [state, toast]);

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        <X className="mr-1 h-4 w-4" aria-hidden />
        {t("deleteClient")}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("deleteClient")}
      >
        <p className="text-sm text-slate-600">
          {t("confirmDeleteClientBody", { name: client.name })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <form action={action}>
            <input type="hidden" name="id" value={client.id} />
            <input type="hidden" name="name" value={client.name} />
            {redirectTo && (
              <input type="hidden" name="redirect_to" value={redirectTo} />
            )}
            <Button variant="danger" size="sm" type="submit" loading={pending}>
              {t("confirmDelete")}
            </Button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
