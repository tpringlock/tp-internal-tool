/**
 * HSTT data rules shared by the pages, the server actions and the download
 * route (client-safe: no exceljs, no Supabase).
 *   - periodEditBlock: who/when the per-period inputs may be edited (lock);
 *   - confirmedDebts / openingDebtInfo: opening debt from confirmed periods;
 *   - hsttTransportRows: transport lines printed on the HSTT;
 *   - hsttMissing: what is missing before an HSTT can be generated.
 */
import type { BillingCalcStatus, BillingTransportPrice, BillingTransportChargeMode } from "@/lib/db/types";
import { toAmount } from "./amounts";
import {
  computeHsttTotals,
  openingDebtFor,
  previousMonth,
  type ConfirmedPeriodDebt,
  type HsttTransport,
} from "./hstt-totals";

/**
 * "1.550.000.000" / "1 550 000 000" / "1,550,000,000" -> 1550000000.
 * Dots, commas and spaces are thousand separators (amounts are whole VND).
 * Empty -> null; anything else that is not a whole number -> NaN.
 */
export function parseMoney(text: string): number | null {
  const s = text.replace(/[\s.,]/g, "");
  if (s === "") return null;
  return /^-?\d+$/.test(s) ? Number(s) : Number.NaN;
}

export type PeriodEditBlock = "viewer" | "notMonth" | "demo" | "voided" | "locked";

/**
 * Why the period inputs (transport, deductions, payment, opening debt) of a
 * calculation cannot be edited, or null when they can. Once ANY calculation
 * of the period is confirmed the period is locked; voiding that confirmation
 * (admin) unlocks it.
 */
export function periodEditBlock(p: {
  canEdit: boolean;
  status: BillingCalcStatus;
  periodMonth: string | null;
  isDemo: boolean;
  /** A confirmed calculation exists for this contract + period start. */
  confirmedForPeriod: boolean;
}): PeriodEditBlock | null {
  if (!p.canEdit) return "viewer";
  if (!p.periodMonth) return "notMonth";
  if (p.isDemo) return "demo";
  if (p.status === "voided") return "voided";
  if (p.confirmedForPeriod || p.status === "confirmed") return "locked";
  return null;
}

/** Saved transport row of a period, as stored (billing_period_transport). */
export interface SavedPeriodTransport {
  transport_price_id: string;
  trips: number | null;
  cumulative_trips: number | null;
  unit_price: number;
  charge_mode: BillingTransportChargeMode;
  note: string;
}

export interface HsttTransportRow extends HsttTransport {
  priceId: string;
}

/**
 * Transport lines of a period: every ACTIVE vehicle of the contract's price
 * list (a vehicle without data prints an empty line, like the hand-made file),
 * plus inactive ones that have data for the period. Price-list order; a saved
 * row keeps the price it was entered with.
 */
export function hsttTransportRows(
  prices: readonly BillingTransportPrice[],
  saved: readonly SavedPeriodTransport[],
): HsttTransportRow[] {
  const byPrice = new Map(saved.map((s) => [s.transport_price_id, s]));
  return [...prices]
    .filter((p) => p.active || byPrice.has(p.id))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "vi"))
    .map((p) => {
      const s = byPrice.get(p.id);
      return {
        priceId: p.id,
        name: p.name,
        unit: p.unit,
        unitPrice: s ? s.unit_price : p.unit_price,
        trips: s?.trips ?? null,
        cumulativeTrips: s?.cumulative_trips ?? null,
        chargeMode: s?.charge_mode ?? "now",
        note: s?.note ?? "",
      };
    });
}

/**
 * Confirmed calculations of a contract (billing months) + their period inputs
 * -> the debt chain entries (after-tax total, payment, typed opening debt).
 */
export function confirmedDebts(p: {
  vatPercent: number;
  calcs: readonly { period_month: string | null; period_from: string; total_amount: number | string }[];
  inputs: readonly {
    period_from: string;
    paid_in_period: number;
    opening_debt_override: number | null;
    transport: readonly Pick<SavedPeriodTransport, "trips" | "unit_price" | "charge_mode">[];
    deductions: readonly { amount: number }[];
  }[];
}): ConfirmedPeriodDebt[] {
  const inputs = new Map(p.inputs.map((i) => [i.period_from, i]));
  return p.calcs
    .filter((c): c is typeof c & { period_month: string } => !!c.period_month)
    .map((c) => {
      const i = inputs.get(c.period_from);
      const totals = computeHsttTotals({
        equipment: toAmount(c.total_amount),
        transport: (i?.transport ?? []).map((t) => ({
          name: "",
          unit: "",
          unitPrice: t.unit_price,
          trips: t.trips,
          cumulativeTrips: null,
          chargeMode: t.charge_mode,
          note: "",
        })),
        vatPercent: p.vatPercent,
        deductions: (i?.deductions ?? []).map((d) => ({ label: "", amount: d.amount })),
      });
      return {
        month: c.period_month,
        afterTax: totals.afterTax,
        paid: i?.paid_in_period ?? 0,
        openingOverride: i?.opening_debt_override ?? null,
      };
    });
}

