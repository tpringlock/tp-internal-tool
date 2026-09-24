import "server-only";

import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  MisaConnectPayload,
  MisaConnection,
  MisaEnvelope,
} from "@/lib/misa/types";

/**
 * Server-only MISA ACT Open API client used by the automated data sync.
 *
 * Unlike the admin playground (`app/actions/misa.ts`), this obtains and stores
 * the access token itself: the token + expiry live in the `misa_token` table
 * (never a module global — the app runs on serverless where globals don't
 * persist between invocations) and are refreshed on demand. Credentials come
 * exclusively from server-only env vars. Tokens are never logged.
 */

const SYNC_BASE = "/apir/sync/actopen";
const CONNECT_PATH = "/api/oauth/actopen/connect";

/** Refresh the token this long before its real expiry, to avoid edge misses. */
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;
/** Fallback token lifetime when MISA's expiry can't be parsed (~12h issued). */
const TOKEN_FALLBACK_LIFETIME_MS = 11 * 60 * 60 * 1000;

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

/** Error carrying the upstream status + (best-effort) parsed envelope. */
export class MisaApiError extends Error {
  readonly status: number;
  readonly envelope?: unknown;

  constructor(message: string, status: number, envelope?: unknown) {
    super(message);
    this.name = "MisaApiError";
    this.status = status;
    this.envelope = envelope;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter for the Nth attempt (1-based). */
function backoff(attempt: number): Promise<void> {
  const base = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
  return delay(base + Math.floor(Math.random() * RETRY_BASE_DELAY_MS));
}

function safeJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Unwrap MISA's `{ Success, Data }` envelope. `Data` is usually a stringified
 * JSON value; parse one extra layer when present.
 */
function unwrapData<T>(envelope: unknown): T {
  const raw =
    envelope && typeof envelope === "object" && "Data" in envelope
      ? (envelope as MisaEnvelope).Data
      : envelope;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }
  return raw as T;
}

/** Read a field by any of its known casing variants. */
function pick(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

/** Convert MISA's `expired_time` into an ISO instant, with a safe fallback. */
function parseExpiry(expiredTime: string | null): string {
  if (expiredTime) {
    // Numeric epoch (seconds or milliseconds).
    if (/^\d+$/.test(expiredTime)) {
      const n = Number(expiredTime);
      const ms = expiredTime.length <= 10 ? n * 1000 : n;
      if (Number.isFinite(ms) && ms > Date.now()) {
        return new Date(ms).toISOString();
      }
    }
    const parsed = Date.parse(expiredTime);
    if (Number.isFinite(parsed) && parsed > Date.now()) {
      return new Date(parsed).toISOString();
    }
  }
  return new Date(Date.now() + TOKEN_FALLBACK_LIFETIME_MS).toISOString();
}

interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
}

/**
 * fetch() with an explicit timeout and retry/backoff on network errors and 5xx.
 * 4xx responses are returned as-is (the caller decides what to do, e.g. 401).
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  { timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES }: FetchOptions = {},
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status >= 500 && attempt <= retries) {
        await backoff(attempt);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt <= retries) {
        await backoff(attempt);
        continue;
      }
      throw new MisaApiError(`Network error calling MISA: ${String(err)}`, 0);
    }
  }
}

/** Open a session with MISA using the server-only credentials. */
async function connect(): Promise<MisaConnection> {
  const res = await fetchWithRetry(`${env.misaApiUrl()}${CONNECT_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: env.misaAppId(),
      access_code: env.misaAccessCode(),
      org_company_code: env.misaOrgCompanyCode(),
    }),
  });

  const envelope = safeJson(await res.text());
  if (!res.ok) {
    throw new MisaApiError(`MISA connect failed (HTTP ${res.status})`, res.status);
  }

  const payload = (unwrapData<MisaConnectPayload>(envelope) ?? {}) as
    Record<string, unknown>;
  const accessToken = pick(payload, "access_token", "AccessToken");
  if (!accessToken) {
    throw new MisaApiError("MISA connect returned no access token", res.status);
  }

  return {
    accessToken,
    tenantCode: pick(payload, "tenant_code", "TenantCode"),
    appName: pick(payload, "app_name", "AppName"),
    expiredAt: parseExpiry(pick(payload, "expired_time", "ExpiredTime")),
  };
}

/**
 * Return a usable access token, refreshing + persisting it when missing or near
 * expiry. Pass `force` to bypass the cached row (used after a 401).
 */
export async function getAccessToken(force = false): Promise<string> {
  const supabase = createAdminClient();
  const org = env.misaOrgCompanyCode();

  if (!force) {
    const { data } = await supabase
      .from("misa_token")
      .select("access_token, expired_at")
      .eq("org_company_code", org)
      .maybeSingle();
    if (data?.access_token && data.expired_at) {
      const expiresAt = Date.parse(data.expired_at);
      if (
        Number.isFinite(expiresAt) &&
        expiresAt - Date.now() > TOKEN_EXPIRY_MARGIN_MS
      ) {
        return data.access_token;
      }
    }
  }

  const conn = await connect();
  await supabase.from("misa_token").upsert(
    {
      org_company_code: org,
      access_token: conn.accessToken,
      tenant_code: conn.tenantCode,
      app_name: conn.appName,
      expired_at: conn.expiredAt,
    },
    { onConflict: "org_company_code" },
  );
  return conn.accessToken;
}

/**
 * Call a MISA sync endpoint (e.g. "get_dictionary") and return the unwrapped
 * `Data`. Injects `app_id`, attaches the token, retries transient failures, and
 * refreshes the token once on a 401. Throws `MisaApiError` on failure.
 */
export async function misaFetch<T>(
  endpoint: string,
  body: Record<string, unknown> = {},
  options: FetchOptions = {},
): Promise<T> {
  const url = `${env.misaApiUrl()}${SYNC_BASE}/${endpoint}`;
  const payload = JSON.stringify({ app_id: env.misaAppId(), ...body });

  const call = async (token: string) =>
    fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MISA-AccessToken": token,
        },
        body: payload,
      },
      options,
    );

  let res = await call(await getAccessToken());
  if (res.status === 401) {
    res = await call(await getAccessToken(true));
  }

  const envelope = safeJson(await res.text());
  if (!res.ok) {
    throw new MisaApiError(
      `MISA ${endpoint} failed (HTTP ${res.status})`,
      res.status,
      envelope,
    );
  }

  const success =
    envelope && typeof envelope === "object"
      ? ((envelope as MisaEnvelope).Success ?? (envelope as MisaEnvelope).success)
      : undefined;
  if (success === false) {
    const message =
      (envelope as MisaEnvelope).ErrorMessage ?? "MISA returned Success=false";
    throw new MisaApiError(`MISA ${endpoint}: ${message}`, res.status, envelope);
  }

  return unwrapData<T>(envelope);
}

/**
 * Page through a list endpoint using skip/take (take capped at 100, MISA's
 * maximum) until a short page signals the end. Returns all records.
 */
export async function paginate<T>(
  endpoint: string,
  body: Record<string, unknown> = {},
  pageSize = 100,
  options: FetchOptions = {},
): Promise<T[]> {
  const take = Math.min(Math.max(1, pageSize), 100);
  const all: T[] = [];
  let skip = 0;

  for (;;) {
    const page = await misaFetch<unknown>(
      endpoint,
      { ...body, skip, take },
      options,
    );
    const items = Array.isArray(page) ? (page as T[]) : [];
    all.push(...items);
    if (items.length < take) break;
    skip += take;
  }

  return all;
}
