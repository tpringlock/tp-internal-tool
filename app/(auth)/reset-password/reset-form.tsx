"use client";

import { useActionState } from "react";
import { updatePassword, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updatePassword,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-slate-600">Choose a new password.</p>

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <Field
        label="New password"
        htmlFor="password"
        error={state.fieldErrors?.password?.[0]}
        hint="At least 8 characters, with a letter and a number."
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <Field
        label="Confirm password"
        htmlFor="confirm"
        error={state.fieldErrors?.confirm?.[0]}
      >
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
