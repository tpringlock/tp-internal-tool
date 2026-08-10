"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { requestPasswordReset, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const [state, action, pending] = useActionState<FormState, FormData>(
    requestPasswordReset,
    {},
  );

  if (state.success) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{state.success}</Alert>
        <div className="text-center">
          <Link
            href="/login"
            className="text-sm text-slate-600 underline hover:text-slate-900"
          >
            {t("backToSignIn")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-slate-600">{t("forgotIntro")}</p>

      <Field label={t("email")} htmlFor="email" error={state.fieldErrors?.email?.[0]}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </Field>

      <Button type="submit" className="w-full" loading={pending}>
        {pending ? t("sending") : t("sendResetLink")}
      </Button>

      <div className="text-center">
        <Link
          href="/login"
          className="text-sm text-slate-600 underline hover:text-slate-900"
        >
          {t("backToSignIn")}
        </Link>
      </div>
    </form>
  );
}
