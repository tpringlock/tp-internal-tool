"use server";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBillingUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import {
  billingContractConfigSchema,
  billingContractSchema,
  billingExcludedRangeSchema,
  computeRentSchema,
  translateFieldErrors,
} from "@/lib/validation";
import { BillingError, computeRentFromLedger } from "@/lib/billing/engine";
import { MisaParseError, parseMisaLedger } from "@/lib/billing/misa-parser";
import { findDuplicateCodes } from "@/lib/billing/contract-config";
import {
  findUnknownCodes,
  warningsForWarehouse,
  type UnknownCode,
} from "@/lib/billing/ledger-checks";
import { contractPeriod, rangesForPeriod } from "@/lib/billing/periods";
import { amountForDb, hasFractionalQuantities } from "@/lib/billing/amounts";
import {
  BILLING_BUCKET,
  MAX_MISA_FILE_SIZE,
  XLSX_MIME,
  loadContract,
  loadMergedLedger,
} from "@/lib/billing/server";
import { SHOW_DEMO_COOKIE } from "@/lib/billing/queries";
import type { FormState } from "@/app/actions/auth";

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = "23505";
/** Postgres foreign-key-violation error code. */
const FK_VIOLATION = "23503";

/** Every billing page (sidebar counts live in the layout). */
function revalidateBilling() {
  revalidatePath("/billing", "layout");
}

// ---------------------------------------------------------------------------
// MISA uploads
// ---------------------------------------------------------------------------

export interface UploadState extends FormState {
  /** One line per file that could not be stored. */
  fileErrors?: string[];
}

/**
 * Store one or more MISA "Sổ chi tiết vật tư hàng hóa" exports. Each file is
 * parsed before it is stored, so only readable files are kept; identical
 * files (same sha256) are rejected as duplicates.
 */
export async function uploadMisaFiles(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const user = await requireBillingUser();
  const t = await getTranslations("Billing");

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: t("errChooseFile") };
  if (files.length > 6) return { error: t("errTooManyFiles") };

  const supabase = await createClient();
  const admin = createAdminClient();
  const fileErrors: string[] = [];
  let stored = 0;

  for (const file of files) {
    const name = file.name;
    if (!name.toLowerCase().endsWith(".xlsx")) {
      fileErrors.push(t("errFileType", { name }));
      continue;
    }
    if (file.size > MAX_MISA_FILE_SIZE) {
      fileErrors.push(t("errFileSize", { name }));
      continue;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");

    const { data: existing } = await supabase
      .from("billing_misa_uploads")
      .select("id")
      .eq("sha256", sha256)
      .maybeSingle();
    if (existing) {
      fileErrors.push(t("errDuplicate", { name }));
      continue;
    }

    let ledger;
    try {
      ledger = await parseMisaLedger(buffer);
    } catch (e) {
      const message = e instanceof MisaParseError ? e.message : t("errUnreadable");
      fileErrors.push(`${name}: ${message}`);
      continue;
    }

    const id = crypto.randomUUID();
    const storagePath = `misa/${ledger.from.slice(0, 7)}/${id}.xlsx`;
    const { error: uploadError } = await admin.storage
      .from(BILLING_BUCKET)
      .upload(storagePath, buffer, { contentType: XLSX_MIME, upsert: false });
    if (uploadError) {
      fileErrors.push(t("errUploadFailed", { name, message: uploadError.message }));
      continue;
    }

    const { error: insertError } = await supabase.from("billing_misa_uploads").insert({
      id,
      storage_path: storagePath,
      file_name: name,
      size_bytes: file.size,
      sha256,
      file_from: ledger.from,
      file_to: ledger.to,
      layout: ledger.layout,
      warehouse_count: Object.keys(ledger.warehouses).length,
      warnings: ledger.warnings,
      uploaded_by: user.id,
    });
    if (insertError) {
      // Keep storage consistent with the table.
      await admin.storage.from(BILLING_BUCKET).remove([storagePath]);
      fileErrors.push(
        insertError.code === UNIQUE_VIOLATION
          ? t("errDuplicate", { name })
          : t("errUploadFailed", { name, message: insertError.message }),
      );
      continue;
    }

    stored++;
    await logActivity(supabase, {
      action: "billing.upload_created",
      entityType: "billing_upload",
      entityId: id,
      metadata: { file_name: name, from: ledger.from, to: ledger.to, layout: ledger.layout },
    });
  }

  if (stored > 0) revalidateBilling();
  return {
    success: stored > 0 ? t("uploaded", { count: stored }) : undefined,
    error: fileErrors.length > 0 ? t("someFilesFailed") : undefined,
    fileErrors: fileErrors.length > 0 ? fileErrors : undefined,
  };
}

