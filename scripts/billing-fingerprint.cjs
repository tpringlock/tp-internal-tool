// Read-only fingerprint of the REAL (non-demo) billing data: row counts plus
// MD5 hashes, to compare before/after a change.
//
//   npm run billing:fingerprint              print the fingerprint
//   npm run billing:fingerprint -- --save    write it to billing-baseline.txt
//   npm run billing:fingerprint -- --check   compare with billing-baseline.txt
//                                            (exit code 1 when anything differs)
//
// It is a stand-in for supabase/revert/check-real-contracts.sql for machines
// whose Supabase CLI account cannot reach the project. It signs in through the
// app's anon key as a billing user, so RLS applies and nothing is written.
//
// The MD5 values are computed here over canonical JSON. They are NOT comparable
// with the md5 columns of check-real-contracts.sql (nor with the marks recorded
// in CLAUDE.md); compare them only with other runs of this script. The row
// counts are comparable.
//
// Environment (never hard-code these; the npm script loads .env.local):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
//   AUDIT_ACCOUNT, AUDIT_PASSWORD   an account that can read /billing
//                                   (admin, accountant or billing_viewer)
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const BASELINE = path.join(__dirname, "..", "billing-baseline.txt");
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "AUDIT_ACCOUNT",
  "AUDIT_PASSWORD",
];
const PAGE = 1000; // PostgREST returns at most 1000 rows per request.

const md5 = (rows) =>
  crypto
    .createHash("md5")
    .update(rows.map((r) => JSON.stringify(r)).join("\n"))
    .digest("hex");

/** Every row of `table`, paged, in a stable order. */
async function all(supabase, table, columns, order, filter) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select(columns);
    if (filter) query = filter(query);
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

async function fingerprint() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`missing environment variables: ${missing.join(", ")}`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.AUDIT_ACCOUNT,
    password: process.env.AUDIT_PASSWORD,
  });
  if (error) throw new Error(`sign-in failed: ${error.message}`);

  const contracts = await all(
    supabase,
    "billing_contracts",
    "id, code, customer_name, project_name, contract_no, misa_kho, period_start_day, contract_start, active, updated_at, is_demo",
    ["id"],
  );
  const real = contracts.filter((c) => !c.is_demo);
  const ids = real.map((c) => c.id);
  const ofReal = (query) => query.in("contract_id", ids);

  const items = await all(
    supabase,
    "billing_contract_items",
    "id, contract_id, name, unit, unit_price, ma_hang, sort_order, updated_at",
    ["id"],
    ofReal,
  );
  const excluded = await all(
    supabase,
    "billing_excluded_codes",
    "contract_id, ma_hang",
    ["contract_id", "ma_hang"],
    ofReal,
  );
  const calcs = await all(
    supabase,
    "billing_rent_calculations",
    "id, contract_id, status, period_from, period_to, total_amount",
    ["id"],
    ofReal,
  );
  const priceLines = await all(supabase, "billing_price_lines", "*", ["id"], ofReal);

  const byStatus = {};
  for (const c of calcs) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;

  return [
    `project_ref=${new URL(url).host.split(".")[0]}`,
    "method=js-fingerprint (anon key + admin login, RLS applied; md5 NOT comparable with check-real-contracts.sql)",
    `real_contracts=${real.length}`,
    `real_contract_codes=${real.map((c) => c.code).sort().join(",")}`,
    `real_items=${items.length}`,
    `real_excluded_codes=${excluded.length}`,
    `real_calculations=${calcs.length}`,
    `calculations_by_status=${JSON.stringify(byStatus)}`,
    `contracts_md5_js=${md5(real)}`,
    `items_md5_js=${md5(items)}`,
    `excluded_md5_js=${md5(excluded)}`,
    `calculations_md5_js=${md5(calcs)}`,
    `real_price_lines=${priceLines.length}`,
    `price_lines_md5_js=${md5(priceLines)}`,
  ];
}

/** Baseline lines without comments and blank lines. */
function readBaseline() {
  if (!fs.existsSync(BASELINE)) return null;
  return fs
    .readFileSync(BASELINE, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"));
}

async function main() {
  const mode = process.argv[2];
  if (mode && mode !== "--save" && mode !== "--check") {
    throw new Error(`unknown option ${mode} (use --save or --check)`);
  }
  const lines = await fingerprint();

  if (mode === "--save") {
    const header = `# Billing fingerprint, saved ${new Date().toISOString()}. Local file, do not commit.`;
    fs.writeFileSync(BASELINE, [header, ...lines].join("\n") + "\n");
    console.log(lines.join("\n"));
    console.log(`\nSaved to ${path.basename(BASELINE)}`);
    return;
  }

  if (mode === "--check") {
    const baseline = readBaseline();
    if (!baseline) {
      throw new Error(`${path.basename(BASELINE)} not found; run with --save first`);
    }
    const key = (line) => line.slice(0, line.indexOf("="));
    const before = new Map(baseline.map((line) => [key(line), line]));
    const after = new Map(lines.map((line) => [key(line), line]));
    const diffs = [];
    for (const name of new Set([...before.keys(), ...after.keys()])) {
      if (before.get(name) !== after.get(name)) {
        diffs.push(`- ${before.get(name) ?? `${name}=(missing)`}\n+ ${after.get(name) ?? `${name}=(missing)`}`);
      }
    }
    if (diffs.length) {
      console.log(diffs.join("\n"));
      console.log(`\n${diffs.length} difference(s) from ${path.basename(BASELINE)}`);
      process.exitCode = 1;
      return;
    }
    console.log(`0 differences from ${path.basename(BASELINE)} (${lines.length} values)`);
    return;
  }

  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(`billing-fingerprint: ${error.message}`);
  process.exitCode = 1;
});
