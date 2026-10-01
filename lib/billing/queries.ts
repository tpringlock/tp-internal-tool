import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingContract, BillingPriceLine, Database } from "@/lib/db/types";

type Client = SupabaseClient<Database>;

/** Cookie behind the "Hiện dữ liệu giả định" switch (a view preference only). */
export const SHOW_DEMO_COOKIE = "billing_show_demo";

/** Whether demo ("giả định") contracts and their calculations are shown. */
export async function getShowDemo(): Promise<boolean> {
  return (await cookies()).get(SHOW_DEMO_COOKIE)?.value === "1";
}

/** Today's date in ICT (the company's timezone) as "YYYY-MM-DD". */
export function todayIct(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

/** "Việt Panel – Senci (VIETPANEL-01)" style label for selects and lists. */
export function contractLabel(
  c: Pick<BillingContract, "customer_name" | "project_name" | "misa_kho">,
): string {
  return `${c.customer_name} – ${c.project_name} (${c.misa_kho})`;
}

/**
 * Contracts (real first, active first, then by customer) with their
 * price-line counts. Demo contracts only when `includeDemo`.
 */
export async function getContractsWithCounts(supabase: Client, includeDemo = false) {
  let contractQuery = supabase
    .from("billing_contracts")
    .select("*")
    .order("is_demo")
    .order("active", { ascending: false })
    .order("customer_name")
    .order("project_name");
  if (!includeDemo) contractQuery = contractQuery.eq("is_demo", false);
  const [{ data: contracts }, lines] = await Promise.all([
    contractQuery,
    getPriceLineContractIds(supabase, includeDemo),
  ]);
  const counts = new Map<string, number>();
  for (const l of lines) {
    counts.set(l.contract_id, (counts.get(l.contract_id) ?? 0) + 1);
  }
  return (contracts ?? []).map((c) => ({ ...c, item_count: counts.get(c.id) ?? 0 }));
}

const PAGE = 1000;

/**
 * Every row of a query, fetched in pages of 1000 (PostgREST's default row
 * limit would silently cut longer results). `page` builds the query for one
 * range; it must have a stable order.
 */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** contract_id of every price row (real contracts, plus demo ones when asked). */
async function getPriceLineContractIds(supabase: Client, includeDemo: boolean): Promise<{ contract_id: string }[]> {
  return fetchAll((from, to) => {
    let q = supabase
      .from("billing_price_lines")
      .select("contract_id, billing_contracts!inner(is_demo)")
      .order("id")
      .range(from, to);
    if (!includeDemo) q = q.eq("billing_contracts.is_demo", false);
    return q.overrideTypes<{ contract_id: string }[], { merge: false }>();
  });
}

/** Every price row of real (`demo: false`) or demo contracts, in table order. */
export async function getAllPriceLines(supabase: Client, opts: { demo: boolean }): Promise<BillingPriceLine[]> {
  return fetchAll((from, to) =>
    supabase
      .from("billing_price_lines")
      .select("*, billing_contracts!inner(is_demo)")
      .eq("billing_contracts.is_demo", opts.demo)
      .order("contract_id")
      .order("sort_order")
      .order("ma_vt")
      .range(from, to)
      .overrideTypes<BillingPriceLine[], { merge: false }>(),
  );
}

/** id -> full name for the given profile ids (profiles are readable by all users). */
export async function getProfileNames(
  supabase: Client,
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

/** id -> contract label for the given contract ids. */
export async function getContractLabels(
  supabase: Client,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from("billing_contracts")
    .select("id, customer_name, project_name, misa_kho")
    .in("id", unique);
  return new Map((data ?? []).map((c) => [c.id, contractLabel(c)]));
}
