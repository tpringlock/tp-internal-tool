import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BillingContract, BillingMisaUpload, Database } from "@/lib/db/types";
import { toContractConfig } from "./contract-config";
import { mergeLedgers } from "./merge-ledgers";
import { parseMisaLedger } from "./misa-parser";
import type { ContractConfig, Ledger } from "./types";

/** Private bucket holding uploaded MISA files (0027_billing.sql). */
export const BILLING_BUCKET = "billing";
/** Upload limit; the bucket enforces the same 10 MiB. */
export const MAX_MISA_FILE_SIZE = 10 * 1024 * 1024;
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Load a contract with its price lines and excluded codes, via the RLS-bound
 * client (so it doubles as an access check). Null if missing or not visible.
 */
export async function loadContract(
  supabase: SupabaseClient<Database>,
  contractId: string,
): Promise<{ contract: BillingContract; config: ContractConfig } | null> {
  const [{ data: contract }, { data: items }, { data: excluded }] = await Promise.all([
    supabase.from("billing_contracts").select("*").eq("id", contractId).maybeSingle(),
    supabase.from("billing_contract_items").select("*").eq("contract_id", contractId),
    supabase.from("billing_excluded_codes").select("ma_hang").eq("contract_id", contractId),
  ]);
  if (!contract) return null;
  return {
    contract,
    config: toContractConfig(contract, items ?? [], (excluded ?? []).map((e) => e.ma_hang)),
  };
}

/**
 * Download the given uploads from Storage (service role; callers must have
 * checked permission and read the rows through RLS first), parse each file
 * and merge them into one ledger. Throws MisaParseError / Error with a
 * Vietnamese message that can be shown to the user as-is.
 */
export async function loadMergedLedger(
  uploads: Pick<BillingMisaUpload, "storage_path" | "file_name">[],
): Promise<Ledger> {
  const admin = createAdminClient();
  const ledgers = await Promise.all(
    uploads.map(async (u) => {
      const { data, error } = await admin.storage.from(BILLING_BUCKET).download(u.storage_path);
      if (error || !data) throw new Error(`Không tải được file "${u.file_name}" từ kho lưu trữ.`);
      return parseMisaLedger(Buffer.from(await data.arrayBuffer()));
    }),
  );
  return mergeLedgers(ledgers);
}
