import { getTranslations } from "next-intl/server";

import { requireContentManager } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { formatVND } from "@/lib/format";
import type { MisaInventoryBalance } from "@/lib/db/types";
import { MisaTabs } from "../misa-tabs";
import { ModuleEyebrow } from "@/components/page-title";

const PAGE_SIZE = 50;

export default async function MisaInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  await requireContentManager();
  const { page = "1", q = "" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;
  const term = q.trim();

  const supabase = await createClient();
  let query = supabase
    .from("misa_inventory_balances")
    .select("*", { count: "exact" })
    .order("product_name")
    .range(from, from + PAGE_SIZE - 1);
  if (term) {
    const like = `%${term.replace(/[,()]/g, " ")}%`;
    query = query.or(
      `product_name.ilike.${like},product_code.ilike.${like},stock_name.ilike.${like},stock_code.ilike.${like}`,
    );
  }
  const { data, count } = await query;
  const rows = (data ?? []) as MisaInventoryBalance[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hrefForPage = (p: number) => {
    const sp = new URLSearchParams();
    if (term) sp.set("q", term);
    sp.set("page", String(p));
    return `/admin/misa/inventory?${sp.toString()}`;
  };

  const t = await getTranslations("MisaData");

  return (
    <div className="space-y-6">
      <div>
        <ModuleEyebrow id="admin" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {t("inventoryTitle")}
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">{t("inventorySubtitle")}</p>
      </div>

      <MisaTabs />

      <Card>
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="w-full sm:min-w-48 sm:flex-1">
              <label
                htmlFor="misa-inventory-search"
                className="mb-1 block text-xs font-medium text-slate-500"
              >
                {t("search")}
              </label>
              <Input
                id="misa-inventory-search"
                name="q"
                defaultValue={term}
                placeholder={t("searchInventory")}
              />
            </div>
            <Button type="submit" variant="secondary" className="w-full sm:w-auto">
              {t("filter")}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("count", { count: total })}</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          {rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">{t("empty")}</p>
          ) : (
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t("colProduct")}</th>
                  <th className="px-5 py-3 font-medium">{t("colStock")}</th>
                  <th className="px-5 py-3 text-right font-medium">
                    {t("colQuantity")}
                  </th>
                  <th className="px-5 py-3 text-right font-medium">
                    {t("colValue")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td
                      data-label={t("colProduct")}
                      title={row.product_name ?? undefined}
                      className="px-5 py-3 font-medium text-slate-900 md:max-w-xs md:truncate"
                    >
                      {row.product_name || row.product_code || "—"}
                      {row.product_code && row.product_name ? (
                        <span className="block text-xs text-slate-400">
                          {row.product_code}
                        </span>
                      ) : null}
                    </td>
                    <td data-label={t("colStock")} className="px-5 py-3 text-slate-600">
                      {row.stock_name || row.stock_code || "—"}
                    </td>
                    <td
                      data-label={t("colQuantity")}
                      className="px-5 py-3 text-right tabular-nums text-slate-600"
                    >
                      {row.quantity ?? "—"}
                    </td>
                    <td
                      data-label={t("colValue")}
                      className="px-5 py-3 text-right tabular-nums text-slate-700"
                    >
                      {formatVND(row.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Pagination
        page={pageNum}
        totalPages={totalPages}
        total={total}
        hrefForPage={hrefForPage}
      />
    </div>
  );
}
