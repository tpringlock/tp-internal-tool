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

  // No upsert: an upsert by code could flip a real contract created after the
  // clash check into a demo one. Existing demo contracts are updated with an
  // is_demo = true filter; new codes are plain inserts, so a code taken by a
  // real contract in the meantime fails on the unique constraint instead.
  const header = (r: (typeof rows)[number]) => ({
    customer_name: r.customer_name,
    project_name: r.project_name,
    contract_no: r.contract_no,
    misa_kho: r.misa_kho,
    period_start_day: r.period_start_day,
    active: r.active,
  });
  const existing = await must(
    supabase
      .from("billing_contracts")
      .select("id, code")
      .eq("is_demo", true)
      .in("code", rows.map((r) => r.code)),
    "Đọc hợp đồng giả định đã có",
  );
  const idByCode = new Map((existing ?? []).map((c: { id: string; code: string }) => [c.code, c.id]));

  for (const r of rows.filter((r) => idByCode.has(r.code))) {
    const updated = await must(
      supabase
        .from("billing_contracts")
        .update(header(r))
        .eq("id", idByCode.get(r.code)!)
        .eq("is_demo", true)
        .select("id"),
      `Cập nhật hợp đồng ${r.code}`,
    );
    if (!updated || updated.length !== 1) throw new Error(`Hợp đồng ${r.code} không còn là giả định, dừng.`);
  }

  const fresh = rows.filter((r) => !idByCode.has(r.code));
  if (fresh.length > 0) {
    const inserted = await must(
      supabase
        .from("billing_contracts")
        .insert(fresh.map((r) => ({ code: r.code, ...header(r), is_demo: r.is_demo })))
        .select("id, code"),
      "Ghi hợp đồng mới",
    );
    for (const c of (inserted ?? []) as { id: string; code: string }[]) idByCode.set(c.code, c.id);
  }
  const ids = [...idByCode.values()];

  // Last guard before touching price rows: every target must be a demo contract.
  let demoCount = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = await must(
      supabase.from("billing_contracts").select("id").eq("is_demo", true).in("id", ids.slice(i, i + 100)),
      "Kiểm tra lại hợp đồng giả định",
    );
    demoCount += chunk?.length ?? 0;
  }
  if (demoCount !== ids.length) {
    throw new Error("Có hợp đồng không phải giả định trong danh sách ghi giá, dừng (chưa đụng dòng giá).");
  }

  // Replace the flat price rows (billing_price_lines, 0036; the old
  // billing_contract_items / billing_excluded_codes are frozen since 0037).
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    await must(supabase.from("billing_price_lines").delete().in("contract_id", chunk).select("id"), "Xóa dòng giá cũ");
  }
  const lines = rows.flatMap((r) => r.lines.map((l) => ({ ...l, contract_id: idByCode.get(r.code)! })));
  for (let i = 0; i < lines.length; i += 500) {
    await must(supabase.from("billing_price_lines").insert(lines.slice(i, i + 500)).select("id"), "Ghi dòng giá");
  }

  const zero = lines.filter((l) => l.unit_price === 0).length;
  console.log(
    `Đã seed ${rows.length} hợp đồng GIẢ ĐỊNH, ${lines.length} dòng giá (${zero} dòng 0đ = không tính tiền) vào ${host}.`,
  );
}

try {
  if (remove) await removeAll();
  else await seed();
} catch (e) {
  console.error("✗", (e as Error).message);
  process.exit(1);
}
