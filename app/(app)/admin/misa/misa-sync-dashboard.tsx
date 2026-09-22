"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatDateTime } from "@/lib/format";
import { syncMisaNow } from "@/app/actions/misa";
import type { MisaSyncType } from "@/lib/misa/sync";

export interface MisaSyncRow {
  type: MisaSyncType;
  lastSyncTime: string | null;
  status: string | null;
  upserted: number | null;
  deleted: number | null;
  error: string | null;
}

const STATUS_TONE: Record<string, string> = {
  success: "text-green-700",
  error: "text-red-700",
  running: "text-amber-600",
};

export function MisaSyncDashboard({ rows }: { rows: MisaSyncRow[] }) {
  const t = useTranslations("MisaSync");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<MisaSyncType | "all" | null>(null);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  function run(types: MisaSyncType[] | undefined, key: MisaSyncType | "all") {
    setBusy(key);
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await syncMisaNow(types);
        const total = res.results.reduce((sum, r) => sum + r.upserted, 0);
        setMessage({
          tone: res.ok ? "success" : "error",
          text: res.ok ? t("syncedCount", { count: total }) : t("syncHadErrors"),
        });
        router.refresh();
      } catch (err) {
        setMessage({ tone: "error", text: String(err) });
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{t("statusTitle")}</CardTitle>
        <Button
          size="sm"
          loading={pending && busy === "all"}
          disabled={pending}
          onClick={() => run(undefined, "all")}
        >
          {t("syncAll")}
        </Button>
      </CardHeader>
      <CardBody className="space-y-4">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <div className="overflow-x-auto">
          <table className="responsive-table w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="py-2 pr-4 font-medium">{t("type")}</th>
                <th className="py-2 pr-4 font-medium">{t("lastSync")}</th>
                <th className="py-2 pr-4 font-medium">{t("records")}</th>
                <th className="py-2 pr-4 font-medium">{t("statusCol")}</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.type}
                  className="border-b border-slate-50 last:border-0 align-top"
                >
                  <td
                    data-label={t("type")}
                    className="py-3 pr-4 font-medium text-slate-900"
                  >
                    {t(`types.${row.type}`)}
                  </td>
                  <td data-label={t("lastSync")} className="py-3 pr-4 text-slate-600">
                    {row.lastSyncTime ? formatDateTime(row.lastSyncTime) : "—"}
                  </td>
                  <td data-label={t("records")} className="py-3 pr-4 text-slate-600">
                    {row.status
                      ? `${row.upserted ?? 0} / ${row.deleted ?? 0}`
                      : "—"}
                  </td>
                  <td data-label={t("statusCol")} className="py-3 pr-4">
                    {row.status ? (
                      <span
                        className={STATUS_TONE[row.status] ?? "text-slate-600"}
                        title={row.error ?? undefined}
                      >
                        {t(`statuses.${row.status}`)}
                        {row.error ? " ⚠" : ""}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={pending && busy === row.type}
                      disabled={pending}
                      onClick={() => run([row.type], row.type)}
                    >
                      {t("syncNow")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
