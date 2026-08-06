"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { clientSchema } from "@/lib/validation";
import type { FormState } from "@/app/actions/auth";

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = "23505";

export async function addClient(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();

  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...parsed.data, created_by: admin.id })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { fieldErrors: { code: ["That code is already in use"] } };
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
  return { success: `Client “${parsed.data.name}” created.` };
}

export async function editClient(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const id = String(formData.get("id"));
  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { fieldErrors: { code: ["That code is already in use"] } };
    }
    return { error: error.message };
  }

  await logActivity(supabase, {
    action: "client.updated",
    entityType: "client",
    entityId: id,
  });
  revalidatePath("/admin/clients");
  return { success: "Client updated." };
}
