import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingContract, Database } from "@/lib/db/types";

type Client = SupabaseClient<Database>;

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

/** Contracts (active first, then by customer) with their price-line counts. */
export async function getContractsWithCounts(supabase: Client) {
  const [{ data: contracts }, { data: items }] = await Promise.all([
    supabase
      .from("billing_contracts")
      .select("*")
      .order("active", { ascending: false })
      .order("customer_name")
      .order("project_name"),
    supabase.from("billing_contract_items").select("contract_id"),
  ]);
  const counts = new Map<string, number>();
  for (const i of items ?? []) {
    counts.set(i.contract_id, (counts.get(i.contract_id) ?? 0) + 1);
  }
  return (contracts ?? []).map((c) => ({ ...c, item_count: counts.get(c.id) ?? 0 }));
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
