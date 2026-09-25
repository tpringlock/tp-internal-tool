/**
 * Seed / remove the demo ("GIẢ ĐỊNH") billing contracts: one per MISA
 * warehouse, with the Excel tool's ASSUMED prices (sheet "DATA ĐƠN GIÁ").
 * Only for comparing the web app with the Excel tool, never for an HSTT.
 *
 *   npm run seed:gia-dinh -- --project=<dev-project-ref>
 *   npm run seed:gia-dinh:xoa -- --project=<dev-project-ref>
 *
 * DEV DATABASE ONLY. `--project` must match the project ref in
 * NEXT_PUBLIC_SUPABASE_URL (https://<ref>.supabase.co), so the script can't
 * run against a database you didn't name. Uses the service role key.
 * Credentials come from process.env, else .env.local / .env.
 *
 * Seeding is idempotent: contracts are upserted by code and their price lines
 * replaced. Removing deletes every demo contract and all its calculations.
 * Requires migration 0032 (is_demo).
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildDemoContracts } from "../lib/billing/demo-seed";
import type { ContractConfig } from "../lib/billing/types";

// --- minimal .env loader (only for vars not already set) -------------------
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

const args = process.argv.slice(2);
const remove = args.includes("--xoa");
const project = args.find((a) => a.startsWith("--project="))?.slice("--project=".length);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const host = new URL(url).hostname;
if (!project || host !== `${project}.supabase.co`) {
  console.error(
    `Dừng: database đang cấu hình là ${host}.\n` +
      `Chỉ chạy trên database DEV, và phải xác nhận bằng --project=<mã project dev>, ví dụ:\n` +
      `  npm run seed:gia-dinh${remove ? ":xoa" : ""} -- --project=${host.split(".")[0]}`,
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

async function demoContractIds(): Promise<string[]> {
  const rows = await must(
    supabase.from("billing_contracts").select("id").eq("is_demo", true),
    "Đọc hợp đồng giả định",
  );
  return (rows ?? []).map((r: { id: string }) => r.id);
}

async function removeAll() {
  const ids = await demoContractIds();
  // Calculations reference contracts with ON DELETE RESTRICT: delete them first.
  const calcs = await must(
    supabase.from("billing_rent_calculations").delete().eq("is_demo", true).select("id"),
    "Xóa bản tính giả định",
  );
  // Items, excluded codes and contract ranges cascade with the contract.
  const deleted = await must(
    supabase.from("billing_contracts").delete().eq("is_demo", true).select("id"),
    "Xóa hợp đồng giả định",
  );
  console.log(
    `Đã xóa ${deleted?.length ?? 0}/${ids.length} hợp đồng giả định và ${calcs?.length ?? 0} bản tính liên quan.`,
  );
}

async function seed() {
  const json = JSON.parse(
    readFileSync(new URL("../lib/billing/seed/gia-dinh-excel-contracts.json", import.meta.url), "utf8"),
  ) as { contracts: ContractConfig[] };
  const rows = buildDemoContracts(json.contracts);

  // Never turn a real contract into a demo one: refuse on any code clash.
  const clash = await must(
    supabase
      .from("billing_contracts")
      .select("code")
      .eq("is_demo", false)
      .in("code", rows.map((r) => r.code)),
    "Kiểm tra trùng mã",
  );
  if (clash && clash.length > 0) {
    throw new Error(`Mã đã dùng cho hợp đồng thật: ${clash.map((c: { code: string }) => c.code).join(", ")}`);
  }

  const contracts = await must(
    supabase
      .from("billing_contracts")
      .upsert(
        rows.map((r) => ({
          code: r.code,
          customer_name: r.customer_name,
          project_name: r.project_name,
          contract_no: r.contract_no,
          misa_kho: r.misa_kho,
          period_start_day: r.period_start_day,
          active: r.active,
          is_demo: r.is_demo,
        })),
        { onConflict: "code" },
      )
      .select("id, code"),
    "Ghi hợp đồng",
  );
  const idByCode = new Map((contracts ?? []).map((c: { id: string; code: string }) => [c.code, c.id]));
  const ids = [...idByCode.values()];

  // Replace price lines and excluded codes.
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    await must(supabase.from("billing_contract_items").delete().in("contract_id", chunk).select("id"), "Xóa dòng giá cũ");
    await must(supabase.from("billing_excluded_codes").delete().in("contract_id", chunk).select("ma_hang"), "Xóa mã loại trừ cũ");
  }
  const items = rows.flatMap((r) => r.items.map((it) => ({ ...it, contract_id: idByCode.get(r.code)! })));
  for (let i = 0; i < items.length; i += 500) {
    await must(supabase.from("billing_contract_items").insert(items.slice(i, i + 500)).select("id"), "Ghi dòng giá");
  }
  const excluded = rows.flatMap((r) => r.excluded.map((ma_hang) => ({ contract_id: idByCode.get(r.code)!, ma_hang })));
  if (excluded.length > 0) {
    await must(supabase.from("billing_excluded_codes").insert(excluded).select("ma_hang"), "Ghi mã loại trừ");
  }

  const zero = rows.reduce((n, r) => n + r.items.filter((i) => i.unit_price === 0).length, 0);
  console.log(
    `Đã seed ${rows.length} hợp đồng GIẢ ĐỊNH, ${items.length} dòng giá (${zero} dòng 0đ giống Excel) vào ${host}.`,
  );
}

try {
  if (remove) await removeAll();
  else await seed();
} catch (e) {
  console.error("✗", (e as Error).message);
  process.exit(1);
}
