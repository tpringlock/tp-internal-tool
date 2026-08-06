"use client";

import { useActionState } from "react";
import { updateProfile, changePassword } from "@/app/actions/profile";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export function ProfileDetailsForm({
  email,
  fullName,
}: {
  email: string;
  fullName: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateProfile,
    {},
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your details</CardTitle>
      </CardHeader>
      <CardBody>
        <form action={action} className="space-y-4">
          {state.success && <Alert tone="success">{state.success}</Alert>}
          {state.error && <Alert tone="error">{state.error}</Alert>}

          <Field label="Email">
            <Input value={email} disabled readOnly />
          </Field>

          <Field
            label="Full name"
            htmlFor="full_name"
            error={state.fieldErrors?.full_name?.[0]}
          >
            <Input
              id="full_name"
              name="full_name"
              defaultValue={fullName}
              required
            />
          </Field>

          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    changePassword,
    {},
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardBody>
        <form action={action} className="space-y-4">
          {state.success && <Alert tone="success">{state.success}</Alert>}
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

          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Change password"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
