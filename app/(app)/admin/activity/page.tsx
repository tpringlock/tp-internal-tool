import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { labelForAction, FILTERABLE_ACTIONS } from "@/lib/activity-labels";

const PAGE_SIZE = 50;

interface LogRow {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  actor: { full_name: string } | null;
}

function entityHref(type: string | null, id: string | null): string | null {
  if (!id) return null;
  if (type === "document") return `/documents/${id}`;
  if (type === "project") return `/admin/projects/${id}`;
  return null;
}

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  const { action = "", page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const t = await getTranslations("Admin");
  const ta = await getTranslations("Activity");

  let query = supabase
    .from("activity_log")
    .select(
      `id, action, entity_type, entity_id, created_at,
       actor:profiles!activity_log_actor_user_id_fkey ( full_name )`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (action) query = query.eq("action", action);

  const { data, count } = await query;
  const rows = (data ?? []) as unknown as LogRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (action) sp.set("action", action);
    sp.set("page", String(p));
    return `/admin/activity?${sp.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          {t("activityTitle")}
        </h1>
        <p className="text-sm text-slate-500">{t("activitySubtitle")}</p>
      </div>

      <Card>
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="min-w-56">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                {t("action")}
              </label>
              <Select name="action" defaultValue={action}>
                <option value="">{t("allActions")}</option>
                {FILTERABLE_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {labelForAction(ta, a)}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="secondary">
              {t("filter")}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="overflow-x-auto p-0">
          {rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">
              {t("noActivityFilter")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t("colWhen")}</th>
                  <th className="px-5 py-3 font-medium">{t("colWho")}</th>
                  <th className="px-5 py-3 font-medium">{t("action")}</th>
                  <th className="px-5 py-3 font-medium">{t("colItem")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const href = entityHref(r.entity_type, r.entity_id);
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                        {formatDateTime(r.created_at)}
                      </td>
                      <td className="px-5 py-3 text-slate-800">
                        {r.actor?.full_name ?? t("aClient")}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {labelForAction(ta, r.action)}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {href ? (
                          <Link
                            href={href}
                            className="underline hover:text-slate-900"
                          >
                            {r.entity_type}
                          </Link>
                        ) : (
                          (r.entity_type ?? "—")
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {t("pageOf", { page: pageNum, total: totalPages, count: total })}
          </span>
          <div className="flex gap-2">
            {pageNum > 1 && (
              <Link href={pageHref(pageNum - 1)}>
                <Button variant="secondary" size="sm">
                  {t("previous")}
                </Button>
              </Link>
            )}
            {pageNum < totalPages && (
              <Link href={pageHref(pageNum + 1)}>
                <Button variant="secondary" size="sm">
                  {t("next")}
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
