"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireContentManager } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { env } from "@/lib/env";
import { MISA_ENDPOINTS } from "@/lib/misa/endpoints";
import {
  runSync,
  MISA_SYNC_TYPES,
  type MisaSyncType,
  type SyncResult,
} from "@/lib/misa/sync";

/**
 * Result of a MISA API call surfaced to the admin playground. Unlike form
 * actions (which return the shared `FormState`), these return the raw upstream
 * payload so the tester can inspect exactly what MISA sent back.
 */
export type MisaResult = {
  /** True when the HTTP call itself completed (any 2xx–5xx); see `status`. */
  ok: boolean;
  /** Upstream HTTP status, or 0 for a network/app-level failure. */
  status: number;
  /** Parsed JSON body, or the raw text when the response was not JSON. */
  data?: unknown;
  /** App-level error (invalid JSON body, unknown endpoint, network error). */
  error?: string;
  /** Only set by `misaConnect`: the access token to reuse for later calls. */
  token?: string;
  tenantCode?: string;
  expiredTime?: string;
  /** Company name returned by connect — handy to confirm the right tenant. */
  appName?: string;
};

/** Read the JSON body if the content type is JSON, otherwise fall back to text. */
async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Open a session with MISA and obtain an access token (valid ~12h). `app_id`
 * comes from the server-only env; the admin supplies the per-company
 * `access_code` (generated in AMIS Kế toán) and `org_company_code`.
 */
export async function misaConnect(
  accessCode: string,
  orgCompanyCode: string,
): Promise<MisaResult> {
  await requireAdmin();

  const code = accessCode.trim();
  const org = orgCompanyCode.trim();
  if (!code || !org) {
    return { ok: false, status: 0, error: "Thiếu access_code hoặc org_company_code." };
  }

  let res: Response;
  try {
    res = await fetch(`${env.misaApiUrl()}/api/oauth/actopen/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: env.misaAppId(),
        access_code: code,
        org_company_code: org,
      }),
      cache: "no-store",
    });
  } catch (err) {
    return { ok: false, status: 0, error: `Lỗi kết nối tới MISA: ${String(err)}` };
  }

  const data = await readBody(res);
  // MISA nests the payload under `Data` as a *stringified* JSON object, e.g.
  // { "Success": true, "Data": "{\"access_token\":\"...\",\"tenant_code\":\"...\"}" }
  // so parse the string before reading fields.
  const raw = (data as { Data?: unknown })?.Data ?? data;
  let payload: unknown = raw;
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }
  const p = (payload ?? {}) as Record<string, unknown>;
  const token =
    (p.access_token as string) ?? (p.AccessToken as string) ?? undefined;
  const tenantCode =
    (p.tenant_code as string) ?? (p.TenantCode as string) ?? undefined;
  const expiredTime =
    (p.expired_time as string) ?? (p.ExpiredTime as string) ?? undefined;
  const appName = (p.app_name as string) ?? (p.AppName as string) ?? undefined;

  const supabase = await createClient();
  await logActivity(supabase, {
    action: "misa.connect",
    metadata: { org_company_code: org, status: res.status, ok: res.ok },
  });

  return {
    ok: res.ok,
    status: res.status,
    data,
    token,
    tenantCode,
    expiredTime,
    appName,
  };
}

/**
 * Proxy a single business call to MISA using a previously obtained token. The
 * `path`/`method` must match a known endpoint from the catalog so the admin
 * can only reach documented MISA routes on the configured host.
 */
export async function misaRequest(
  path: string,
  method: "POST" | "DELETE",
  token: string,
  bodyJson: string,
): Promise<MisaResult> {
  await requireAdmin();

  if (!token) {
    return { ok: false, status: 0, error: "Chưa có access token — hãy kết nối trước." };
  }

  const endpoint = MISA_ENDPOINTS.find(
    (e) => e.path === path && e.method === method,
  );
  if (!endpoint) {
    return { ok: false, status: 0, error: "Endpoint không hợp lệ." };
  }

  let parsedBody: unknown;
  const trimmed = bodyJson.trim();
  if (trimmed) {
    try {
      parsedBody = JSON.parse(trimmed);
    } catch {
      return { ok: false, status: 0, error: "JSON body không hợp lệ." };
    }
  }

  // Several MISA endpoints (get_dictionary, get_company_info, ...) expect `app_id`
  // inside the JSON body. Inject it server-side so the secret never touches the
  // browser and the admin doesn't have to type it. Only merge into a plain
  // object; array payloads (save/save_dictionary) carry app_id differently.
  const isPlainObject =
    typeof parsedBody === "object" &&
    parsedBody !== null &&
    !Array.isArray(parsedBody);
  const finalBody = isPlainObject
    ? { app_id: env.misaAppId(), ...(parsedBody as Record<string, unknown>) }
    : parsedBody;

  let res: Response;
  try {
    res = await fetch(`${env.misaApiUrl()}${endpoint.path}`, {
      method: endpoint.method,
      headers: {
        "Content-Type": "application/json",
        "X-MISA-AccessToken": token,
      },
      body: trimmed ? JSON.stringify(finalBody) : undefined,
      cache: "no-store",
    });
  } catch (err) {
    return { ok: false, status: 0, error: `Lỗi kết nối tới MISA: ${String(err)}` };
  }

  const data = await readBody(res);

  const supabase = await createClient();
  // Log the endpoint + status only — never the request body or response, which
  // may carry customer accounting data.
  await logActivity(supabase, {
    action: "misa.request",
    metadata: { endpoint: endpoint.value, status: res.status, ok: res.ok },
  });

  return { ok: res.ok, status: res.status, data };
}

/**
 * Run the MISA data sync from the admin UI ("Đồng bộ ngay"). Restricted to
 * content managers (admin/manager). Pass specific `types` or omit to sync all.
 * Logs the trigger + per-type status only (never customer data).
 */
export async function syncMisaNow(
  types?: MisaSyncType[],
): Promise<{ ok: boolean; results: SyncResult[] }> {
  const user = await requireContentManager();

  const selected =
    types && types.length
      ? types.filter((t) => (MISA_SYNC_TYPES as string[]).includes(t))
      : MISA_SYNC_TYPES;

  const results = await runSync(selected, {
    trigger: "manual",
    actorUserId: user.id,
  });

  const supabase = await createClient();
  await logActivity(supabase, {
    action: "misa.sync",
    metadata: {
      trigger: "manual",
      results: results.map((r) => ({
        type: r.type,
        status: r.status,
        upserted: r.upserted,
        deleted: r.deleted,
      })),
    },
  });

  revalidatePath("/admin/misa");
  const ok = results.every((r) => r.status === "success");
  return { ok, results };
}
