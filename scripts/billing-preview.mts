/**
 * Chạy thử không cần web:
 *   npx tsx scripts/billing-preview.mts <file-misa.xlsx> <YYYY-MM> [out.xlsx]
 * File MISA phải bao phủ từ ngày 26 tháng trước đến ngày 25 tháng tính tiền
 * (trên MISA chọn Kỳ báo cáo "Tùy chọn", Từ ngày 26/.. Đến ngày 25/..).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { billingPeriod, computeRentFromLedger, formatVnDate, parseMisaLedger } from "../lib/billing/index";
import { exportRentXlsx } from "../lib/billing/export-xlsx";
import { vietpanelSenci } from "../lib/billing/contracts/vietpanel-senci";

const [file, month, out = `tien-thue-${month}.xlsx`] = process.argv.slice(2);
if (!file || !month) {
  console.error("Cách dùng: npx tsx scripts/billing-preview.mts <file-misa.xlsx> <YYYY-MM> [out.xlsx]");
  process.exit(1);
}
const ledger = await parseMisaLedger(readFileSync(file));
const period = billingPeriod(month);
console.log(`File MISA: ${formatVnDate(ledger.from)} → ${formatVnDate(ledger.to)} (${ledger.layout})`);
console.log(`Kỳ tính:   ${formatVnDate(period.from)} → ${formatVnDate(period.to)}\n`);

let res;
try {
  res = computeRentFromLedger(ledger, vietpanelSenci, period);
} catch (e) {
  console.error("✗", (e as Error).message);
  process.exit(1);
}
for (const it of res.items) {
  console.log(`${it.name.padEnd(40)} tồn cuối ${String(it.closingQty).padStart(8)}  ${it.amount.toLocaleString("vi-VN").padStart(15)}đ`);
}
console.log(`\nTỔNG TIỀN THUÊ THIẾT BỊ: ${res.totalAmount.toLocaleString("vi-VN")}đ`);
res.warnings.forEach((w) => console.warn("⚠", w));
writeFileSync(out, await exportRentXlsx(res, vietpanelSenci));
console.log(`Đã ghi ${out}`);
