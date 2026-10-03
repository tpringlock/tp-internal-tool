/**
 * Local check of an HSTT template file (no database):
 *
 *   npx tsx scripts/hstt-check-template.mts <mau.xlsx> [--out=thu.xlsx]
 *
 * Prints the check report (errors block saving, warnings do not) and, when
 * the template has no error and --out is given, writes a trial HSTT filled
 * with the T09/2026 Việt Panel data (lib/billing/__fixtures__/hstt-t09-2026-vietpanel.json).
 * `--editable=<file>` instead writes the standard template prepared for editing.
 * Exit code 1 when the template has errors.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildHstt, type HsttInput } from "../lib/billing/hstt-export";
import { buildEditableTemplate, validateTemplate } from "../lib/billing/hstt-template";

const args = process.argv.slice(2);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const editable = opt("editable");
if (editable) {
  writeFileSync(editable, await buildEditableTemplate(readFileSync("docs/hstt/hstt-template.xlsx")));
  console.log(`Đã ghi mẫu chuẩn để chỉnh: ${editable}`);
  process.exit(0);
}
const file = args.find((a) => !a.startsWith("--"));
if (!file) throw new Error("Cần đường dẫn file mẫu .xlsx.");

const buf = readFileSync(file);
const report = await validateTemplate(buf);
console.log(`${file}: ${report.size} byte, sha256 ${report.sha256}`);
for (const s of report.sheets) console.log(`  sheet "${s.name}": ${s.role ?? "(không vai trò, giữ nguyên)"}`);
const show = (i: (typeof report.errors)[number]) =>
  `${i.code}${i.sheet ? ` [${i.sheet}${i.cell ? `!${i.cell}` : ""}]` : ""}${i.values ? ` ${JSON.stringify(i.values)}` : ""}`;
for (const i of report.errors) console.log(`  LỖI     ${show(i)}`);
for (const i of report.warnings) console.log(`  CẢNH BÁO ${show(i)}`);
console.log(report.ok ? "=> Hợp lệ." : "=> Có lỗi, không dùng được.");

const out = opt("out");
if (report.ok && out) {
  const input = JSON.parse(
    readFileSync("lib/billing/__fixtures__/hstt-t09-2026-vietpanel.json", "utf8"),
  ) as HsttInput;
  const res = await buildHstt(input, buf);
  writeFileSync(out, res.buffer);
  console.log(`Đã ghi file thử ${out}: sau thuế ${res.totals.afterTax}, nợ cuối ${res.closingDebt}.`);
}
process.exit(report.ok ? 0 : 1);
