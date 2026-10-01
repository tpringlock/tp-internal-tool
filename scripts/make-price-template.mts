/**
 * Regenerate the price import template docs/mau-nhap-don-gia.xlsx from code
 * (column layout and guide in lib/billing/price-sheet.ts, sample rows in
 * lib/billing/price-template.ts), so the template, the export and the import
 * parser always agree.
 *
 *   npx tsx scripts/make-price-template.mts [output.xlsx]
 *
 * price-export.test.ts checks that the committed file matches what this
 * script produces (data and guide text).
 */
import { writeFileSync } from "node:fs";
import { priceWorkbookBuffer } from "../lib/billing/price-export";
import { PRICE_TEMPLATE_ROWS } from "../lib/billing/price-template";

const out = process.argv[2] ?? "docs/mau-nhap-don-gia.xlsx";
writeFileSync(out, await priceWorkbookBuffer(PRICE_TEMPLATE_ROWS, { template: true }));
console.log(`Đã ghi ${out} (${PRICE_TEMPLATE_ROWS.length} dòng mẫu).`);
