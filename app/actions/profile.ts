"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import {
  updateProfileSchema,
  changePasswordSchema,
  translateFieldErrors,
} from "@/lib/validation";
import type { FormState } from "@/app/actions/auth";

export async function updateProfile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = updateProfileSchema.safeParse({
    full_name: formData.get("full_name"),
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
    const tc = await getTranslations("Common");
    return { error: tc("sessionExpired") };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name })
    .eq("id", user.id);
  if (error) return { error: error.message };

  await logActivity(supabase, {
    action: "profile.update",
    entityType: "profile",
    entityId: user.id,
  });
  revalidatePath("/profile");
  const t = await getTranslations("Profile");
  return { success: t("profileUpdated") };
}

export async function changePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = changePasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { error: error.message };

  await logActivity(supabase, { action: "profile.change_password" });
  const t = await getTranslations("Profile");
  return { success: t("passwordChanged") };
}
