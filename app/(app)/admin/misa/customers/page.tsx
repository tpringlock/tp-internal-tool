import { getTranslations } from "next-intl/server";

import { requireContentManager } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/format";
import type { MisaCustomer } from "@/lib/db/types";
import { MisaTabs } from "../misa-tabs";

const PAGE_SIZE = 50;

const ROLE_LABEL: Record<string, string> = {
  customer: "KH",
  vendor: "NCC",
  employee: "NV",
};

function objectTypeLabel(value: string | null): string {
  if (!value) return "—";
  return value
    .split(",")
    .map((v) => ROLE_LABEL[v] ?? v)
    .join(" / ");
}

export default async function MisaCustomersPage({
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
    .from("misa_customers")
    .select("*", { count: "exact" })
    .eq("is_deleted", false)
    .order("name")
    .range(from, from + PAGE_SIZE - 1);
  if (term) {
    const like = `%${term.replace(/[,()]/g, " ")}%`;
    query = query.or(
      `name.ilike.${like},code.ilike.${like},tax_code.ilike.${like}`,
    );
  }
  const { data, count } = await query;
  const rows = (data ?? []) as MisaCustomer[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hrefForPage = (p: number) => {
    const sp = new URLSearchParams();
    if (term) sp.set("q", term);
    sp.set("page", String(p));
    return `/admin/misa/customers?${sp.toString()}`;
  };

  const t = await getTranslations("MisaData");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-primary">
          {t("customersTitle")}
        </h1>
        <p className="text-sm text-slate-500">{t("customersSubtitle")}</p>
      </div>

      <MisaTabs />

      <Card>
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="w-full sm:min-w-48 sm:flex-1">
              <label
                htmlFor="misa-customer-search"
                className="mb-1 block text-xs font-medium text-slate-500"
              >
                {t("search")}
              </label>
              <Input
                id="misa-customer-search"
                name="q"
                defaultValue={term}
                placeholder={t("searchCustomers")}
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
                  <th className="px-5 py-3 font-medium">{t("colName")}</th>
                  <th className="px-5 py-3 font-medium">{t("colCode")}</th>
                  <th className="px-5 py-3 font-medium">{t("colTaxCode")}</th>
                  <th className="px-5 py-3 font-medium">{t("colType")}</th>
                  <th className="px-5 py-3 font-medium">{t("colUpdated")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td
                      data-label={t("colName")}
                      title={row.name}
                      className="px-5 py-3 font-medium text-slate-900 md:max-w-xs md:truncate"
                    >
                      {row.name || "—"}
                    </td>
                    <td data-label={t("colCode")} className="px-5 py-3 text-slate-600">
                      {row.code ?? "—"}
                    </td>
                    <td data-label={t("colTaxCode")} className="px-5 py-3 text-slate-600">
                      {row.tax_code ?? "—"}
                    </td>
                    <td data-label={t("colType")} className="px-5 py-3 text-slate-600">
                      {objectTypeLabel(row.object_type)}
                    </td>
                    <td data-label={t("colUpdated")} className="px-5 py-3 text-slate-600">
                      {formatDateTime(row.synced_at)}
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
