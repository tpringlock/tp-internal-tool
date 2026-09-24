"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireContentManager } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { clientSchema, translateFieldErrors } from "@/lib/validation";
import { safeInternalPath } from "@/lib/utils";
import type { FormState } from "@/app/actions/auth";

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = "23505";
/** Postgres foreign-key-violation error code. */
const FK_VIOLATION = "23503";

export async function addClient(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireContentManager();

  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    tax_code: formData.get("tax_code"),
    address: formData.get("address"),
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
  // Refresh the Documents workspace (client sidebar + counts live in its layout).
  revalidatePath("/documents", "layout");
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
    tax_code: formData.get("tax_code"),
    address: formData.get("address"),
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
  revalidatePath(`/admin/clients/${id}`);
  // Refresh the Documents workspace (client sidebar + counts live in its layout).
  revalidatePath("/documents", "layout");
  return { success: t("clientUpdated") };
}

/**
 * Delete a client. Admin-only (RLS policy clients_admin_delete). Blocked by
 * the DB when the client still has projects (projects.client_id is
 * `on delete restrict`); folder share links cascade away with the client.
 */
export async function deleteClient(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "");

  const supabase = await createClient();
  // select() confirms a row was actually removed — RLS filtering a row out
  // would otherwise report a silent success.
  const { data, error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id)
    .select("id");

  const t = await getTranslations("Admin");
  if (error) {
    if (error.code === FK_VIOLATION) {
      return { error: t("errClientHasProjects") };
    }
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: t("clientNotFound") };
  }

  await logActivity(supabase, {
    action: "client.deleted",
    entityType: "client",
    entityId: id,
    metadata: { name },
  });
  revalidatePath("/admin/clients");
  revalidatePath("/documents", "layout");

  // Redirect server-side: the manage page we're on belongs to the deleted
  // client, so re-rendering it (which the action response otherwise does)
  // would 404 before any client-side navigation runs. Internal paths only.
  const redirectTo = safeInternalPath(formData.get("redirect_to"), "");
  if (redirectTo) redirect(redirectTo);
  return { success: t("clientDeleted", { name }) };
}
