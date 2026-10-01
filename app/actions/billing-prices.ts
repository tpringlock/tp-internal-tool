"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBillingUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { billingPriceLinesSchema } from "@/lib/validation";
import { loadActiveCatalog } from "@/lib/billing/month-files-server";
import { describeConflict, groupPriceLines } from "@/lib/billing/price-lines";
import {
  buildImportPayload,
  readPriceSheet,
  validatePriceImport,
  type ContractDiff,
  type ExistingPriceContract,
  type PriceImportCounts,
  type PriceImportIssue,
  type PriceImportMode,
  type PriceImportPreview,
} from "@/lib/billing/price-import";
import { getAllPriceLines } from "@/lib/billing/queries";
import { BILLING_BUCKET, XLSX_MIME } from "@/lib/billing/server";
import type { PriceColumnKey } from "@/lib/billing/price-sheet";
import type { FormState } from "@/app/actions/auth";

/** Import files: same limit as the MISA files (the bucket allows 10 MiB). */
const MAX_IMPORT_SIZE = 10 * 1024 * 1024;
/** At most this many issues / changed rows are sent to the browser (counts stay exact). */
const MAX_ISSUES_SHOWN = 500;
const MAX_CHANGES_SHOWN = 3000;

function revalidateBilling() {
  revalidatePath("/billing", "layout");
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// Contract page: save the flat price rows of one contract
// ---------------------------------------------------------------------------

/**
 * Replace one contract's price rows (billing_save_price_lines, 0036). Rows
 * that would print as one HSTT line must agree on price and unit, as on
 * import; codes must be unique.
 */
export async function savePriceLines(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireBillingUser();
  const t = await getTranslations("BillingPrices");
  const id = String(formData.get("id") ?? "");

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: t("errBadLines") };
  }
  const parsed = billingPriceLinesSchema.safeParse(raw);
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    const first = parsed.error.issues[0];
    const row = typeof first?.path[0] === "number" ? first.path[0] + 1 : null;
    const msg = first && tv.has(first.message) ? tv(first.message) : t("errBadLines");
    return { error: row ? t("errOnRow", { row, message: msg }) : msg };
  }
  const lines = parsed.data;

  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const l of lines) (seen.has(l.ma_vt) ? dup : seen).add(l.ma_vt);
  if (dup.size > 0) return { error: t("errDuplicateCodes", { codes: [...dup].join(", ") }) };

  const { conflicts } = groupPriceLines(lines.map((l, i) => ({ ...l, sort_order: i + 1 })));
  if (conflicts.length > 0) return { error: conflicts.map(describeConflict).join(" ") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("billing_save_price_lines", { p_contract_id: id, p_lines: lines });
  if (error) return { error: error.message };

  await logActivity(supabase, {
    action: "billing.price_lines_saved",
    entityType: "billing_contract",
    entityId: id,
    metadata: { lines: lines.length, not_billed: lines.filter((l) => l.unit_price === 0).length },
  });
  revalidateBilling();
  return { success: t("linesSaved", { count: lines.length }) };
}

// ---------------------------------------------------------------------------
// Excel import: preview, then confirm
// ---------------------------------------------------------------------------

/** What the browser needs to show the preview (changed rows only). */
export interface ClientPricePreview {
  fileName: string;
  mode: PriceImportMode;
  columns: PriceColumnKey[];
  rowCount: number;
  counts: PriceImportCounts;
  errorCount: number;
  warningCount: number;
  canImport: boolean;
  issues: PriceImportIssue[];
  issuesTruncated: boolean;
  contracts: (Omit<ContractDiff, "lines"> & { lines: ContractDiff["lines"]; unchanged: number })[];
  changesTruncated: boolean;
  /** No catalog yet, or month files whose catalog is still missing. */
  catalogMissing: number;
}

export interface PriceImportState extends FormState {
  preview?: ClientPricePreview;
  /** Set when an import was written. */
  imported?: PriceImportCounts;
}

function modeOf(formData: FormData): PriceImportMode {
  return formData.get("mode") === "replace" ? "replace" : "upsert";
}

/** Every real contract with its price rows, the codes in use and the MISA catalog. */
async function importContext(supabase: Supabase, mode: PriceImportMode) {
  const [{ data: contracts }, lines, { catalog, missing }] = await Promise.all([
    supabase.from("billing_contracts").select("id, code, misa_kho, misa_kho_name, contract_no, customer_name, is_demo"),
    getAllPriceLines(supabase, { demo: false }),
    loadActiveCatalog(supabase, { fill: true }),
  ]);
  const byContract = Map.groupBy(lines, (l) => l.contract_id);
  const existing: ExistingPriceContract[] = (contracts ?? [])
    .filter((c) => !c.is_demo)
    .map((c) => ({ ...c, lines: byContract.get(c.id) ?? [] }));
  return {
    ctx: { mode, existing, catalog, takenCodes: (contracts ?? []).map((c) => c.code) },
    catalogMissing: catalog ? missing : Math.max(1, missing),
  };
}

