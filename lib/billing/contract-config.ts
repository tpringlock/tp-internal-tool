import type { BillingContract, BillingContractItem } from "@/lib/db/types";
import type { ContractConfig } from "./types";

/**
 * Build the engine's ContractConfig from the billing_* rows. Items are ordered
 * by sort_order (then name) because that is the line order on the HSTT.
 * `id` is the human-readable contract code, which the engine quotes in its
 * error messages.
 */
export function toContractConfig(
  contract: Pick<BillingContract, "code" | "customer_name" | "project_name" | "contract_no" | "misa_kho">,
  items: Pick<BillingContractItem, "name" | "unit" | "unit_price" | "ma_hang" | "sort_order">[],
  excludedCodes: string[],
): ContractConfig {
  return {
    id: contract.code,
    customerName: contract.customer_name,
    projectName: contract.project_name,
    contractNo: contract.contract_no,
    misaKho: contract.misa_kho,
    items: [...items]
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "vi"))
      .map((i) => ({ name: i.name, unit: i.unit, unitPrice: i.unit_price, maHang: [...i.ma_hang] })),
    excludedMaHang: [...excludedCodes].sort(),
  };
}

/** "VT0022, VT0090\nVT0091" -> ["VT0022", "VT0090", "VT0091"] (trimmed, de-duplicated, order kept). */
export function parseCodeList(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))];
}

/**
 * MISA codes that appear more than once across a contract's lines and
 * excluded list. Each code must map to exactly one line (or be excluded),
 * otherwise quantities would be counted twice.
 */
export function findDuplicateCodes(itemCodes: string[][], excludedCodes: string[] = []): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const code of [...itemCodes.flat(), ...excludedCodes]) {
    if (seen.has(code)) dup.add(code);
    seen.add(code);
  }
  return [...dup].sort();
}
