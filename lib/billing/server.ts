import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BillingContract, BillingMisaUpload, BillingPriceLine, Database } from "@/lib/db/types";
import { PriceLinesError, toContractConfigFromLines } from "./price-lines";
import { getAllPriceLines } from "./queries";
import { mergeLedgers } from "./merge-ledgers";
import { parseMisaLedger } from "./misa-parser";
import type { ContractConfig, Ledger } from "./types";

/** Private bucket holding uploaded MISA files (0027_billing.sql). */
export const BILLING_BUCKET = "billing";
/** Upload limit; the bucket enforces the same 10 MiB. */
export const MAX_MISA_FILE_SIZE = 10 * 1024 * 1024;
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type LoadedContract =
  | { contract: BillingContract; lines: BillingPriceLine[]; config: ContractConfig; configError: null }
  | { contract: BillingContract; lines: BillingPriceLine[]; config: null; configError: string };

/**
 * Load a contract with its flat price rows (billing_price_lines, 0036) and the
 * engine config built from them, via the RLS-bound client (so it doubles as
 * an access check). Null if missing or not visible. When rows printed as one
 * HSTT line disagree on price/unit, `config` is null and `configError` says
 * why (calculating must stop).
 */
export async function loadContract(
  supabase: SupabaseClient<Database>,
  contractId: string,
): Promise<LoadedContract | null> {
  const [{ data: contract }, { data: lines }] = await Promise.all([
    supabase.from("billing_contracts").select("*").eq("id", contractId).maybeSingle(),
    supabase.from("billing_price_lines").select("*").eq("contract_id", contractId).order("sort_order"),
  ]);
  if (!contract) return null;
  try {
    return { contract, lines: lines ?? [], config: toContractConfigFromLines(contract, lines ?? []), configError: null };
  } catch (e) {
    if (!(e instanceof PriceLinesError)) throw e;
    return { contract, lines: lines ?? [], config: null, configError: e.message };
  }
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
 * comparison page. Price rows are paged (the seed has ~1500, over
 * PostgREST's 1000-row default). A demo contract whose rows conflict is
 * left out.
 */
export async function loadDemoConfigs(supabase: SupabaseClient<Database>): Promise<ContractConfig[]> {
  const { data: contracts } = await supabase
    .from("billing_contracts")
    .select("*")
    .eq("is_demo", true)
    .order("misa_kho");
  if (!contracts || contracts.length === 0) return [];

  // Joined filter instead of .in(209 ids), which would make a very long URL.
  const linesBy = Map.groupBy(await getAllPriceLines(supabase, { demo: true }), (l) => l.contract_id);
  return contracts.flatMap((c) => {
    try {
      return [toContractConfigFromLines(c, linesBy.get(c.id) ?? [])];
    } catch (e) {
      if (e instanceof PriceLinesError) return [];
      throw e;
    }
  });
}