/** Delete an uploaded MISA file (admin only; blocked if a confirmed calculation uses it). */
export async function deleteMisaUpload(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("Billing");
  if (user.profile.role !== "admin") return { error: t("errAdminOnly") };

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_misa_uploads")
    .delete()
    .eq("id", id)
    .select("id, storage_path, file_name");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: t("errNotFound") };

  await createAdminClient().storage.from(BILLING_BUCKET).remove([data[0].storage_path]);
  await logActivity(supabase, {
    action: "billing.upload_deleted",
    entityType: "billing_upload",
    entityId: id,
    metadata: { file_name: data[0].file_name },
  });
  revalidateBilling();
  return { success: t("uploadDeleted") };
}

// ---------------------------------------------------------------------------
// Rent calculation
// ---------------------------------------------------------------------------

export interface ComputeState extends FormState {
  /** Codes the contract doesn't price or exclude; offered as "add to contract". */
  unknownCodes?: UnknownCode[];
  contractId?: string;
}

/**
 * Calculate equipment rent for a contract from the chosen MISA uploads, over
 * either a billing month (26 -> 25, the HSTT period) or a custom date range,
 * save it as a draft and open it. Range calculations can't be confirmed. Any engine/parser refusal
 * (file doesn't cover the period, unknown codes, ...) is shown verbatim: it
 * is safer to stop than to under-bill silently.
 */
