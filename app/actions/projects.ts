"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { projectSchema, memberSchema } from "@/lib/validation";
import type { FormState } from "@/app/actions/auth";

const UNIQUE_VIOLATION = "23505";

export async function addProject(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();

  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    client_id: formData.get("client_id"),
    status: formData.get("status") ?? "active",
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
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
    action: "project.created",
    entityType: "project",
    entityId: data.id,
    metadata: { code: parsed.data.code },
  });
  revalidatePath("/admin/projects");
  return { success: `Project “${parsed.data.name}” created.` };
}

export async function editProject(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const id = String(formData.get("id"));
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    client_id: formData.get("client_id"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { fieldErrors: { code: ["That code is already in use"] } };
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
  return { success: "Project updated." };
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
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_members").insert({
    project_id: parsed.data.project_id,
    user_id: parsed.data.user_id,
    assigned_by: admin.id,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { error: "That person is already on this project." };
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
  return { success: "Member added." };
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
