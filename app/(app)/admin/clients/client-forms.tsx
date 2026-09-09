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

export function ClientRow({
  client,
  canDelete,
}: {
  client: Client;
  canDelete?: boolean;
}) {
  const t = useTranslations("Admin");
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    editClient,
    {},
  );

  if (!editing) {
    return (
      <tr className="border-b border-slate-50 last:border-0">
        <td data-label={t("name")} className="px-5 py-3 font-medium text-slate-900">
          {client.name}
        </td>
        <td data-label={t("code")} className="px-5 py-3 text-slate-600">
          {client.code}
        </td>
        <td className="px-5 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              {t("edit")}
            </Button>
            {canDelete && <DeleteClientButton client={client} />}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-slate-50 last:border-0">
      <td colSpan={3} className="px-5 py-3">
        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={client.id} />
          {state.success && <Alert tone="success">{state.success}</Alert>}
          {state.error && <Alert tone="error">{state.error}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("name")} error={state.fieldErrors?.name?.[0]}>
              <Input name="name" defaultValue={client.name} required />
            </Field>
            <Field label={t("code")} error={state.fieldErrors?.code?.[0]}>
              <Input name="code" defaultValue={client.code} required />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={pending}>
              {pending ? t("saving") : t("save")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
            >
              {state.success ? t("done") : t("cancel")}
            </Button>
          </div>
        </form>
      </td>
    </tr>
  );
}

/**
 * Delete control for a client row: danger button + confirmation dialog, shown
 * to admins only (RLS keeps deletion admin-only regardless). Deleting a client
 * that still has projects is blocked by the DB and surfaced as a toast.
 */
function DeleteClientButton({ client }: { client: Client }) {
  const t = useTranslations("Admin");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    deleteClient,
    {},
  );
  useFormStateToast(state);

  useEffect(() => {
    // Close on any outcome; the toast carries the result. On success the row
    // itself disappears with the revalidated list.
    if (state.success || state.error) setOpen(false);
    if (state.success) toast(state.success, { tone: "success" });
  }, [state, toast]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("deleteClient")}
        title={t("deleteClient")}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
      >
        <X className="h-4 w-4" />
      </button>

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
            <Button variant="danger" size="sm" type="submit" loading={pending}>
              {t("confirmDelete")}
            </Button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
