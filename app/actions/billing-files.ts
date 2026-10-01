"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBillingUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { formatBillingMonth } from "@/lib/billing/periods";
import { planMonthUpload, type MonthVersion } from "@/lib/billing/month-files";
import { fillMissingCatalogs, inspectMonthFile, type InspectedMonthFile } from "@/lib/billing/month-files-server";
import { BILLING_BUCKET, XLSX_MIME } from "@/lib/billing/server";
import type { FormState } from "@/app/actions/auth";

/** Max files per upload (one year of months; ~250KB each, well under the body limit). */
const MAX_FILES = 12;
/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = "23505";

function revalidateBilling() {
  revalidatePath("/billing", "layout");
}

/** One file of the upload preview / result, safe to send to the client. */
export interface MonthFileRow {
  name: string;
  size: number;
  ok: boolean;
  error?: string;
  month?: string;
  from?: string;
  to?: string;
  layout?: string;
  warehouses?: number;
  vouchers?: number;
  warningCount?: number;
  /** Version the file gets, and the version it replaces as active (null: new month). */
  version?: number;
  replaces?: number | null;
  /** Another file of the same month comes later in this upload and will be the active one. */
  laterInBatch?: boolean;
  /** Set after saving. */
  saved?: boolean;
}

export interface MonthFilesState extends FormState {
  files?: MonthFileRow[];
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Read the files, check each one, and work out the version it would get.
 * Nothing is stored. Shared by the preview and the save step, so both apply
 * exactly the same rules.
 */
async function inspectAll(supabase: Supabase, files: File[], isAdmin: boolean) {
  const inspected: InspectedMonthFile[] = [];
  for (const f of files) inspected.push(await inspectMonthFile(f));

  const shas = inspected.map((f) => f.sha256).filter((s): s is string => !!s);
  const months = [...new Set(inspected.flatMap((f) => (f.ok ? [f.month] : [])))];
  const [{ data: dupRows }, { data: versionRows }, { data: confirmed }] = await Promise.all([
    shas.length ? supabase.from("billing_misa_uploads").select("sha256, file_name").in("sha256", shas) : { data: [] },
    months.length
      ? supabase.from("billing_misa_month_files").select("month, version, status, upload_id").in("month", months)
      : { data: [] },
    supabase.from("billing_rent_calculations").select("upload_ids").eq("status", "confirmed"),
  ]);
  const dupOf = new Map((dupRows ?? []).map((d) => [d.sha256, d.file_name]));
  const confirmedUses = new Map<string, number>();
  for (const c of confirmed ?? []) for (const id of c.upload_ids) confirmedUses.set(id, (confirmedUses.get(id) ?? 0) + 1);
  const versions = new Map<string, MonthVersion[]>();
  for (const v of versionRows ?? []) {
    versions.set(v.month, [
      ...(versions.get(v.month) ?? []),
      { version: v.version, status: v.status, confirmedUses: confirmedUses.get(v.upload_id) ?? 0 },
    ]);
  }

  const seenSha = new Set<string>();
  const rows: MonthFileRow[] = inspected.map((f) => {
    const base = { name: f.name, size: f.size };
    if (!f.ok) return { ...base, ok: false, error: f.error };
    if (dupOf.has(f.sha256)) {
      return { ...base, ok: false, error: `File này đã được tải lên trước đây (tên lúc đó: ${dupOf.get(f.sha256)}).` };
    }
    if (seenSha.has(f.sha256)) return { ...base, ok: false, error: "Trùng nội dung với một file khác trong lần tải này." };
    seenSha.add(f.sha256);

    // Files of the same month in one upload are stored in order: each one
    // becomes the next version.
    const list = versions.get(f.month) ?? [];
    const plan = planMonthUpload(list);
    if (plan.needsAdmin && !isAdmin) {
      return {
        ...base,
        ok: false,
        month: f.month,
        error: `Tháng ${formatBillingMonth(f.month)} có bản tính đã xác nhận dùng file phiên bản ${plan.replaces}. Chỉ admin được thay file này.`,
      };
    }
    versions.set(f.month, [
      ...list.map((v) => ({ ...v, status: "superseded" as const })),
      { version: plan.version, status: "active", confirmedUses: 0 },
    ]);
    return {
      ...base,
      ok: true,
      month: f.month,
      from: f.from,
      to: f.to,
      layout: f.layout,
      warehouses: f.warehouses,
      vouchers: f.vouchers,
      warningCount: f.warnings.length,
      version: plan.version,
      replaces: plan.replaces,
    };
  });
  // Mark files that a later file of the same month (in this upload) replaces.
  rows.forEach((r, i) => {
    if (r.ok && rows.slice(i + 1).some((o) => o.ok && o.month === r.month)) r.laterInBatch = true;
  });
  return { inspected, rows };
}

function filesOf(formData: FormData): File[] {
  return formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
}

/** Step 1: read the chosen files and show which month each one is, before storing anything. */
export async function inspectMonthFiles(_prev: MonthFilesState, formData: FormData): Promise<MonthFilesState> {
  const user = await requireBillingUser();
  const t = await getTranslations("BillingFiles");
  const files = filesOf(formData);
  if (files.length === 0) return { error: t("errChooseFile") };
  if (files.length > MAX_FILES) return { error: t("errTooManyFiles", { max: MAX_FILES }) };
  const supabase = await createClient();
  const { rows } = await inspectAll(supabase, files, user.profile.role === "admin");
  return { files: rows };
}

/**
 * Step 2: store the valid files as new month versions (billing_add_month_file:
 * upload row + month row + superseding the previous version, atomically).
 * The files are read and checked again; the Storage object is removed if the
 * database refuses.
 */
export async function saveMonthFiles(_prev: MonthFilesState, formData: FormData): Promise<MonthFilesState> {
  const user = await requireBillingUser();
  const t = await getTranslations("BillingFiles");
  const files = filesOf(formData);
  if (files.length === 0) return { error: t("errChooseFile") };
  if (files.length > MAX_FILES) return { error: t("errTooManyFiles", { max: MAX_FILES }) };

  const supabase = await createClient();
  const admin = createAdminClient();
  const { inspected, rows } = await inspectAll(supabase, files, user.profile.role === "admin");

  let saved = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const f = inspected[i];
    if (!row.ok || !f.ok) continue;
    const id = crypto.randomUUID();
    const storagePath = `misa/${f.month}/${id}.xlsx`;
    const { error: upErr } = await admin.storage
      .from(BILLING_BUCKET)
      .upload(storagePath, f.buffer, { contentType: XLSX_MIME, upsert: false });
    if (upErr) {
      rows[i] = { ...row, ok: false, error: t("errStorage", { message: upErr.message }) };
      continue;
    }
    const { data, error } = await supabase.rpc("billing_add_month_file", {
      p_upload: {
        id,
        storage_path: storagePath,
        file_name: f.name,
        size_bytes: f.size,
        sha256: f.sha256,
        file_from: f.from,
        file_to: f.to,
        layout: f.layout,
        warehouse_count: f.warehouses,
        warnings: f.warnings,
      },
      p_voucher_count: f.vouchers,
      p_catalog: f.catalog,
    });
    if (error || !data) {
      await admin.storage.from(BILLING_BUCKET).remove([storagePath]);
      rows[i] = {
        ...row,
        ok: false,
        error: error?.code === UNIQUE_VIOLATION ? t("errDuplicate") : (error?.message ?? t("errSaveFailed")),
      };
      continue;
    }
    rows[i] = { ...row, saved: true, version: data.version, replaces: data.replaced_upload_id ? row.replaces : null };
    saved++;
    await logActivity(supabase, {
      action: "billing.month_file_uploaded",
      entityType: "billing_upload",
      entityId: id,
      metadata: { file_name: f.name, month: f.month, version: data.version, replaced_upload_id: data.replaced_upload_id },
    });
  }

