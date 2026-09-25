import { daysInclusive, formatVnDate, overlapDays } from "./dates";
import type { ContractConfig, Ledger, Period, RentInput, RentItemResult, RentLine, RentResult } from "./types";

/**
 * Bước 1 – Từ dữ liệu MISA + hợp đồng → đầu vào cho engine của một kỳ.
 *
 * - Chỉ lấy kho của dự án.
 * - Gộp mã hàng thành dòng hiển thị theo hợp đồng, bỏ mã loại trừ (pallet…).
 * - Tồn đầu kỳ = Số dư đầu kỳ của file + Σ(nhập − xuất) trước ngày đầu kỳ.
 * - Mỗi phiếu (số chứng từ + ngày) trong kỳ là một dòng; nhiều mã cùng dòng hiển thị trong một phiếu được cộng lại.
 *
 * Lỗi (throw) khi file không bao phủ kỳ tính, hoặc có mã hàng phát sinh mà hợp đồng chưa khai báo:
 * thà dừng lại còn hơn tính thiếu tiền mà không ai biết.
 */
export function buildRentInput(ledger: Ledger, contract: ContractConfig, period: Period): RentInput & { warnings: string[] } {
  if (period.from > period.to) throw new BillingError(`Kỳ tính không hợp lệ: ${period.from} → ${period.to}`);
  if (ledger.from > period.from) {
    throw new BillingError(
      `File MISA bắt đầu từ ${formatVnDate(ledger.from)}, sau ngày đầu kỳ ${formatVnDate(period.from)}. ` +
        `Hãy tải sổ chi tiết từ ngày ${formatVnDate(period.from)} trở về trước.`,
    );
  }
  if (ledger.to < period.to) {
    throw new BillingError(
      `File MISA chỉ có dữ liệu đến ${formatVnDate(ledger.to)}, chưa hết kỳ (${formatVnDate(period.to)}).`,
    );
  }

  const warnings: string[] = [];
  const byCode = new Map<string, { name: string }>();
  for (const it of contract.items) for (const code of it.maHang) byCode.set(code, it);
  const excluded = new Set(contract.excludedMaHang);

  const opening = new Map<string, number>(contract.items.map((i) => [i.name, 0]));
  const moves = new Map<string, Map<string, { date: string; qty: number; ref: string }>>(
    contract.items.map((i) => [i.name, new Map()]),
  );
  const unknown = new Set<string>();

  const itemOf = (maHang: string, tenHang: string, hasActivity: boolean) => {
    if (excluded.has(maHang)) return null;
    const it = byCode.get(maHang);
    if (!it && hasActivity) unknown.add(`${maHang} (${tenHang})`);
    return it?.name ?? null;
  };

  for (const o of ledger.openings) {
    if (o.kho !== contract.misaKho) continue;
    const name = itemOf(o.maHang, o.tenHang, o.qty !== 0);
    if (name) opening.set(name, opening.get(name)! + o.qty);
  }
  for (const m of ledger.movements) {
    if (m.kho !== contract.misaKho || m.date > period.to) continue;
    const name = itemOf(m.maHang, m.tenHang, true);
    if (!name) continue;
    const delta = m.nhap - m.xuat;
    if (m.date < period.from) {
      opening.set(name, opening.get(name)! + delta);
    } else {
      const key = `${m.date}|${m.soCt}`;
      const map = moves.get(name)!;
      const prev = map.get(key);
      if (prev) prev.qty += delta;
      else map.set(key, { date: m.date, qty: delta, ref: m.soCt });
    }
  }
  if (unknown.size) {
    throw new BillingError(
      `Kho ${contract.misaKho} có mã hàng chưa khai báo trong hợp đồng "${contract.id}": ${[...unknown].join(", ")}. ` +
        `Hãy thêm đơn giá hoặc đưa vào danh sách không tính tiền.`,
    );
  }

  const items = contract.items
    .map((it) => ({
      name: it.name,
      unit: it.unit,
      unitPrice: it.unitPrice,
      opening: opening.get(it.name)!,
      movements: [...moves.get(it.name)!.values()]
        .filter((m) => m.qty !== 0)
        .sort((a, b) => (a.date === b.date ? a.ref.localeCompare(b.ref) : a.date < b.date ? -1 : 1)),
    }))
    .filter((it) => it.opening !== 0 || it.movements.length > 0);

  return { period, items, warnings };
}

