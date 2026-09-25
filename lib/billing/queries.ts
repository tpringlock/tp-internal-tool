import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingContract, Database } from "@/lib/db/types";

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
  const [{ data: contracts }, items] = await Promise.all([
    contractQuery,
    getAllItemContractIds(supabase),
  ]);
  const counts = new Map<string, number>();
  for (const i of items) {
    counts.set(i.contract_id, (counts.get(i.contract_id) ?? 0) + 1);
  }
  return (contracts ?? []).map((c) => ({ ...c, item_count: counts.get(c.id) ?? 0 }));
}

/**
 * contract_id of every price line. Paged: the demo seed alone has thousands
 * of lines, over PostgREST's default 1000-row limit.
 */
async function getAllItemContractIds(supabase: Client): Promise<{ contract_id: string }[]> {
  const PAGE = 1000;
  const out: { contract_id: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("billing_contract_items")
      .select("contract_id")
      .order("id")
      .range(from, from + PAGE - 1);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
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