  if (saved > 0) revalidateBilling();
  const failed = rows.filter((r) => !r.saved).length;
  return {
    files: rows,
    success: saved > 0 ? t("saved", { count: saved }) : undefined,
    error: failed > 0 ? t("someNotSaved", { count: failed }) : undefined,
  };
}

/**
 * Admin: make an older version of a month the active one again (e.g. the
 * wrong file was uploaded last). Two updates (demote the current, promote
 * the chosen); if the second fails the first is undone.
 */
export async function restoreMonthFileVersion(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("BillingFiles");
  if (user.profile.role !== "admin") return { error: t("errAdminOnly") };
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { data: target } = await supabase.from("billing_misa_month_files").select("*").eq("id", id).maybeSingle();
  if (!target) return { error: t("errNotFound") };
  if (target.status === "active") return { error: t("errAlreadyActive") };
  const { data: current } = await supabase
    .from("billing_misa_month_files")
    .select("id, version")
    .eq("month", target.month)
    .eq("status", "active")
    .maybeSingle();

  if (current) {
    const { error } = await supabase.from("billing_misa_month_files").update({ status: "superseded" }).eq("id", current.id);
    if (error) return { error: error.message };
  }
  const { error } = await supabase.from("billing_misa_month_files").update({ status: "active" }).eq("id", target.id);
  if (error) {
    if (current) await supabase.from("billing_misa_month_files").update({ status: "active" }).eq("id", current.id);
    return { error: error.message };
  }

  await logActivity(supabase, {
    action: "billing.month_file_restored",
    entityType: "billing_month_file",
    entityId: target.id,
    metadata: { month: target.month, version: target.version, replaced_version: current?.version ?? null },
  });
  revalidateBilling();
  return { success: t("restored", { month: formatBillingMonth(target.month), version: target.version }) };
}

/** Read the MISA names (catalog) of month files that don't have them yet (rows from 0037). */
export async function refreshMonthCatalogs(): Promise<FormState> {
  await requireBillingUser();
  const t = await getTranslations("BillingFiles");
  const supabase = await createClient();
  const { data } = await supabase.from("billing_misa_month_files").select("id, upload_id, catalog").is("catalog", null);
  const filled = await fillMissingCatalogs(supabase, data ?? []);
  if (filled > 0) {
    await logActivity(supabase, { action: "billing.catalog_refreshed", metadata: { files: filled } });
    revalidateBilling();
  }
  return { success: t("catalogsRead", { count: filled }) };
}
