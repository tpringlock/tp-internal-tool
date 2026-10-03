/**
 * READ-ONLY: dump the HSTT export input of one calculation as a
 * JSON fixture (for tests and the template preview of /billing/templates).
 *
 *   NODE_PATH=node_modules/next/dist/compiled npx tsx --conditions=react-server \
 *     scripts/hstt-snapshot.mts --project=<ref> \
 *     --contract=vietpanel-senci --month=2026-09 --out=lib/billing/__fixtures__/hstt-t09-2026-vietpanel.json
 *
 * The confirmed calculation of the month is used; `--calc=<id>` picks one
 * explicitly instead (a draft is accepted: "not confirmed" is ignored).
 *
 * (NODE_PATH + the condition resolve `server-only` to Next's empty marker.)
 * Only SELECTs (service role key from .env.local). `--project` must match
 * NEXT_PUBLIC_SUPABASE_URL, like the other scripts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/db/types";
import { loadHsttContext, toHsttInput } from "../lib/billing/hstt-server";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const project = arg("project");
const code = arg("contract");
const month = arg("month");
const out = arg("out");
const calcId = arg("calc");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
const host = new URL(url).hostname;
if (!project || host !== `${project}.supabase.co`) {
  console.error(`Dừng: database đang cấu hình là ${host}; xác nhận bằng --project=${host.split(".")[0]}.`);
  process.exit(1);
}
if (!out || (!calcId && (!code || !month))) {
  throw new Error("Cần --out=<file> và --calc=<id> hoặc --contract=<mã> --month=YYYY-MM.");
}

const db = createClient<Database>(url, key, { auth: { persistSession: false } });

async function confirmedCalc(): Promise<string> {
  const { data: contract, error: e1 } = await db.from("billing_contracts").select("id, code").eq("code", code!).single();
  if (e1 || !contract) throw new Error(`Không thấy hợp đồng ${code}: ${e1?.message}`);
  const { data: calcs, error: e2 } = await db
    .from("billing_rent_calculations")
    .select("id")
    .eq("contract_id", contract.id)
    .eq("period_month", month!)
    .eq("status", "confirmed");
  if (e2 || !calcs?.length) throw new Error(`Không có bản tính đã xác nhận ${code} ${month}: ${e2?.message ?? ""}`);
  if (calcs.length > 1) throw new Error(`Có ${calcs.length} bản tính đã xác nhận cho ${month}.`);
  return calcs[0].id;
}

const ctx = await loadHsttContext(db, calcId ?? (await confirmedCalc()));
if (!ctx) throw new Error("Không đọc được bản tính.");
ctx.missing = ctx.missing.filter((m) => !(calcId && m.key === "notConfirmed"));
if (ctx.missing.length) throw new Error(`Bản tính thiếu dữ liệu HSTT: ${JSON.stringify(ctx.missing)}`);
const input = toHsttInput(ctx);
writeFileSync(out, JSON.stringify(input, null, 2) + "\n");
console.log(`Đã ghi ${out}: thiết bị ${ctx.totals.equipment}, sau thuế ${ctx.totals.afterTax}, nợ cuối ${ctx.closing}.`);
