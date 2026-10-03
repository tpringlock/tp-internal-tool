"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBillingUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { validateTemplate, type TemplateReport } from "@/lib/billing/hstt-template";
import { HSTT_TEMPLATE_BUCKET } from "@/lib/billing/hstt-templates-server";
import { XLSX_MIME } from "@/lib/billing/server";
import type { FormState } from "@/app/actions/auth";

/** Postgres error codes. */
const UNIQUE_VIOLATION = "23505";
const FK_VIOLATION = "23503";
const NAME_MAX = 120;

function revalidateTemplates() {
  revalidatePath("/billing", "layout");
}

export interface TemplateCheckState extends FormState {
  report?: TemplateReport;
  fileName?: string;
}

function fileOf(formData: FormData): File | null {
  const f = formData.get("file");
  return f instanceof File && f.size > 0 ? f : null;
}

/**
 * Step 1 (admin): check an uploaded template file against the convention.
 * Nothing is stored; the page shows the report and offers a trial HSTT
 * (POST /api/billing/hstt-templates/preview) before saving.
 */
export async function checkHsttTemplate(_prev: TemplateCheckState, formData: FormData): Promise<TemplateCheckState> {
  const user = await requireBillingUser();
  const t = await getTranslations("HsttTemplates");
  if (user.profile.role !== "admin") return { error: t("errAdminOnly") };
  const file = fileOf(formData);
  if (!file) return { error: t("errChooseFile") };
  const report = await validateTemplate(Buffer.from(await file.arrayBuffer()));
  return { report, fileName: file.name };
}

/**
 * Step 2 (admin): store a checked template as a new template (name) or as
 * the next version of an existing one (template_id). The file is checked
 * again; a file with errors is refused. Storage first, then the RPC (one
 * transaction); the object is removed if the database refuses.
 */
export async function saveHsttTemplate(_prev: TemplateCheckState, formData: FormData): Promise<TemplateCheckState> {
  const user = await requireBillingUser();
  const t = await getTranslations("HsttTemplates");
  if (user.profile.role !== "admin") return { error: t("errAdminOnly") };
  const file = fileOf(formData);
  if (!file) return { error: t("errChooseFile") };
  const templateId = String(formData.get("template_id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  if (!templateId && (!name || name.length > NAME_MAX)) {
    return { fieldErrors: { name: [t("errName", { max: NAME_MAX })] } };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const report = await validateTemplate(buffer);
  if (!report.ok) return { report, fileName: file.name, error: t("errHasErrors") };

  const supabase = await createClient();
  const admin = createAdminClient();
  const storagePath = `templates/${crypto.randomUUID()}.xlsx`;
  const { error: upErr } = await admin.storage
    .from(HSTT_TEMPLATE_BUCKET)
    .upload(storagePath, buffer, { contentType: XLSX_MIME, upsert: false });
  if (upErr) return { report, fileName: file.name, error: t("errStorage", { message: upErr.message }) };

  const { data, error } = await supabase.rpc("billing_add_hstt_template_version", {
    p_template_id: templateId,
    p_name: templateId ? null : name,
    p_file: { storage_path: storagePath, file_name: file.name, size_bytes: buffer.length, sha256: report.sha256, note },
    p_report: report,
  });
  if (error || !data) {
    await admin.storage.from(HSTT_TEMPLATE_BUCKET).remove([storagePath]);
    const message = error?.code === UNIQUE_VIOLATION ? t("errNameTaken") : (error?.message ?? t("errSaveFailed"));
    return { report, fileName: file.name, error: message };
  }

  await logActivity(supabase, {
    action: "billing.hstt_template_uploaded",
    entityType: "billing_hstt_template",
    entityId: data.template_id,
    metadata: { name: name || null, version: data.version, file_name: file.name, sha256: report.sha256, warnings: report.warnings.length },
  });
  revalidateTemplates();
  return { success: t("saved", { version: data.version }) };
}

/**
 * Admin: "Dùng lại phiên bản này" – publish an older version again as the
 * newest one. The file is copied to a new storage path (versions are never
 * rewritten) and stored with reused_from (same sha256, checked by the RPC).
 */
export async function reuseHsttTemplateVersion(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("HsttTemplates");
  if (user.profile.role !== "admin") return { error: t("errAdminOnly") };
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { data: v } = await supabase.from("billing_hstt_template_versions").select("*").eq("id", id).maybeSingle();
  if (!v) return { error: t("errNotFound") };

  const admin = createAdminClient();
  const storagePath = `templates/${crypto.randomUUID()}.xlsx`;
  const { error: cpErr } = await admin.storage.from(HSTT_TEMPLATE_BUCKET).copy(v.storage_path, storagePath);
  if (cpErr) return { error: t("errStorage", { message: cpErr.message }) };

  const { data, error } = await supabase.rpc("billing_add_hstt_template_version", {
    p_template_id: v.template_id,
    p_name: null,
    p_file: {
      storage_path: storagePath,
      file_name: v.file_name,
      size_bytes: v.size_bytes,
      sha256: v.sha256,
      note: t("reusedNote", { version: v.version }),
      reused_from: v.id,
    },
    p_report: v.report,
  });
  if (error || !data) {
    await admin.storage.from(HSTT_TEMPLATE_BUCKET).remove([storagePath]);
    return { error: error?.message ?? t("errSaveFailed") };
  }

  await logActivity(supabase, {
    action: "billing.hstt_template_reused",
    entityType: "billing_hstt_template",
    entityId: v.template_id,
    metadata: { from_version: v.version, version: data.version, sha256: v.sha256 },
  });
  revalidateTemplates();
  return { success: t("reused", { from: v.version, version: data.version }) };
}

/** Admin: stop using a template (refused while a contract uses it), or use it again. */
export async function setHsttTemplateStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("HsttTemplates");
  if (user.profile.role !== "admin") return { error: t("errAdminOnly") };
  const id = String(formData.get("id") ?? "");
  const status = formData.get("status") === "active" ? "active" : "retired";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_hstt_templates")
    .update({ status })
    .eq("id", id)
    .select("id, name")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: t("errNotFound") };

  await logActivity(supabase, {
    action: status === "retired" ? "billing.hstt_template_retired" : "billing.hstt_template_reactivated",
    entityType: "billing_hstt_template",
    entityId: id,
    metadata: { name: data.name },
  });
  revalidateTemplates();
  return { success: status === "retired" ? t("retiredDone", { name: data.name }) : t("reactivated", { name: data.name }) };
}

