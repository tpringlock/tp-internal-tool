"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addClient, editClient } from "@/app/actions/clients";
import type { FormState } from "@/app/actions/auth";
import type { Client } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function CreateClientForm() {
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
        <Field label="Name" htmlFor="name" error={state.fieldErrors?.name?.[0]}>
          <Input id="name" name="name" required />
        </Field>
        <Field
          label="Code"
          htmlFor="code"
          error={state.fieldErrors?.code?.[0]}
          hint="Short unique code, e.g. ACME."
        >
          <Input id="code" name="code" required />
        </Field>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Add client"}
      </Button>
    </form>
  );
}

export function ClientRow({ client }: { client: Client }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    editClient,
    {},
  );

  if (!editing) {
    return (
      <tr className="border-b border-slate-50 last:border-0">
        <td className="px-5 py-3 font-medium text-slate-900">{client.name}</td>
        <td className="px-5 py-3 text-slate-600">{client.code}</td>
        <td className="px-5 py-3 text-right">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
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
            <Field label="Name" error={state.fieldErrors?.name?.[0]}>
              <Input name="name" defaultValue={client.name} required />
            </Field>
            <Field label="Code" error={state.fieldErrors?.code?.[0]}>
              <Input name="code" defaultValue={client.code} required />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
            >
              {state.success ? "Done" : "Cancel"}
            </Button>
          </div>
        </form>
      </td>
    </tr>
  );
}
