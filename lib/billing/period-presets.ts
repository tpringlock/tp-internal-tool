import { addDays, isoFromParts } from "./dates";
import { contractPeriod } from "./periods";
import type { IsoDate, Period } from "./types";

// Period presets ("mẫu kỳ", table billing_period_presets, 0040) and how a
// chosen period relates to a contract's own billing period. Pure and
// client-safe.

export const PRESET_MONTHS = [1, 3, 6, 12] as const;
export type PresetMonths = (typeof PRESET_MONTHS)[number];

export interface PresetSpec {
  /** 1-28. 1 = calendar months. */
  start_day: number;
  months: PresetMonths;
}

/** Presets seeded by 0040, used when the table can't be read. */
export const DEFAULT_PRESETS: (PresetSpec & { name: string })[] = [
  { name: "26→25 (1 tháng)", start_day: 26, months: 1 },
  { name: "Tháng dương lịch", start_day: 1, months: 1 },
];

/** Shift "YYYY-MM" by `delta` months. */
function shiftMonth(month: string, delta: number): [number, number] {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return [d.getUTCFullYear(), d.getUTCMonth() + 1];
}

/**
 * The period a preset gives for billing month `month` (the month the period
 * ends in):
 *   start day 1 -> 01 of month M-(months-1) .. last day of M
 *   start day d -> d of month M-months .. (d-1) of M
 * With months = 1 and d > 1 this equals billingPeriod(month, d).
 */
export function presetPeriod(spec: PresetSpec, month: string): Period {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Tháng không hợp lệ: "${month}" (cần YYYY-MM)`);
  if (!Number.isInteger(spec.start_day) || spec.start_day < 1 || spec.start_day > 28) {
    throw new Error(`Ngày bắt đầu kỳ phải từ 1 đến 28 (đang là ${spec.start_day}).`);
  }
  if (!PRESET_MONTHS.includes(spec.months)) throw new Error(`Số tháng của kỳ phải là 1, 3, 6 hoặc 12.`);
  if (spec.start_day === 1) {
    const [fy, fm] = shiftMonth(month, -(spec.months - 1));
    const [ny, nm] = shiftMonth(month, 1);
    return { from: isoFromParts(fy, fm, 1), to: addDays(isoFromParts(ny, nm, 1), -1) };
  }
  const [fy, fm] = shiftMonth(month, -spec.months);
  const [ty, tm] = shiftMonth(month, 0);
  return { from: isoFromParts(fy, fm, spec.start_day), to: isoFromParts(ty, tm, spec.start_day - 1) };
}

export interface ContractPeriodInfo {
  period_start_day: number;
  contract_start: IsoDate | null;
}

/**
 * The billing month whose contract period (start day, 1 month, shortened by
 * the contract start) is exactly `period`, or null. Only such a calculation
 * is a billing period (period_month set, confirmable, HSTT); any other
 * period is a custom range for a quick look.
 */
export function matchContractMonth(period: Period, contract: ContractPeriodInfo): string | null {
  const month = period.to.slice(0, 7);
  const own = contractPeriod(month, contract.period_start_day, contract.contract_start);
  return own.from === period.from && own.to === period.to ? month : null;
}

/**
 * Period of a preset for one contract: when the preset is the contract's own
 * period (1 month, same start day) the contract's period is used, so the
 * first period is shortened by the contract start like before. Returns the
 * period and its billing month (null = custom range, not confirmable).
 */
export function presetPeriodFor(
  spec: PresetSpec,
  month: string,
  contract: ContractPeriodInfo | null,
): { period: Period; periodMonth: string | null } {
  if (contract && spec.months === 1 && spec.start_day === contract.period_start_day) {
    return { period: contractPeriod(month, contract.period_start_day, contract.contract_start), periodMonth: month };
  }
  const period = presetPeriod(spec, month);
  return { period, periodMonth: contract ? matchContractMonth(period, contract) : null };
}

/**
 * How many contracts use each preset as their default. A preset in use can't
 * be deleted (FK on delete restrict, 0040), only set inactive.
 */
export function presetUsage(links: readonly { preset_id: string }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of links) out.set(l.preset_id, (out.get(l.preset_id) ?? 0) + 1);
  return out;
}
