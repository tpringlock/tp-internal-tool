"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireBillingUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { periodPresetSchema, translateFieldErrors } from "@/lib/validation";
import { presetUsage } from "@/lib/billing/period-presets";
import type { FormState } from "@/app/actions/auth";

// Period presets ("mẫu kỳ", 0040). Presets: admin only (RLS too). A
// contract's default preset: any billing user (accountant + admin).

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = "23505";
/** Postgres foreign-key-violation error code. */
const FK_VIOLATION = "23503";

function revalidateBilling() {
  revalidatePath("/billing", "layout");
}

/** Add (no id) or edit a preset. Admin only. */
export async function savePeriodPreset(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("BillingPresets");
  if (user.profile.role !== "admin") return { error: t("errAdminOnly") };

  const parsed = periodPresetSchema.safeParse({
    name: formData.get("name"),
    start_day: formData.get("start_day"),
    months: formData.get("months"),
    sort_order: formData.get("sort_order") || 0,
    active: formData.get("active") !== "off",
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }
  const id = String(formData.get("id") ?? "");
  const row = { ...parsed.data, updated_by: user.id };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("billing_period_presets").update(row).eq("id", id).select("id")
    : await supabase.from("billing_period_presets").insert(row).select("id");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return error.message.includes("name")
        ? { fieldErrors: { name: [t("errNameInUse")] } }
        : { fieldErrors: { start_day: [t("errRuleInUse")] } };
    }
    return { error: error.message };
  }
  if (!data || data.length === 0) return { error: t("errNotFound") };

  await logActivity(supabase, {
    action: id ? "billing.preset_updated" : "billing.preset_created",
    entityType: "billing_period_preset",
    entityId: data[0].id,
    metadata: { name: row.name, start_day: row.start_day, months: row.months, active: row.active },
  });
  revalidateBilling();
  return { success: id ? t("saved") : t("created") };
}

/**
 * Delete a preset (admin). A preset some contract uses as its default can't
 * be deleted (FK restrict, 0040): the admin is told to set it inactive.
 */
export async function deletePeriodPreset(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("BillingPresets");
  if (user.profile.role !== "admin") return { error: t("errAdminOnly") };
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const inUse = async () => {
    const { data: links } = await supabase
      .from("billing_contract_period_presets")
      .select("preset_id")
      .eq("preset_id", id);
    return presetUsage(links ?? []).get(id) ?? 0;
  };
  const used = await inUse();
  if (used > 0) return { error: t("errInUse", { count: used }) };

  const { data, error } = await supabase
    .from("billing_period_presets")
    .delete()
    .eq("id", id)
    .select("id, name");
  if (error) {
    // A contract picked this preset in the meantime.
    if (error.code === FK_VIOLATION) return { error: t("errInUse", { count: Math.max(1, await inUse()) }) };
    return { error: error.message };
  }
  if (!data || data.length === 0) return { error: t("errNotFound") };

  await logActivity(supabase, {
    action: "billing.preset_deleted",
    entityType: "billing_period_preset",
    entityId: id,
    metadata: { name: data[0].name },
  });
  revalidateBilling();
  return { success: t("deleted") };
}

/** Set (or clear, with an empty preset_id) a contract's default preset. */
export async function setContractPeriodPreset(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("BillingPresets");
  const contractId = String(formData.get("contract_id") ?? "");
  const presetId = String(formData.get("preset_id") ?? "");

  const supabase = await createClient();
  const { data: contract } = await supabase
    .from("billing_contracts")
    .select("id, code")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { error: t("errContractNotFound") };

  if (presetId) {
    const { data: preset } = await supabase
      .from("billing_period_presets")
      .select("id")
      .eq("id", presetId)
      .maybeSingle();
    if (!preset) return { error: t("errNotFound") };
    const { error } = await supabase
      .from("billing_contract_period_presets")
      .upsert({ contract_id: contractId, preset_id: presetId, updated_by: user.id });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("billing_contract_period_presets")
      .delete()
      .eq("contract_id", contractId)
      .select("contract_id");
    if (error) return { error: error.message };
  }

  await logActivity(supabase, {
    action: "billing.contract_preset_set",
    entityType: "billing_contract",
    entityId: contractId,
    metadata: { code: contract.code, preset_id: presetId || null },
  });
  revalidateBilling();
  return { success: t("contractPresetSaved") };
}