async function readAndValidate(supabase: Supabase, file: File, mode: PriceImportMode) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const [sheet, { ctx, catalogMissing }] = await Promise.all([readPriceSheet(buffer), importContext(supabase, mode)]);
  return { buffer, preview: validatePriceImport(sheet, ctx), catalogMissing };
}

function toClient(p: PriceImportPreview, fileName: string, catalogMissing: number): ClientPricePreview {
  let budget = MAX_CHANGES_SHOWN;
  const contracts = p.contracts.map((c) => {
    const changed = c.lines.filter((l) => l.op !== "unchanged");
    const shown = changed.slice(0, Math.max(0, budget));
    budget -= shown.length;
    return { ...c, lines: shown, unchanged: c.lines.length - changed.length };
  });
  return {
    fileName,
    mode: p.mode,
    columns: p.columns,
    rowCount: p.rowCount,
    counts: p.counts,
    errorCount: p.errorCount,
    warningCount: p.warningCount,
    canImport: p.canImport,
    issues: p.issues.slice(0, MAX_ISSUES_SHOWN),
    issuesTruncated: p.issues.length > MAX_ISSUES_SHOWN,
    contracts,
    changesTruncated:
      p.contracts.reduce((n, c) => n + c.lines.filter((l) => l.op !== "unchanged").length, 0) > MAX_CHANGES_SHOWN,
    catalogMissing,
  };
}

function fileOf(formData: FormData): File | null {
  const f = formData.get("file");
  return f instanceof File && f.size > 0 ? f : null;
}

/** Step 1: read the file and show every error, warning and cell change. Nothing is written. */
export async function previewPriceImport(_prev: PriceImportState, formData: FormData): Promise<PriceImportState> {
  await requireBillingUser();
  const t = await getTranslations("BillingPrices");
  const file = fileOf(formData);
  if (!file) return { error: t("errChooseFile") };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: t("errFileType") };
  if (file.size > MAX_IMPORT_SIZE) return { error: t("errFileSize") };

  const supabase = await createClient();
  const { preview, catalogMissing } = await readAndValidate(supabase, file, modeOf(formData));
  return { preview: toClient(preview, file.name, catalogMissing) };
}

/**
 * Step 2: read and check the same file again against the current table, and
 * write it in one transaction (billing_import_price_lines). Refused when the
 * result differs from what the user previewed (someone changed the table in
 * between), or when "replace" would delete rows the user did not confirm.
 */
export async function confirmPriceImport(_prev: PriceImportState, formData: FormData): Promise<PriceImportState> {
  const user = await requireBillingUser();
  const t = await getTranslations("BillingPrices");
  const file = fileOf(formData);
  if (!file) return { error: t("errChooseFile") };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: t("errFileType") };
  if (file.size > MAX_IMPORT_SIZE) return { error: t("errFileSize") };
  const mode = modeOf(formData);

  let expected: unknown;
  try {
    expected = JSON.parse(String(formData.get("expected") ?? "null"));
  } catch {
    expected = null;
  }

  const supabase = await createClient();
  const { buffer, preview, catalogMissing } = await readAndValidate(supabase, file, mode);
  const client = toClient(preview, file.name, catalogMissing);
  if (!preview.canImport) return { error: t("errHasErrors"), preview: client };
  if (JSON.stringify(expected) !== JSON.stringify(preview.counts)) {
    return { error: t("errStale"), preview: client };
  }
  if (mode === "replace" && preview.counts.lines_deleted > 0 && formData.get("ack_delete") !== "1") {
    return { error: t("errAckDelete", { count: preview.counts.lines_deleted }), preview: client };
  }

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const storagePath = `price-imports/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.xlsx`;
  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from(BILLING_BUCKET)
    .upload(storagePath, buffer, { contentType: XLSX_MIME, upsert: false });
  if (upErr) return { error: t("errStorage", { message: upErr.message }), preview: client };

  const payload = buildImportPayload(preview, { file_name: file.name, size_bytes: file.size, sha256, storage_path: storagePath });
  const { data, error } = await supabase.rpc("billing_import_price_lines", { p_import: payload });
  if (error || !data) {
    await admin.storage.from(BILLING_BUCKET).remove([storagePath]);
    return { error: error?.code === "40001" ? t("errStale") : (error?.message ?? t("errImportFailed")), preview: client };
  }

  const { import_id, ...counts } = data;
  await logActivity(supabase, {
    action: "billing.prices_imported",
    entityType: "billing_price_import",
    entityId: import_id,
    metadata: { file_name: file.name, mode, ...counts, by: user.id },
  });
  revalidateBilling();
  return { success: t("imported"), imported: counts };
}
