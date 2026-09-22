/**
 * MISA ACT Open API capture script.
 *
 * Connects with the server-only credentials, calls each read endpoint once, and
 * writes MASKED sample responses to lib/misa/__fixtures__/ so the normalizers
 * and their tests can be built against real shapes (MST / phone / email / bank
 * numbers are redacted before anything is written to disk).
 *
 * Run (Node 20+):
 *   npx tsx scripts/misa-test.ts
 * Credentials are read from process.env; if absent, the script loads .env.local
 * (falling back to .env) from the project root. NOTHING here touches the DB.
 *
 * This is a standalone Node script: it deliberately does NOT import
 * lib/misa/client.ts (which is `server-only`) and re-implements a minimal
 * connect/fetch inline.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = resolve(ROOT, "lib/misa/__fixtures__");

// --- minimal .env loader (only if the vars aren't already in the environment) -
function loadEnv(): void {
  if (process.env.MISA_APP_ID) return;
  for (const file of [".env.local", ".env"]) {
    const path = resolve(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    break;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} (set it or add to .env.local)`);
  return value;
}

// --- envelope helpers (mirror lib/misa/client.ts) ----------------------------
function unwrapData(envelope: unknown): unknown {
  const raw =
    envelope && typeof envelope === "object" && "Data" in envelope
      ? (envelope as { Data?: unknown }).Data
      : envelope;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

// --- masking -----------------------------------------------------------------
const SENSITIVE_KEY = /(tax|mst|phone|tel|mobile|fax|email|bank.*account|account_number|cccd|cmnd|id_card)/i;

function maskString(value: string): string {
  if (value.length <= 4) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function mask(value: unknown, keyHint = ""): unknown {
  if (typeof value === "string") {
    return SENSITIVE_KEY.test(keyHint) ? maskString(value) : value;
  }
  if (Array.isArray(value)) return value.map((v) => mask(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = mask(v, k);
    }
    return out;
  }
  return value;
}

// --- MISA calls --------------------------------------------------------------
const API_URL = () => process.env.MISA_API_URL || "https://actapp.misa.vn";

async function connect(): Promise<string> {
  const res = await fetch(`${API_URL()}/api/oauth/actopen/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: requireEnv("MISA_APP_ID"),
      access_code: requireEnv("MISA_ACCESS_CODE"),
      org_company_code: requireEnv("MISA_ORG_COMPANY_CODE"),
    }),
  });
  const payload = (unwrapData(await res.json()) ?? {}) as Record<string, unknown>;
  const token =
    (payload.access_token as string) ?? (payload.AccessToken as string);
  if (!token) throw new Error(`Connect failed (HTTP ${res.status})`);
  console.log(`✓ Connected: ${payload.app_name ?? payload.AppName ?? "(no app_name)"}`);
  return token;
}

async function call(
  token: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${API_URL()}/apir/sync/actopen/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MISA-AccessToken": token },
    body: JSON.stringify({ app_id: requireEnv("MISA_APP_ID"), ...body }),
  });
  return unwrapData(await res.json());
}

function saveFixture(name: string, data: unknown): void {
  const count = Array.isArray(data) ? data.length : data ? 1 : 0;
  const path = resolve(FIXTURE_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(mask(data), null, 2), "utf8");
  console.log(`  → ${name}.json (${count} record${count === 1 ? "" : "s"})`);
}

// Endpoints to capture. Small `take` keeps fixtures readable.
const TARGETS: { name: string; endpoint: string; body: Record<string, unknown> }[] = [
  { name: "company_info", endpoint: "get_company_info", body: { branch_id: null } },
  { name: "customers", endpoint: "get_dictionary", body: { data_type: 1, skip: 0, take: 5, last_sync_time: null } },
  { name: "products", endpoint: "get_dictionary", body: { data_type: 3, skip: 0, take: 5, last_sync_time: null } },
  { name: "stocks", endpoint: "get_dictionary", body: { data_type: 5, skip: 0, take: 5, last_sync_time: null } },
  { name: "customers_deleted", endpoint: "get_dictionary_delete", body: { data_type: 1, skip: 0, take: 5, last_sync_time: null } },
  { name: "inventory_balance", endpoint: "get_list_inventory_balance", body: { skip: 0, take: 5 } },
  { name: "inventory_balance_deleted", endpoint: "get_list_inventory_balance_delete", body: { skip: 0, take: 5 } },
];

async function main(): Promise<void> {
  loadEnv();
  mkdirSync(FIXTURE_DIR, { recursive: true });

  const token = await connect();
  for (const target of TARGETS) {
    try {
      const data = await call(token, target.endpoint, target.body);
      saveFixture(target.name, data);
    } catch (err) {
      console.error(`  ✗ ${target.name}: ${String(err)}`);
    }
  }
  console.log(`\nFixtures written to ${FIXTURE_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
