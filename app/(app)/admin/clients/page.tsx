import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { CreateClientForm } from "./client-forms";
import type { Client } from "@/lib/db/types";

const PAGE_SIZE = 50;

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page = "1", q = "" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("clients")
    .select("*", { count: "exact" })
    .order("name")
    .range(from, from + PAGE_SIZE - 1);
  const term = q.trim();
  if (term) {
    // Strip PostgREST or() delimiters so user input can't break the filter.
    const like = `%${term.replace(/[,()]/g, " ")}%`;
    query = query.or(
      `name.ilike.${like},code.ilike.${like},tax_code.ilike.${like}`,
    );
  }
  const { data, count } = await query;
  const clients = (data ?? []) as Client[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hrefForPage = (p: number) => {
    const sp = new URLSearchParams();
    if (term) sp.set("q", term);
    sp.set("page", String(p));
    return `/admin/clients?${sp.toString()}`;
  };
  const t = await getTranslations("Admin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-primary">
          {t("clientsTitle")}
        </h1>
        <p className="text-sm text-slate-500">{t("clientsSubtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("addClient")}</CardTitle>
        </CardHeader>
        <CardBody>
          <CreateClientForm />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="w-full sm:min-w-48 sm:flex-1">
              <label
                htmlFor="client-search"
                className="mb-1 block text-xs font-medium text-slate-500"
              >
                {t("searchClients")}
              </label>
              <Input
                id="client-search"
                name="q"
                defaultValue={term}
                placeholder={t("searchClientsPlaceholder")}
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
          <CardTitle>{t("allClients", { count: total })}</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          {clients.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">
              {t("noClients")}
            </p>
          ) : (
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t("name")}</th>
                  <th className="px-5 py-3 font-medium">{t("code")}</th>
                  <th className="px-5 py-3 font-medium">{t("taxCode")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td
                      data-label={t("name")}
                      title={client.name}
                      className="px-5 py-3 font-medium text-slate-900 md:max-w-xs md:truncate"
                    >
                      {client.name}
                    </td>
                    <td
                      data-label={t("code")}
                      className="px-5 py-3 text-slate-600"
                    >
                      {client.code}
                    </td>
                    <td
                      data-label={t("taxCode")}
                      className="px-5 py-3 text-slate-600"
                    >
                      {client.tax_code ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/clients/${client.id}`}
                        className="text-sm font-medium text-slate-700 underline hover:text-slate-900"
                      >
                        {t("manage")}
                      </Link>
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
