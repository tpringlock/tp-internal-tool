import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BillingContract, BillingContractItem, BillingMisaUpload, Database } from "@/lib/db/types";
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

/**
 * Every demo ("giả định") contract as an engine config, for the Excel
 * comparison page. Price lines are paged: the seed has ~1500 of them, over
 * PostgREST's 1000-row default.
 */
export async function loadDemoConfigs(supabase: SupabaseClient<Database>): Promise<ContractConfig[]> {
  const { data: contracts } = await supabase
    .from("billing_contracts")
    .select("*")
    .eq("is_demo", true)
    .order("misa_kho");
  if (!contracts || contracts.length === 0) return [];

  const PAGE = 1000;
  const items: BillingContractItem[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("billing_contract_items")
      .select("*, billing_contracts!inner(is_demo)")
      .eq("billing_contracts.is_demo", true)
      .order("id")
      .range(from, from + PAGE - 1)
      .overrideTypes<BillingContractItem[], { merge: false }>();
    items.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  // Joined filter instead of .in(209 ids), which would make a very long URL.
  const { data: excluded } = await supabase
    .from("billing_excluded_codes")
    .select("contract_id, ma_hang, billing_contracts!inner(is_demo)")
    .eq("billing_contracts.is_demo", true)
    .overrideTypes<{ contract_id: string; ma_hang: string }[], { merge: false }>();

  const itemsBy = Map.groupBy(items, (i) => i.contract_id);
  const excludedBy = Map.groupBy(excluded ?? [], (e) => e.contract_id);
  return contracts.map((c) =>
    toContractConfig(
      c,
      itemsBy.get(c.id) ?? [],
      (excludedBy.get(c.id) ?? []).map((e) => e.ma_hang),
    ),
  );
}