export type OpeningDebtSource =
  | { kind: "override" }
  /** Closing debt of the confirmed calculation of `month`. */
  | { kind: "previous"; month: string }
  /** The contract's opening balance, at the end of `month`. */
  | { kind: "initial"; month: string }
  /** `month` = first unconfirmed month of the chain; null = no starting balance. */
  | { kind: "missing"; month: string | null };

export function openingDebtInfo(p: {
  month: string;
  override: number | null;
  opening: { amount: number; month: string } | null;
  confirmed: readonly ConfirmedPeriodDebt[];
}): { value: number | null; source: OpeningDebtSource } {
  if (p.override !== null) return { value: p.override, source: { kind: "override" } };
  const r = openingDebtFor({ month: p.month, opening: p.opening, confirmed: p.confirmed });
  if (!r.ok) return { value: null, source: { kind: "missing", month: r.missingMonth } };
  const prev = previousMonth(p.month);
  return {
    value: r.value,
    source: p.confirmed.some((c) => c.month === prev)
      ? { kind: "previous", month: prev }
      : { kind: "initial", month: p.opening!.month },
  };
}

export interface HsttContextData {
  calcStatus: BillingCalcStatus;
  periodMonth: string | null;
  isDemo: boolean;
  company: { ten_in_hoa: string; mst: string; so_tk: string; dai_dien: string } | null;
  hstt: { contract_date: string | null; du_an_ten: string } | null;
  contractNo: string;
  customer: { ten_in_hoa: string; ten_thuong: string; mst: string } | null;
  openingValue: number | null;
  openingSource: OpeningDebtSource;
}

/** A missing piece, as a key of the "Hstt.missing" messages (+ values). */
export interface HsttMissing {
  key: string;
  values?: Record<string, string>;
}

const COMPANY_REQUIRED = ["ten_in_hoa", "mst", "so_tk", "dai_dien"] as const;
const CUSTOMER_REQUIRED = ["ten_in_hoa", "ten_thuong"] as const;

/** Everything that stops an HSTT from being generated, in display order. */
export function hsttMissing(d: HsttContextData): HsttMissing[] {
  const out: HsttMissing[] = [];
  if (d.calcStatus !== "confirmed") out.push({ key: "notConfirmed" });
  if (!d.periodMonth) out.push({ key: "notMonth" });
  if (d.isDemo) out.push({ key: "demo" });

  if (!d.company) out.push({ key: "company" });
  else {
    for (const f of COMPANY_REQUIRED) if (!d.company[f].trim()) out.push({ key: "companyField", values: { field: f } });
  }

  if (!d.hstt) out.push({ key: "contractHstt" });
  else {
    if (!d.hstt.contract_date) out.push({ key: "contractDate" });
    if (!d.hstt.du_an_ten.trim()) out.push({ key: "projectName" });
  }
  if (!d.contractNo.trim()) out.push({ key: "contractNo" });

  if (!d.customer) out.push({ key: "customer" });
  else {
    for (const f of CUSTOMER_REQUIRED) if (!d.customer[f].trim()) out.push({ key: "customerField", values: { field: f } });
  }

  if (d.openingValue === null) {
    const m = d.openingSource.kind === "missing" ? d.openingSource.month : null;
    out.push(m ? { key: "openingMissingMonth", values: { month: m } } : { key: "openingNone" });
  }
  return out;
}

/**
 * A missing piece as text, through the "Hstt" messages: field names via
 * "fields.<name>", months as MM/YYYY.
 */
export function missingMessage(
  t: (key: string, values?: Record<string, string>) => string,
  m: HsttMissing,
): string {
  const values = m.values ? { ...m.values } : undefined;
  if (values?.field) values.field = t(`fields.${values.field}`);
  if (values?.month) values.month = `${values.month.slice(5, 7)}/${values.month.slice(0, 4)}`;
  return t(`missing.${m.key}`, values);
}
