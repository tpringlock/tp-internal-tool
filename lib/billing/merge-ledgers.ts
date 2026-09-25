import { addDays, formatVnDate } from "./dates";
import type { Ledger } from "./types";

/**
 * Ghép nhiều file MISA liên tiếp (ví dụ file tháng 8 + file tháng 9) thành một,
 * để tính kỳ 26/08 → 25/09 khi không tải được theo khoảng ngày tùy chọn.
 *
 * - Các file phải nối tiếp nhau đúng ngày (file sau bắt đầu ngay sau ngày cuối của file trước).
 * - Số dư đầu kỳ lấy từ file đầu tiên; phát sinh cộng từ tất cả các file.
 * - Kiểm tra: số dư đầu kỳ của file sau phải bằng tồn cuối tính từ file trước, lệch thì cảnh báo.
 */
export function mergeLedgers(ledgers: Ledger[]): Ledger {
  if (ledgers.length === 0) throw new Error("Chưa có file nào.");
  const sorted = [...ledgers].sort((a, b) => (a.from < b.from ? -1 : 1));
  const warnings = sorted.flatMap((l) => l.warnings);

  const balance = new Map<string, number>();
  const key = (kho: string, ma: string) => `${kho}|${ma}`;
  for (const o of sorted[0].openings) balance.set(key(o.kho, o.maHang), (balance.get(key(o.kho, o.maHang)) ?? 0) + o.qty);

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    if (i > 0) {
      const prev = sorted[i - 1];
      if (addDays(prev.to, 1) !== cur.from) {
        throw new Error(
          `Các file không nối tiếp: file trước kết thúc ${formatVnDate(prev.to)}, file sau bắt đầu ${formatVnDate(cur.from)}.`,
        );
      }
      let mismatches = 0;
      for (const o of cur.openings) {
        const expected = balance.get(key(o.kho, o.maHang)) ?? 0;
        if (expected !== o.qty && mismatches++ < 20) {
          warnings.push(
            `Tồn đầu ${formatVnDate(cur.from)} của ${o.kho}/${o.maHang} trong file sau là ${o.qty}, nhưng cộng từ file trước ra ${expected}.`,
          );
        }
      }
    }
    for (const m of cur.movements) balance.set(key(m.kho, m.maHang), (balance.get(key(m.kho, m.maHang)) ?? 0) + m.nhap - m.xuat);
  }

  const warehouses = Object.assign({}, ...sorted.map((l) => l.warehouses));
  const layouts = new Set(sorted.map((l) => l.layout));
  return {
    from: sorted[0].from,
    to: sorted[sorted.length - 1].to,
    layout: layouts.size === 1 ? sorted[0].layout : "khac",
    openings: sorted[0].openings,
    movements: sorted.flatMap((l) => l.movements),
    warehouses,
    warnings,
  };
}
