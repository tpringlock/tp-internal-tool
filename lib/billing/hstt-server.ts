import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BillingContract,
  BillingContractAdvance,
  BillingContractHstt,
  BillingCustomer,
  BillingPeriodDeduction,
  BillingPeriodInput,
  BillingRentCalculation,
  CompanyProfile,
  Database,
} from "@/lib/db/types";
import {
  confirmedDebts,
  hsttMissing,
  hsttTransportRows,
  openingDebtInfo,
  type HsttMissing,
  type HsttTransportRow,
  type OpeningDebtSource,
  type SavedPeriodTransport,
} from "./hstt-data";
import { closingDebt, computeHsttTotals, type HsttTotals } from "./hstt-totals";
import type { HsttInput } from "./hstt-export";

export interface HsttContext {
  calc: BillingRentCalculation;
  contract: BillingContract;
  hstt: BillingContractHstt | null;
  customer: BillingCustomer | null;
  company: CompanyProfile | null;
  advances: BillingContractAdvance[];
  /** The period's saved inputs (shared by every calculation of the period). */
  periodInput: BillingPeriodInput | null;
  transport: HsttTransportRow[];
  deductions: BillingPeriodDeduction[];
  /** A confirmed calculation exists for this contract + period start. */
  confirmedForPeriod: boolean;
  vatPercent: number;
  /** Opening debt computed from the chain (ignoring this period's own override). */
  chainOpening: { value: number | null; source: OpeningDebtSource };
  /** Opening debt actually used (the period's override if any). */
  opening: { value: number | null; source: OpeningDebtSource };
  totals: HsttTotals;
  closing: number | null;
  missing: HsttMissing[];
}

/**
 * Everything the HSTT block of a calculation page and the HSTT download need,
 * read through the RLS-bound client (so it doubles as an access check).
 * Null when the calculation is missing or not visible.
 */
