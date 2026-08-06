"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function ForgotPasswordForm() {
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
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-slate-600">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>

      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email?.[0]}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      <div className="text-center">
        <Link
          href="/login"
          className="text-sm text-slate-600 underline hover:text-slate-900"
        >
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
