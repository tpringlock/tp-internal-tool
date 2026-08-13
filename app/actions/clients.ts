"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireContentManager } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { clientSchema, translateFieldErrors } from "@/lib/validation";
import type { FormState } from "@/app/actions/auth";

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = "23505";

export async function addClient(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireContentManager();

  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...parsed.data, created_by: user.id })
    .select("id")
    .single();

  const t = await getTranslations("Admin");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { fieldErrors: { code: [t("codeInUse")] } };
    }
    return { error: error.message };
  }

  await logActivity(supabase, {
    action: "client.created",
    entityType: "client",
    entityId: data.id,
    metadata: { code: parsed.data.code },
  });
  revalidatePath("/admin/clients");
  return { success: t("clientCreated", { name: parsed.data.name }) };
}

export async function editClient(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireContentManager();

  const id = String(formData.get("id"));
  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update(parsed.data)
    .eq("id", id);

  const t = await getTranslations("Admin");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { fieldErrors: { code: [t("codeInUse")] } };
    }
    return { error: error.message };
  }

  await logActivity(supabase, {
    action: "client.updated",
    entityType: "client",
    entityId: id,
  });
  revalidatePath("/admin/clients");
  return { success: t("clientUpdated") };
}
