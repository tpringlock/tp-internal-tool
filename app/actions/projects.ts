"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireContentManager } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import {
  projectSchema,
  memberSchema,
  translateFieldErrors,
} from "@/lib/validation";
import type { FormState } from "@/app/actions/auth";

const UNIQUE_VIOLATION = "23505";
/** Postgres foreign-key-violation error code. */
const FK_VIOLATION = "23503";

export async function addProject(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireContentManager();

  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    client_id: formData.get("client_id"),
    status: formData.get("status") ?? "active",
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
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
    action: "project.created",
    entityType: "project",
    entityId: data.id,
    metadata: { code: parsed.data.code },
  });
  revalidatePath("/admin/projects");
  return { success: t("projectCreated", { name: parsed.data.name }) };
}

export async function editProject(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireContentManager();

  const id = String(formData.get("id"));
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    client_id: formData.get("client_id"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
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
    action: "project.updated",
    entityType: "project",
    entityId: id,
  });
  revalidatePath("/admin/projects");
  revalidatePath(`/admin/projects/${id}`);
  return { success: t("projectUpdated") };
}

/**
 * Delete a project. Admin-only (RLS policy projects_admin_delete). Blocked by
 * the DB when the project still has documents (documents.project_id is
 * `on delete restrict`); member assignments cascade away with the project.
 */
export async function deleteProject(
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
    .from("projects")
    .delete()
    .eq("id", id)
    .select("id, client_id");

  const t = await getTranslations("Admin");
  if (error) {
    if (error.code === FK_VIOLATION) {
      return { error: t("errProjectHasDocuments") };
    }
    return { error: error.message };
  }
  const deleted = data?.[0];
  if (!deleted) {
    return { error: t("projectNotFound") };
  }

  await logActivity(supabase, {
    action: "project.deleted",
    entityType: "project",
    entityId: id,
    metadata: { name },
  });
  revalidatePath("/admin/projects");
  revalidatePath(`/admin/clients/${deleted.client_id}`);
  return { success: t("projectDeleted", { name }) };
}

/**
 * Delete several projects at once (client manage page). Each id is deleted
 * separately so one project that still holds documents (FK restrict) doesn't
 * abort the rest; the outcome reports both tallies. Admin-only.
 */
export async function deleteProjects(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const t = await getTranslations("Admin");
  if (ids.length === 0) return { error: t("projectNotFound") };

  const supabase = await createClient();
  let deletedCount = 0;
  let blockedCount = 0;
  const clientIds = new Set<string>();

  for (const id of ids) {
    const { data, error } = await supabase
      .from("projects")
      .delete()
      .eq("id", id)
      .select("id, client_id");
    if (error) {
      if (error.code === FK_VIOLATION) {
        blockedCount++;
        continue;
      }
      return { error: error.message };
    }
    const deleted = data?.[0];
    if (!deleted) continue; // already gone or filtered by RLS
    deletedCount++;
    clientIds.add(deleted.client_id);
    await logActivity(supabase, {
      action: "project.deleted",
      entityType: "project",
      entityId: id,
    });
  }

  revalidatePath("/admin/projects");
  for (const clientId of clientIds) {
    revalidatePath(`/admin/clients/${clientId}`);
  }

  return {
    success:
      deletedCount > 0 ? t("projectsDeleted", { count: deletedCount }) : undefined,
    error:
      blockedCount > 0
        ? t("errProjectsHaveDocuments", { count: blockedCount })
        : undefined,
  };
}

export async function assignMember(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();

  const parsed = memberSchema.safeParse({
    project_id: formData.get("project_id"),
    user_id: formData.get("user_id"),
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_members").insert({
    project_id: parsed.data.project_id,
    user_id: parsed.data.user_id,
    assigned_by: admin.id,
  });

  const t = await getTranslations("Admin");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { error: t("alreadyMember") };
    }
    return { error: error.message };
  }

  await logActivity(supabase, {
    action: "project.member_added",
    entityType: "project",
    entityId: parsed.data.project_id,
    metadata: { user_id: parsed.data.user_id },
  });
  revalidatePath(`/admin/projects/${parsed.data.project_id}`);
  return { success: t("memberAdded") };
}

export async function unassignMember(formData: FormData): Promise<void> {
  await requireAdmin();

  const projectId = String(formData.get("project_id"));
  const userId = String(formData.get("user_id"));

  const supabase = await createClient();
  await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);

  await logActivity(supabase, {
    action: "project.member_removed",
    entityType: "project",
    entityId: projectId,
    metadata: { user_id: userId },
  });
  revalidatePath(`/admin/projects/${projectId}`);
}