export async function loadHsttContext(
  supabase: SupabaseClient<Database>,
  calcId: string,
): Promise<HsttContext | null> {
  const { data: calc } = await supabase.from("billing_rent_calculations").select("*").eq("id", calcId).maybeSingle();
  if (!calc) return null;
  const cid = calc.contract_id;

  const [
    { data: contract },
    { data: hstt },
    { data: company },
    { data: prices },
    { data: advances },
    { data: confirmedCalcs },
    { data: inputs },
  ] = await Promise.all([
    supabase.from("billing_contracts").select("*").eq("id", cid).maybeSingle(),
    supabase.from("billing_contract_hstt").select("*").eq("contract_id", cid).maybeSingle(),
    supabase.from("company_profile").select("*").eq("id", 1).maybeSingle(),
    supabase.from("billing_transport_prices").select("*").eq("contract_id", cid),
    supabase.from("billing_contract_advances").select("*").eq("contract_id", cid).order("sort_order"),
    supabase
      .from("billing_rent_calculations")
      .select("period_month, period_from, total_amount")
      .eq("contract_id", cid)
      .eq("status", "confirmed")
      .not("period_month", "is", null),
    supabase.from("billing_period_inputs").select("*").eq("contract_id", cid),
  ]);
  if (!contract) return null;

  const inputIds = (inputs ?? []).map((i) => i.id);
  const [{ data: customer }, { data: transportRows }, { data: deductionRows }] = await Promise.all([
    hstt?.customer_id
      ? supabase.from("billing_customers").select("*").eq("id", hstt.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    inputIds.length
      ? supabase.from("billing_period_transport").select("*").in("period_input_id", inputIds)
      : Promise.resolve({ data: [] }),
    inputIds.length
      ? supabase.from("billing_period_deductions").select("*").in("period_input_id", inputIds).order("sort_order")
      : Promise.resolve({ data: [] }),
  ]);

  const transportBy = Map.groupBy(transportRows ?? [], (r) => r.period_input_id);
  const deductionsBy = Map.groupBy(deductionRows ?? [], (r) => r.period_input_id);
  const vatPercent = hstt ? Number(hstt.vat_percent) : 8;

  const confirmed = confirmedDebts({
    vatPercent,
    calcs: confirmedCalcs ?? [],
    inputs: (inputs ?? []).map((i) => ({
      period_from: i.period_from,
      paid_in_period: Number(i.paid_in_period),
      opening_debt_override: i.opening_debt_override === null ? null : Number(i.opening_debt_override),
      transport: (transportBy.get(i.id) ?? []).map((t) => ({ ...t, unit_price: Number(t.unit_price) })),
      deductions: (deductionsBy.get(i.id) ?? []).map((d) => ({ amount: Number(d.amount) })),
    })),
  });

  const periodInput = (inputs ?? []).find((i) => i.period_from === calc.period_from) ?? null;
  const saved: SavedPeriodTransport[] = periodInput
    ? (transportBy.get(periodInput.id) ?? []).map((t) => ({ ...t, unit_price: Number(t.unit_price) }))
    : [];
  const transport = hsttTransportRows(
    (prices ?? []).map((p) => ({ ...p, unit_price: Number(p.unit_price) })),
    saved,
  );
  const deductions = periodInput
    ? (deductionsBy.get(periodInput.id) ?? []).map((d) => ({ ...d, amount: Number(d.amount) }))
    : [];

  const openingBalance =
    hstt && hstt.opening_debt !== null && hstt.opening_debt_month
      ? { amount: Number(hstt.opening_debt), month: hstt.opening_debt_month }
      : null;
  const missingNoMonth = { value: null, source: { kind: "missing", month: null } as OpeningDebtSource };
  const chainOpening = calc.period_month
    ? openingDebtInfo({ month: calc.period_month, override: null, opening: openingBalance, confirmed })
    : missingNoMonth;
  const override = periodInput?.opening_debt_override;
  const opening =
    override !== null && override !== undefined
      ? { value: Number(override), source: { kind: "override" } as OpeningDebtSource }
      : chainOpening;

  const totals = computeHsttTotals({
    equipment: calc.result.totalAmount,
    transport,
    vatPercent,
    deductions: deductions.map((d) => ({ label: d.label, amount: d.amount })),
  });
  const paid = periodInput ? Number(periodInput.paid_in_period) : 0;
  const closing = opening.value === null ? null : closingDebt({ opening: opening.value, incurred: totals.afterTax, paid });

  const missing = hsttMissing({
    calcStatus: calc.status,
    periodMonth: calc.period_month,
    isDemo: contract.is_demo,
    company,
    hstt,
    contractNo: contract.contract_no,
    customer,
    openingValue: opening.value,
    openingSource: opening.source,
    openingMonth: hstt?.opening_debt_month ?? null,
  });

  return {
    calc,
    contract,
    hstt,
    customer: customer ?? null,
    company,
    advances: (advances ?? []).map((a) => ({ ...a, amount: Number(a.amount) })),
    periodInput,
    transport,
    deductions,
    confirmedForPeriod: (confirmedCalcs ?? []).some((c) => c.period_from === calc.period_from),
    vatPercent,
    chainOpening,
    opening,
    totals,
    closing,
    missing,
  };
}

/** The export input of a complete context (call only when `missing` is empty). */
export function toHsttInput(ctx: HsttContext): HsttInput {
  const { calc, contract, hstt, customer, company, periodInput } = ctx;
  if (!hstt || !customer || !company || !calc.period_month || ctx.opening.value === null) {
    throw new Error("HSTT context is incomplete.");
  }
  const reasons = [...new Set(calc.excluded_ranges.map((r) => r.reason.trim()).filter(Boolean))];
  return {
    month: calc.period_month,
    period: { from: calc.period_from, to: calc.period_to },
    company,
    customer,
    contract: {
      type: hstt.contract_type,
      no: contract.contract_no,
      date: hstt.contract_date,
      duAnTen: hstt.du_an_ten,
      duAnDiaChi: hstt.du_an_dia_chi,
      canCuOverride: hstt.can_cu_override,
      vatPercent: ctx.vatPercent,
    },
    items: calc.result.items,
    excludedReason: reasons.join("; "),
    transport: ctx.transport,
    deductions: ctx.deductions.map((d) => ({ label: d.label, amount: d.amount })),
    debt: {
      advances: ctx.advances.map((a) => a.amount),
      advancesNote: hstt.advances_note,
      opening: ctx.opening.value,
      paid: periodInput ? Number(periodInput.paid_in_period) : 0,
    },
  };
}
