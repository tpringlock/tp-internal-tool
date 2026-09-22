import { type NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/dal";
import { canManageContent } from "@/lib/auth/roles";
import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import { runSync, MISA_SYNC_TYPES, type MisaSyncType } from "@/lib/misa/sync";

/**
 * MISA data sync trigger.
 *
 *   POST — manual sync, restricted to content managers (admin/manager). Body:
 *          { "types"?: MisaSyncType[] } (defaults to all types).
 *   GET  — scheduled sync for Vercel Cron, gated by the CRON_SECRET bearer
 *          token. Disabled while CRON_SECRET is unset (returns 401). Enable the
 *          cron in vercel.json when ready — see docs/misa-integration.md.
 */

// MISA calls + several upserts can outlast the default 10s; allow more headroom.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Keep only recognised sync types; returns null when the input is malformed. */
function parseTypes(input: unknown): MisaSyncType[] | null {
  if (input === undefined || input === null) return MISA_SYNC_TYPES;
  if (!Array.isArray(input)) return null;
  const valid = input.filter((t): t is MisaSyncType =>
    (MISA_SYNC_TYPES as string[]).includes(t as string),
  );
  return valid.length > 0 ? valid : null;
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!canManageContent(user.profile.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const types = parseTypes((body as { types?: unknown }).types);
  if (!types) {
    return NextResponse.json(
      { error: "Invalid or empty 'types'" },
      { status: 400 },
    );
  }

  const results = await runSync(types, {
    trigger: "manual",
    actorUserId: user.id,
  });

  // Log the trigger + per-type status only (never customer data).
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

  const ok = results.every((r) => r.status === "success");
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 207 });
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Disabled unless a secret is configured AND the caller presents it.
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const results = await runSync(MISA_SYNC_TYPES, { trigger: "cron" });
  const ok = results.every((r) => r.status === "success");
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 207 });
}
