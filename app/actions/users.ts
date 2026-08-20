"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { createUserSchema, translateFieldErrors } from "@/lib/validation";
import type { FormState } from "@/app/actions/auth";

// A long ban effectively disables sign-in until the account is reactivated.
const DISABLE_BAN = "876000h";

export async function createUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin(); // authorization guard (redirects non-admins)

  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    full_name: formData.get("full_name"),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true, // internal accounts are pre-verified
    user_metadata: {
      full_name: parsed.data.full_name,
      role: parsed.data.role,
    },
  });
  if (error) {
    return { error: error.message };
  }

  const supabase = await createClient();
  await logActivity(supabase, {
    action: "admin.user_created",
    entityType: "profile",
    entityId: data.user?.id,
    metadata: { email: parsed.data.email, role: parsed.data.role },
  });

  revalidatePath("/admin/users");
  const t = await getTranslations("Admin");
  return { success: t("createdAccount", { email: parsed.data.email }) };
}

export async function setUserActive(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("user_id"));
  const active = formData.get("active") === "true";

  if (userId === admin.id && !active) {
    // Guard against an admin locking themselves out.
    return;
  }

  const supabaseAdmin = createAdminClient();
  await supabaseAdmin
    .from("profiles")
    .update({ is_active: active })
    .eq("id", userId);
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : DISABLE_BAN,
  });

  const supabase = await createClient();
  await logActivity(supabase, {
    action: active ? "admin.user_activated" : "admin.user_deactivated",
    entityType: "profile",
    entityId: userId,
  });

  revalidatePath("/admin/users");
}

export async function deleteUser(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("user_id"));
  const email = String(formData.get("email") ?? "");

  if (userId === admin.id) {
    // Guard against an admin deleting their own account.
    return;
  }

  const supabaseAdmin = createAdminClient();
  // Removing the auth user cascades to the profile row via the
  // `on delete cascade` FK on profiles.id.
  await supabaseAdmin.auth.admin.deleteUser(userId);

  const supabase = await createClient();
  await logActivity(supabase, {
    action: "admin.user_deleted",
    entityType: "profile",
    entityId: userId,
    metadata: { email },
  });

  revalidatePath("/admin/users");
}

export async function setUserRole(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  const userId = String(formData.get("user_id"));
  const raw = String(formData.get("role"));
  const role = raw === "admin" || raw === "manager" ? raw : "employee";

  if (userId === admin.id && role !== "admin") {
    // Don't let the last admin demote themselves by accident.
    return {};
  }

  const supabaseAdmin = createAdminClient();
  await supabaseAdmin.from("profiles").update({ role }).eq("id", userId);

  const supabase = await createClient();
  await logActivity(supabase, {
    action: "admin.user_role_changed",
    entityType: "profile",
    entityId: userId,
    metadata: { role },
  });

  revalidatePath("/admin/users");
  const t = await getTranslations("Admin");
  return { success: t("roleChanged") };
}
