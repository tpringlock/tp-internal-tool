"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updatePassword, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function ResetPasswordForm() {
  const t = useTranslations("Auth");
  const [state, action, pending] = useActionState<FormState, FormData>(
    updatePassword,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-slate-600">{t("resetIntro")}</p>

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <Field
        label={t("newPassword")}
        htmlFor="password"
        error={state.fieldErrors?.password?.[0]}
        hint={t("passwordHint")}
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
        label={t("confirmPassword")}
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

      <Button type="submit" className="w-full" loading={pending}>
        {pending ? t("saving") : t("setNewPassword")}
      </Button>
    </form>
  );
}