/**
 * Bước 2 – Engine tính tiền thuê (hàm thuần).
 *
 *   Số ngày    = Ngày cuối kỳ − Ngày phiếu + 1 − số ngày miễn tính giao nhau
 *   Thành tiền = Số lượng × Số ngày × Đơn giá       (phiếu trả mang số âm)
 *
 * Hệ quả: ngày giao được tính tiền, ngày trả không tính.
 * Đã kiểm chứng khớp từng đồng với 9 kỳ HSTT Việt Panel (12/2025 → 08/2026).
 */
export function calculateRent(input: RentInput): RentResult {
  const { period } = input;
  const excluded = input.excludedRanges ?? [];
  const warnings: string[] = [];

  const makeLine = (kind: RentLine["kind"], date: string, qty: number, openingQty: number | null, price: number, ref: string, unit: string): RentLine => {
    if (!Number.isInteger(price) || price < 0) throw new BillingError(`Đơn giá không hợp lệ: ${price}`);
    if (date > period.to) throw new BillingError(`Phiếu ${ref} ngày ${date} nằm sau kỳ tính.`);
    if (date < period.from && kind === "phat-sinh") {
      warnings.push(`Phiếu ${ref} ngày ${formatVnDate(date)} thuộc kỳ trước nhưng được tính vào kỳ này.`);
    }
    const fullDays = daysInclusive(date, period.to);
    const excludedDays = excluded.reduce((s, r) => s + overlapDays(date, period.to, r.from, r.to), 0);
    const days = fullDays - excludedDays;
    const amount = qty * days * price;
    if (!Number.isSafeInteger(amount)) throw new BillingError(`Thành tiền vượt giới hạn số nguyên: ${ref}`);
    const explain =
      `${fmt(qty)} ${unit.toLowerCase()} × ${days} ngày` +
      (excludedDays ? ` (${fullDays} − ${excludedDays} ngày miễn tính)` : "") +
      ` × ${fmt(price)}đ = ${fmt(amount)}đ`;
    return { kind, date, endDate: period.to, openingQty, qty, days, excludedDays, unitPrice: price, amount, ref, explain };
  };

  const items: RentItemResult[] = input.items.map((it) => {
    const lines: RentLine[] = [];
    if (it.opening !== 0) lines.push(makeLine("ton-dau-ky", period.from, it.opening, it.opening, it.unitPrice, "Tồn đầu kỳ", it.unit));
    for (const m of it.movements) lines.push(makeLine("phat-sinh", m.date, m.qty, null, it.unitPrice, m.ref, it.unit));
    const closingQty = lines.reduce((s, l) => s + l.qty, 0);
    if (closingQty < 0) warnings.push(`${it.name}: tồn cuối kỳ âm (${closingQty}). Kiểm tra lại phiếu nhập/xuất.`);
    return {
      name: it.name,
      unit: it.unit,
      unitPrice: it.unitPrice,
      lines,
      closingQty,
      amount: lines.reduce((s, l) => s + l.amount, 0),
    };
  });

  return { period, items, totalAmount: items.reduce((s, i) => s + i.amount, 0), warnings };
}

/** Tiện ích: file MISA + hợp đồng + kỳ → kết quả. */
export function computeRentFromLedger(
  ledger: Ledger,
  contract: ContractConfig,
  period: Period,
  excludedRanges?: RentInput["excludedRanges"],
): RentResult {
  const { warnings, ...input } = buildRentInput(ledger, contract, period);
  const result = calculateRent({ ...input, excludedRanges });
  result.warnings.unshift(...warnings);
  return result;
}

export class BillingError extends Error {}

const nf = new Intl.NumberFormat("vi-VN");
function fmt(n: number) {
  return nf.format(n);
}
