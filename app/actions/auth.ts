"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { env } from "@/lib/env";
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  translateFieldErrors,
} from "@/lib/validation";

export interface FormState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[]>;
}

/** Only permit same-origin relative redirect targets. */
function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function login(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const t = await getTranslations("Auth");
    return { error: t("invalidCredentials") };
  }

  await logActivity(supabase, { action: "auth.login" });
  redirect(safeNext(formData.get("next")));
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await logActivity(supabase, { action: "auth.logout" });
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  // The email link lands on /auth/confirm, which verifies the recovery token
  // and forwards to /reset-password.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.siteUrl()}/auth/confirm?next=/reset-password`,
  });

  // Always report success so we don't reveal which emails are registered.
  const t = await getTranslations("Auth");
  return { success: t("resetLinkSent") };
}

export async function updatePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const t = await getTranslations("Auth");
    return { error: t("resetLinkExpired") };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { error: error.message };
  }

  await logActivity(supabase, { action: "auth.password_reset" });
  redirect("/");
}
