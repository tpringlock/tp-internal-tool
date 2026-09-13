/**
 * One-off import of Danh_sach_khach_hang.xlsx into public.clients.
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-clients.mjs --dry-run
 *   node --env-file=.env.local scripts/import-clients.mjs
 *
 * Requires migration 0021_client_contact_fields.sql to be applied first.
 * Idempotent: rows whose name already exists in the DB (case-insensitive)
 * are skipped, so re-running inserts nothing new.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const DRY_RUN = process.argv.includes("--dry-run");
const FILE = "Danh_sach_khach_hang.xlsx";
const BATCH_SIZE = 50;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env.local scripts/import-clients.mjs",
  );
  process.exit(1);
}

// The accounting export contains one U+FFFD replacement character and some
// doubled spaces; strip/collapse them.
const clean = (v) => {
  const s = String(v ?? "")
    .replace(/�/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s === "" ? null : s;
};

function parseWorkbook() {
  const wb = XLSX.read(readFileSync(FILE));
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // Row 3 is the header (STT | Mã khách hàng | Tên khách hàng | ...); data
  // starts at row 4 and ends before the trailing "Tổng" summary row.
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: ["stt", "old_code", "name", "address", "tax_code", "phone", "mobile", "internal"],
    range: 3,
    defval: null,
  });
  return rows
    .map((r) => ({
      name: clean(r.name),
      address: clean(r.address),
      tax_code: clean(r.tax_code),
      phone: clean(r.phone) ?? clean(r.mobile),
    }))
    .filter((r) => r.name !== null);
}

async function main() {
  const rows = parseWorkbook();
  console.log(`Parsed ${rows.length} customer rows from ${FILE}`);

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing, error: fetchError } = await supabase
    .from("clients")
    .select("name, code");
  if (fetchError) {
    console.error("Failed to fetch existing clients:", fetchError.message);
    process.exit(1);
  }

  const existingNames = new Set(existing.map((c) => c.name.trim().toLowerCase()));
  let nextNumber =
    Math.max(
      0,
      ...existing
        .map((c) => /^KH-(\d+)$/.exec(c.code))
        .filter(Boolean)
        .map((m) => Number(m[1])),
    ) + 1;

  const toInsert = [];
  const skipped = [];
  for (const row of rows) {
    if (existingNames.has(row.name.toLowerCase())) {
      skipped.push(row.name);
      continue;
    }
    toInsert.push({
      ...row,
      code: `KH-${String(nextNumber++).padStart(4, "0")}`,
      created_by: null,
    });
  }

  if (skipped.length > 0) {
    console.log(`\nSkipped ${skipped.length} rows already in DB (matched by name):`);
    for (const name of skipped) console.log(`  - ${name}`);
  }

  if (DRY_RUN) {
    console.log(`\n[dry-run] Would insert ${toInsert.length} clients:`);
    for (const c of toInsert) {
      console.log(
        `  ${c.code}  ${c.name}` +
          (c.tax_code ? `  (MST: ${c.tax_code})` : "") +
          (c.address ? `  ${c.address.slice(0, 40)}…` : ""),
      );
    }
    return;
  }

  let inserted = 0;
  const failed = [];
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("clients").insert(batch);
    if (!error) {
      inserted += batch.length;
      continue;
    }
    // Batch inserts are all-or-nothing; retry row by row so one conflict
    // doesn't sink the other 49.
    for (const row of batch) {
      const { error: rowError } = await supabase.from("clients").insert(row);
      if (rowError) failed.push({ name: row.name, code: row.code, message: rowError.message });
      else inserted += 1;
    }
  }

  console.log(`\nInserted ${inserted}, skipped ${skipped.length}, failed ${failed.length}.`);
  for (const f of failed) console.log(`  FAILED ${f.code} ${f.name}: ${f.message}`);

  const dupNames = rows
    .map((r) => r.name.toLowerCase())
    .filter((n, i, a) => a.indexOf(n) !== i);
  if (dupNames.length > 0) {
    console.log(
      `\nNote: the Excel file itself contains duplicate names (imported as separate clients, review manually): ${[...new Set(dupNames)].join(", ")}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
