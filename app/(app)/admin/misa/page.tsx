import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { requireContentManager } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { MISA_SYNC_TYPES } from "@/lib/misa/sync";
import { MisaSyncDashboard, type MisaSyncRow } from "./misa-sync-dashboard";
import { MisaTabs } from "./misa-tabs";
import { ModuleEyebrow } from "@/components/page-title";

export default async function MisaSyncStatusPage() {
  const user = await requireContentManager();
  const t = await getTranslations("MisaSync");
  const supabase = await createClient();

  const [{ data: states }, { data: logs }] = await Promise.all([
    supabase.from("misa_sync_state").select("data_type, last_sync_time"),
    supabase
      .from("misa_sync_log")
      .select(
        "data_type, status, finished_at, records_upserted, records_deleted, error",
      )
      .order("started_at", { ascending: false })
      .limit(40),
  ]);

  const lastSyncByType = new Map(
    (states ?? []).map((s) => [s.data_type, s.last_sync_time]),
  );
  const latestLogByType = new Map<string, NonNullable<typeof logs>[number]>();
  for (const log of logs ?? []) {
    if (!latestLogByType.has(log.data_type)) {
      latestLogByType.set(log.data_type, log);
    }
  }

  const rows: MisaSyncRow[] = MISA_SYNC_TYPES.map((type) => {
    const log = latestLogByType.get(type);
    return {
      type,
      lastSyncTime: lastSyncByType.get(type) ?? null,
      status: log?.status ?? null,
      upserted: log?.records_upserted ?? null,
      deleted: log?.records_deleted ?? null,
      error: log?.error ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <ModuleEyebrow id="admin" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t("title")}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        {user.profile.role === "admin" && (
          <Link
            href="/admin/misa/playground"
            className="text-sm text-slate-500 underline hover:text-slate-900"
          >
            {t("openPlayground")}
          </Link>
        )}
      </div>

      <MisaTabs />
      <MisaSyncDashboard rows={rows} />
    </div>
  );
}