export async function computeRent(
  _prev: ComputeState,
  formData: FormData,
): Promise<ComputeState> {
  const user = await requireBillingUser();
  const t = await getTranslations("Billing");

  const parsed = computeRentSchema.safeParse({
    mode: formData.get("mode") === "range" ? "range" : "month",
    contract_id: formData.get("contract_id"),
    month: formData.get("month"),
    date_from: formData.get("date_from"),
    date_to: formData.get("date_to"),
    upload_ids: formData.getAll("upload_ids").map(String),
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }
  const input = parsed.data;
  const { contract_id: contractId, upload_ids: uploadIds } = input;
  const month = input.mode === "month" ? input.month : null;

  const supabase = await createClient();
  const loaded = await loadContract(supabase, contractId);
  if (!loaded) return { error: t("errContractNotFound") };
  const { contract, config } = loaded;
  if (config.items.length === 0) {
    return { error: t("errNoItems"), contractId };
  }

  const [{ data: uploads }, { data: rangeRows }] = await Promise.all([
    supabase
      .from("billing_misa_uploads")
      .select("id, storage_path, file_name, file_from")
      .in("id", uploadIds),
    supabase
      .from("billing_excluded_ranges")
      .select("date_from, date_to, reason, contract_id")
      .or(`contract_id.is.null,contract_id.eq.${contractId}`),
  ]);
  if (!uploads || uploads.length !== uploadIds.length) {
    return { error: t("errUploadNotFound") };
  }

  let period;
  try {
    period =
      input.mode === "month"
        ? contractPeriod(input.month, contract.period_start_day, contract.contract_start)
        : { from: input.date_from, to: input.date_to };
  } catch (e) {
    return { error: (e as Error).message };
  }
  const excludedRanges = rangesForPeriod(rangeRows ?? [], period);

  let result;
  try {
    const ledger = await loadMergedLedger(
      [...uploads].sort((a, b) => (a.file_from < b.file_from ? -1 : 1)),
    );
    const unknownCodes = findUnknownCodes(ledger, config, period);
    if (unknownCodes.length > 0) {
      return {
        error: t("errUnknownCodes", { kho: contract.misa_kho }),
        unknownCodes,
        contractId,
      };
    }
    result = computeRentFromLedger(ledger, config, period, excludedRanges);
    // Stored at 4 decimals (numeric(20,4)); keep the saved result consistent.
    result.totalAmount = Number(amountForDb(result.totalAmount));
    // Surface file-level warnings for this warehouse next to the engine's own.
    result.warnings.unshift(...warningsForWarehouse(ledger.warnings, contract.misa_kho));
  } catch (e) {
    // BillingError / MisaParseError / merge errors carry a Vietnamese message
    // meant for the user; anything else gets a generic one.
    const known = e instanceof BillingError || e instanceof MisaParseError || e instanceof Error;
    return { error: known ? (e as Error).message : t("errComputeFailed"), contractId };
  }

  const { data: saved, error } = await supabase
    .from("billing_rent_calculations")
    .insert({
      contract_id: contractId,
      period_month: month,
      period_from: period.from,
      period_to: period.to,
      upload_ids: uploadIds,
      contract_snapshot: config,
      excluded_ranges: excludedRanges,
      total_amount: amountForDb(result.totalAmount),
      result,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !saved) return { error: error?.message ?? t("errSaveFailed") };

  await logActivity(supabase, {
    action: "billing.calculated",
    entityType: "billing_calculation",
    entityId: saved.id,
    metadata: {
      contract: contract.code,
      month,
      from: period.from,
      to: period.to,
      total: result.totalAmount,
    },
  });
  revalidateBilling();
  redirect(`/billing/calculations/${saved.id}`);
}

/** Lock a draft as the confirmed calculation for its contract + period. */
export async function confirmCalculation(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireBillingUser();
  const t = await getTranslations("Billing");
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { data: calc } = await supabase
    .from("billing_rent_calculations")
    .select("contract_id, result")
    .eq("id", id)
    .maybeSingle();
  if (!calc) return { error: t("errNotFound") };
  const { data: contract } = await supabase
    .from("billing_contracts")
    .select("is_demo")
    .eq("id", calc.contract_id)
    .maybeSingle();
  // Demo prices are for comparison only (also enforced by a DB trigger).
  if (!contract || contract.is_demo) return { error: t("errDemoNotConfirmable") };
  // Fractional quantities usually mean a raw material is in a rental
  // warehouse: the accountant must fix the codes and recalculate first.
  if (hasFractionalQuantities(calc.result)) return { error: t("errFractionalNotConfirmable") };

  // confirmed_by / confirmed_at are stamped by the billing_calc_guard trigger.
  // Only billing-month calculations can be confirmed (also a DB constraint).
  const { data, error } = await supabase
    .from("billing_rent_calculations")
    .update({ status: "confirmed" })
    .eq("id", id)
    .eq("status", "draft")
    .not("period_month", "is", null)
    .select("id");
  if (error) {
    return { error: error.code === UNIQUE_VIOLATION ? t("errAlreadyConfirmed") : error.message };
  }
  if (!data || data.length === 0) return { error: t("errNotConfirmable") };

  await logActivity(supabase, {
    action: "billing.confirmed",
    entityType: "billing_calculation",
    entityId: id,
  });
  revalidateBilling();
  return { success: t("confirmed") };
}

/** Void a confirmed calculation so the period can be re-confirmed (admin only). */
export async function voidCalculation(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("Billing");
  if (user.profile.role !== "admin") return { error: t("errAdminOnly") };
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_rent_calculations")
    .update({ status: "voided" })
    .eq("id", id)
    .eq("status", "confirmed")
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: t("errNotConfirmed") };

  await logActivity(supabase, {
    action: "billing.voided",
    entityType: "billing_calculation",
    entityId: id,
  });
  revalidateBilling();
  return { success: t("voided") };
}

/** Delete a draft calculation, then go back to the history list. */
export async function deleteDraftCalculation(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireBillingUser();
  const t = await getTranslations("Billing");
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_rent_calculations")
    .delete()
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: t("errNotDraft") };

  await logActivity(supabase, {
    action: "billing.draft_deleted",
    entityType: "billing_calculation",
    entityId: id,
  });
  revalidateBilling();
  redirect("/billing/history");
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

function parseContractForm(formData: FormData) {
  return billingContractSchema.safeParse({
    code: formData.get("code"),
    customer_name: formData.get("customer_name"),
    project_name: formData.get("project_name"),
    contract_no: formData.get("contract_no") ?? "",
    misa_kho: formData.get("misa_kho"),
    period_start_day: formData.get("period_start_day") ?? 26,
    contract_start: formData.get("contract_start") ?? "",
    active: formData.get("active") !== "off",
  });
}

async function contractUniqueErrors(message: string): Promise<FormState> {
  const t = await getTranslations("Billing");
  // Constraint names from 0027: billing_contracts_code_key / _misa_kho_key.
  if (message.includes("misa_kho")) return { fieldErrors: { misa_kho: [t("errKhoInUse")] } };
  return { fieldErrors: { code: [t("errCodeInUse")] } };
}

export async function createBillingContract(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireBillingUser();
  const parsed = parseContractForm(formData);
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_contracts")
    .insert({ ...parsed.data, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === UNIQUE_VIOLATION) return contractUniqueErrors(error.message);
    return { error: error?.message ?? "" };
  }

  await logActivity(supabase, {
    action: "billing.contract_created",
    entityType: "billing_contract",
    entityId: data.id,
    metadata: { code: parsed.data.code, misa_kho: parsed.data.misa_kho },
  });
  revalidateBilling();
  redirect(`/billing/contracts/${data.id}`);
}

export async function updateBillingContract(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireBillingUser();
  const t = await getTranslations("Billing");
  const id = String(formData.get("id") ?? "");
  const parsed = parseContractForm(formData);
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_contracts")
    .update(parsed.data)
    .eq("id", id)
    .select("id");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return contractUniqueErrors(error.message);
    return { error: error.message };
  }
  if (!data || data.length === 0) return { error: t("errContractNotFound") };

  await logActivity(supabase, {
    action: "billing.contract_updated",
    entityType: "billing_contract",
    entityId: id,
    metadata: { code: parsed.data.code },
  });
  revalidateBilling();
  return { success: t("contractSaved") };
}

