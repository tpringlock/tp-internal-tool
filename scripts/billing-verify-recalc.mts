/**
 * READ-ONLY check for the phase-1 cutover (0037): recalculate every saved
 * calculation of a REAL contract (not voided) from the price data in the
 * database, on exactly the MISA files and period it used, and compare with
 * the stored result line by line.
 *
 *   npx tsx scripts/billing-verify-recalc.mts --project=<ref> [--source=price-lines|items]
 *
 *   --source=price-lines (default): config from billing_price_lines (new, 0036)
 *   --source=items: config from the old billing_contract_items /
 *                   billing_excluded_codes (to check the script itself)
 *
 * Only SELECTs and Storage downloads (service role key from .env.local).
 * `--project` must match NEXT_PUBLIC_SUPABASE_URL, like the seed script.
 * Exit code 1 when a total or a line differs.
 */
import { existsSync, readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { amountForDb } from "../lib/billing/amounts";
import { toContractConfig } from "../lib/billing/contract-config";
import { computeRentFromLedger } from "../lib/billing/engine";
import { warningsForWarehouse } from "../lib/billing/ledger-checks";
import { mergeLedgers } from "../lib/billing/merge-ledgers";
import { parseMisaLedger } from "../lib/billing/misa-parser";
import { toContractConfigFromLines } from "../lib/billing/price-lines";
import type { ContractConfig, Ledger, RentResult } from "../lib/billing/types";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
const args = process.argv.slice(2);
const project = args.find((a) => a.startsWith("--project="))?.slice(10);
const source = args.find((a) => a.startsWith("--source="))?.slice(9) ?? "price-lines";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
const host = new URL(url).hostname;
if (!project || host !== `${project}.supabase.co`) {
  console.error(`Dừng: database đang cấu hình là ${host}; xác nhận bằng --project=${host.split(".")[0]}.`);
  process.exit(1);
}
if (source !== "price-lines" && source !== "items") throw new Error(`--source không hợp lệ: ${source}`);

const db = createClient(url, key, { auth: { persistSession: false } });
async function must<T>(
  p: PromiseLike<{ data: T; error: { message: string } | null }>,
  what: string,
): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error || data === null || data === undefined) throw new Error(`${what}: ${error?.message ?? "không có dữ liệu"}`);
  return data;
}

const calcs = await must(
  db.from("billing_rent_calculations")
    .select("id, contract_id, period_month, period_from, period_to, upload_ids, contract_snapshot, excluded_ranges, total_amount, result, status, is_demo, created_at")
    .neq("status", "voided")
    .eq("is_demo", false)
    .order("created_at"),
  "Đọc bản tính",
);
console.log(`Nguồn đơn giá: ${source}. ${calcs.length} bản tính (hợp đồng thật, chưa hủy).\n`);

const ledgerCache = new Map<string, Ledger>();
async function ledgerFor(uploadIds: string[]): Promise<Ledger> {
  const k = uploadIds.join(",");
  if (ledgerCache.has(k)) return ledgerCache.get(k)!;
  const ups = await must(db.from("billing_misa_uploads").select("id, storage_path, file_name, file_from").in("id", uploadIds), "Đọc file");
  if (ups.length !== uploadIds.length) throw new Error(`Thiếu file của bản tính (${uploadIds.length - ups.length} file).`);
  const ledgers = await Promise.all(
    [...ups].sort((a, b) => (a.file_from < b.file_from ? -1 : 1)).map(async (u) => {
      const { data, error } = await db.storage.from("billing").download(u.storage_path);
      if (error || !data) throw new Error(`Không tải được ${u.file_name}`);
      return parseMisaLedger(Buffer.from(await data.arrayBuffer()));
    }),
  );
  const l = mergeLedgers(ledgers);
  ledgerCache.set(k, l);
  return l;
}

async function configFor(contractId: string): Promise<ContractConfig> {
  const c = await must(db.from("billing_contracts").select("*").eq("id", contractId).single(), "Đọc hợp đồng");
  if (source === "items") {
    const [items, excluded] = await Promise.all([
      must(db.from("billing_contract_items").select("*").eq("contract_id", contractId), "Đọc dòng giá cũ"),
      must(db.from("billing_excluded_codes").select("ma_hang").eq("contract_id", contractId), "Đọc mã loại trừ cũ"),
    ]);
    return toContractConfig(c, items, excluded.map((e: { ma_hang: string }) => e.ma_hang));
  }
  const lines = await must(db.from("billing_price_lines").select("*").eq("contract_id", contractId), "Đọc bảng giá");
  return toContractConfigFromLines(c, lines);
}

let bad = 0;
for (const calc of calcs) {
  const label = `${calc.id.slice(0, 8)} ${calc.period_month ?? "khoảng ngày"} ${calc.period_from}→${calc.period_to} [${calc.status}]`;
  try {
    const config = await configFor(calc.contract_id);
    const ledger = await ledgerFor(calc.upload_ids);
    const period = { from: calc.period_from, to: calc.period_to };
    const result: RentResult = computeRentFromLedger(ledger, config, period, calc.excluded_ranges);
    result.totalAmount = Number(amountForDb(result.totalAmount));
    result.warnings.unshift(...warningsForWarehouse(ledger.warnings, config.misaKho));

    const stored = calc.result as RentResult;
    const sameTotal = result.totalAmount === Number(calc.total_amount) && result.totalAmount === stored.totalAmount;
    const sameItems = isDeepStrictEqual(result.items, stored.items);
    const sameWarnings = isDeepStrictEqual(result.warnings, stored.warnings);
    const sameConfig = isDeepStrictEqual(config, calc.contract_snapshot);
    const ok = sameTotal && sameItems;
    if (!ok) bad++;
    console.log(
      `${ok ? "OK  " : "LỆCH"} ${label} kho ${config.misaKho}: đã lưu ${Number(calc.total_amount).toLocaleString("vi-VN")}đ, ` +
        `tính lại ${result.totalAmount.toLocaleString("vi-VN")}đ | từng dòng ${sameItems ? "khớp" : "LỆCH"} | ` +
        `cấu hình ${sameConfig ? "= bản chụp lúc tính" : "khác bản chụp"} | cảnh báo ${sameWarnings ? "khớp" : "khác (tham khảo)"}`,
    );
    if (!sameItems) {
      for (let i = 0; i < Math.max(result.items.length, stored.items.length); i++) {
        if (!isDeepStrictEqual(result.items[i], stored.items[i])) {
          console.log(`     dòng ${i + 1}: lưu "${stored.items[i]?.name}" ${stored.items[i]?.amount} / tính lại "${result.items[i]?.name}" ${result.items[i]?.amount}`);
        }
      }
    }
  } catch (e) {
    bad++;
    console.log(`LỖI ${label}: ${(e as Error).message}`);
  }
}
console.log(`\n${bad === 0 ? "0 khác biệt" : `${bad} bản tính lệch hoặc lỗi`} trên ${calcs.length} bản tính.`);
process.exit(bad === 0 ? 0 : 1);
