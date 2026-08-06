"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { createUser } from "@/app/actions/users";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function CreateUserForm() {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const [state, action, pending] = useActionState<FormState, FormData>(
    createUser,
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
        <Field
          label={tc("fullName")}
          htmlFor="full_name"
          error={state.fieldErrors?.full_name?.[0]}
        >
          <Input id="full_name" name="full_name" required />
        </Field>

        <Field
          label={tc("email")}
          htmlFor="email"
          error={state.fieldErrors?.email?.[0]}
        >
          <Input id="email" name="email" type="email" required />
        </Field>

        <Field label={t("role")} htmlFor="role" error={state.fieldErrors?.role?.[0]}>
          <Select id="role" name="role" defaultValue="employee">
            <option value="employee">{t("employee")}</option>
            <option value="admin">{t("adminRole")}</option>
          </Select>
        </Field>

        <Field
          label={t("tempPassword")}
          htmlFor="password"
          error={state.fieldErrors?.password?.[0]}
          hint={t("tempPasswordHint")}
        >
          <Input
            id="password"
            name="password"
            type="text"
            autoComplete="off"
            required
          />
        </Field>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? t("creating") : t("createUser")}
      </Button>
    </form>
  );
}