/**
 * Replace a contract's price lines and excluded codes in one transaction
 * (billing_save_contract_config, 0030). The editor posts both lists as JSON.
 */
export async function saveBillingContractConfig(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireBillingUser();
  const t = await getTranslations("Billing");
  const id = String(formData.get("id") ?? "");

  let raw: unknown;
  try {
    raw = {
      items: JSON.parse(String(formData.get("items") ?? "[]")),
      excluded: JSON.parse(String(formData.get("excluded") ?? "[]")),
    };
  } catch {
    return { error: t("errBadConfig") };
  }
  const parsed = billingContractConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    const first = parsed.error.issues[0];
    return { error: first && tv.has(first.message) ? tv(first.message) : t("errBadConfig") };
  }
  const { items, excluded } = parsed.data;

  const names = items.map((i) => i.name.toLocaleLowerCase("vi"));
  if (new Set(names).size !== names.length) return { error: t("errDuplicateNames") };
  const duplicates = findDuplicateCodes(
    items.map((i) => i.ma_hang),
    excluded,
  );
  if (duplicates.length > 0) {
    return { error: t("errDuplicateCodes", { codes: duplicates.join(", ") }) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("billing_save_contract_config", {
    p_contract_id: id,
    p_items: items,
    p_excluded: [...new Set(excluded)],
  });
  if (error) return { error: error.message };

  await logActivity(supabase, {
    action: "billing.contract_config_saved",
    entityType: "billing_contract",
    entityId: id,
    metadata: { items: items.length, excluded: excluded.length },
  });
  revalidateBilling();
  return { success: t("configSaved") };
}

/** Delete a contract (admin only). Contracts with saved calculations can only be deactivated. */
export async function deleteBillingContract(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("Billing");
  if (user.profile.role !== "admin") return { error: t("errAdminOnly") };
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_contracts")
    .delete()
    .eq("id", id)
    .select("id, code");
  if (error) {
    return { error: error.code === FK_VIOLATION ? t("errContractInUse") : error.message };
  }
  if (!data || data.length === 0) return { error: t("errContractNotFound") };

  await logActivity(supabase, {
    action: "billing.contract_deleted",
    entityType: "billing_contract",
    entityId: id,
    metadata: { code: data[0].code },
  });
  revalidateBilling();
  redirect("/billing/contracts");
}

// ---------------------------------------------------------------------------
// "Hiện dữ liệu giả định" switch
// ---------------------------------------------------------------------------

/**
 * Show or hide demo ("giả định") contracts and their calculations. Only a
 * view preference: demo data stays unconfirmable either way.
 */
export async function setShowDemo(formData: FormData): Promise<void> {
  await requireBillingUser();
  const on = formData.get("show") === "1";
  const store = await cookies();
  if (on) {
    store.set(SHOW_DEMO_COOKIE, "1", {
      path: "/billing",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
  } else {
    store.delete({ name: SHOW_DEMO_COOKIE, path: "/billing" });
  }
  revalidateBilling();
}

// ---------------------------------------------------------------------------
// Non-billable date ranges
// ---------------------------------------------------------------------------

export async function createExcludedRange(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("Billing");
  const parsed = billingExcludedRangeSchema.safeParse({
    contract_id: formData.get("contract_id") ?? "",
    date_from: formData.get("date_from"),
    date_to: formData.get("date_to"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_excluded_ranges")
    .insert({ ...parsed.data, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? t("errSaveFailed") };

  await logActivity(supabase, {
    action: "billing.range_created",
    entityType: "billing_excluded_range",
    entityId: data.id,
    metadata: { ...parsed.data },
  });
  revalidateBilling();
  return { success: t("rangeCreated") };
}

export async function deleteExcludedRange(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireBillingUser();
  const t = await getTranslations("Billing");
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_excluded_ranges")
    .delete()
    .eq("id", id)
    .select("id, reason");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: t("errNotFound") };

  await logActivity(supabase, {
    action: "billing.range_deleted",
    entityType: "billing_excluded_range",
    entityId: id,
    metadata: { reason: data[0].reason },
  });
  revalidateBilling();
  return { success: t("rangeDeleted") };
}
