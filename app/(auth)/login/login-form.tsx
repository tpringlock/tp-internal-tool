"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { login, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("Auth");
  const [state, action, pending] = useActionState<FormState, FormData>(
    login,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <Field label={t("email")} htmlFor="email" error={state.fieldErrors?.email?.[0]}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </Field>

      <Field
        label={t("password")}
        htmlFor="password"
        error={state.fieldErrors?.password?.[0]}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Button type="submit" className="w-full" loading={pending}>
        {pending ? t("signingIn") : t("signIn")}
      </Button>

      <div className="text-center">
        <Link
          href="/forgot-password"
          className="text-sm text-slate-600 underline hover:text-slate-900"
        >
          {t("forgotPassword")}
        </Link>
      </div>
    </form>
  );
}
