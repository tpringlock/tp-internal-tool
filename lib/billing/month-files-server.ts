import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BillingMisaMonthFile, Database } from "@/lib/db/types";
import { buildMisaCatalog, mergeMisaCatalogs, type MisaCatalog } from "./misa-catalog";
import { MisaParseError, parseMisaLedger } from "./misa-parser";
import { readMisaTitle } from "./misa-title";
import { checkMonthFile, countVouchers } from "./month-files";
import { BILLING_BUCKET, MAX_MISA_FILE_SIZE } from "./server";
import type { Ledger } from "./types";

type Client = SupabaseClient<Database>;

/** One uploaded file after reading it (nothing stored yet). */
export type InspectedMonthFile =
  | {
      ok: true;
      name: string;
      size: number;
      sha256: string;
      month: string;
      from: string;
      to: string;
      layout: Ledger["layout"];
      warehouses: number;
      vouchers: number;
      warnings: string[];
      catalog: MisaCatalog;
      buffer: Buffer;
    }
  | { ok: false; name: string; size: number; sha256: string | null; error: string };

/**
 * Read one MISA export and check it is a month file: .xlsx, size limit,
 * "Kho: <<Tất cả>>", exactly one calendar month. Vietnamese error otherwise.
 */
export async function inspectMonthFile(file: File): Promise<InspectedMonthFile> {
  const name = file.name;
  const size = file.size;
  if (!name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, name, size, sha256: null, error: "Chỉ nhận file .xlsx tải từ MISA." };
  }
  if (size > MAX_MISA_FILE_SIZE) {
    return { ok: false, name, size, sha256: null, error: "File lớn hơn 10MB." };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  let ledger: Ledger;
  let title: string;
  try {
    [ledger, title] = await Promise.all([parseMisaLedger(buffer), readMisaTitle(buffer)]);
  } catch (e) {
    const error = e instanceof MisaParseError ? e.message : "Không đọc được file. Đây có phải Sổ chi tiết vật tư hàng hóa của MISA?";
    return { ok: false, name, size, sha256, error };
  }
  const check = checkMonthFile({ title, from: ledger.from, to: ledger.to });
  if (!check.ok) return { ok: false, name, size, sha256, error: check.error };
  return {
    ok: true,
    name,
    size,
    sha256,
    month: check.month,
    from: ledger.from,
    to: ledger.to,
    layout: ledger.layout,
    warehouses: Object.keys(ledger.warehouses).length,
    vouchers: countVouchers(ledger),
    warnings: ledger.warnings,
    catalog: buildMisaCatalog(ledger),
    buffer,
  };
}

/**
 * Month files backfilled by 0037 have no catalog / voucher count yet: read
 * their files once and store both (the 0035 guard allows filling them once,
 * never changing them). Caller must be a billing user (RLS update policy)
 * and have checked permission; Storage is read with the service role.
 * Returns how many rows were filled.
 */
export async function fillMissingCatalogs(
  supabase: Client,
  rows: Pick<BillingMisaMonthFile, "id" | "upload_id" | "catalog">[],
): Promise<number> {
  const todo = rows.filter((r) => r.catalog === null);
  if (todo.length === 0) return 0;
  const { data: uploads } = await supabase
    .from("billing_misa_uploads")
    .select("id, storage_path")
    .in("id", todo.map((r) => r.upload_id));
  const pathOf = new Map((uploads ?? []).map((u) => [u.id, u.storage_path]));
  const admin = createAdminClient();
  let filled = 0;
  for (const r of todo) {
    const path = pathOf.get(r.upload_id);
    if (!path) continue;
    const { data } = await admin.storage.from(BILLING_BUCKET).download(path);
    if (!data) continue;
    const ledger = await parseMisaLedger(Buffer.from(await data.arrayBuffer()));
    const catalog = buildMisaCatalog(ledger);
    const { error } = await supabase
      .from("billing_misa_month_files")
      .update({ catalog, voucher_count: countVouchers(ledger) })
      .eq("id", r.id)
      .is("catalog", null);
    if (!error) {
      r.catalog = catalog;
      filled++;
    }
  }
  return filled;
}

export interface ActiveMonthUpload {
  month: string;
  version: number;
  upload_id: string;
  file_name: string;
  storage_path: string;
}

/**
 * The ACTIVE month file of each of the given months that has one, with its
 * upload row, oldest month first (RLS-bound: also an access check). Feed it
 * to pickMonthFiles to find the missing months.
 */
export async function loadActiveMonthUploads(supabase: Client, months: readonly string[]): Promise<ActiveMonthUpload[]> {
  if (months.length === 0) return [];
  const { data: rows, error } = await supabase
    .from("billing_misa_month_files")
    .select("month, version, upload_id")
    .eq("status", "active")
    .in("month", [...months])
    .order("month");
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];
  const { data: uploads, error: upError } = await supabase
    .from("billing_misa_uploads")
    .select("id, file_name, storage_path")
    .in("id", rows.map((r) => r.upload_id));
  if (upError) throw new Error(upError.message);
  const byId = new Map((uploads ?? []).map((u) => [u.id, u]));
  return rows.flatMap((r) => {
    const u = byId.get(r.upload_id);
    return u ? [{ month: r.month, version: r.version, upload_id: r.upload_id, file_name: u.file_name, storage_path: u.storage_path }] : [];
  });
}

/**
 * Merged MISA catalog of the ACTIVE month files (newest month wins), or null
 * when there is none. With `fill`, catalogs still missing are read first
 * (needs a billing user); without it they are skipped and counted.
 */
export async function loadActiveCatalog(
  supabase: Client,
  opts: { fill: boolean },
): Promise<{ catalog: MisaCatalog | null; missing: number }> {
  const { data } = await supabase
    .from("billing_misa_month_files")
    .select("id, upload_id, month, catalog")
    .eq("status", "active")
    .order("month");
  const rows = data ?? [];
  if (opts.fill) await fillMissingCatalogs(supabase, rows);
  const have = rows.filter((r) => r.catalog !== null);
  return {
    catalog: have.length > 0 ? mergeMisaCatalogs(have.map((r) => r.catalog!)) : null,
    missing: rows.length - have.length,
  };
}