/**
 * Admin: delete a template with all its versions (e.g. TEST templates).
 * Refused by the database while it is assigned to a contract or one of its
 * versions produced a downloaded HSTT. Files are removed after the rows.
 */
export async function deleteHsttTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("HsttTemplates");
  if (user.profile.role !== "admin") return { error: t("errAdminOnly") };
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { data: versions } = await supabase
    .from("billing_hstt_template_versions")
    .select("storage_path")
    .eq("template_id", id);
  const { data, error } = await supabase.from("billing_hstt_templates").delete().eq("id", id).select("id, name");
  if (error) return { error: error.code === FK_VIOLATION ? t("errDeleteInUse") : error.message };
  if (!data || data.length === 0) return { error: t("errNotFound") };

  const paths = (versions ?? []).map((v) => v.storage_path);
  if (paths.length) await createAdminClient().storage.from(HSTT_TEMPLATE_BUCKET).remove(paths);

  await logActivity(supabase, {
    action: "billing.hstt_template_deleted",
    entityType: "billing_hstt_template",
    entityId: id,
    metadata: { name: data[0].name, versions: paths.length },
  });
  revalidateTemplates();
  return { success: t("deleted", { name: data[0].name }) };
}

/** Accountants + admins: the template a contract's HSTT is generated with ("" = standard TP template). */
export async function assignHsttTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("HsttTemplates");
  const contractId = String(formData.get("contract_id") ?? "");
  const templateId = String(formData.get("template_id") ?? "");

  const supabase = await createClient();
  const { data: contract } = await supabase.from("billing_contracts").select("id, code").eq("id", contractId).maybeSingle();
  if (!contract) return { error: t("errContractNotFound") };

  if (templateId) {
    const { error } = await supabase
      .from("billing_contract_hstt_templates")
      .upsert({ contract_id: contractId, template_id: templateId, assigned_by: user.id });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("billing_contract_hstt_templates")
      .delete()
      .eq("contract_id", contractId)
      .select("contract_id");
    if (error) return { error: error.message };
  }

  await logActivity(supabase, {
    action: "billing.contract_hstt_template_set",
    entityType: "billing_contract",
    entityId: contractId,
    metadata: { code: contract.code, template_id: templateId || null },
  });
  revalidateTemplates();
  return { success: templateId ? t("assigned") : t("assignedStandard") };
}
