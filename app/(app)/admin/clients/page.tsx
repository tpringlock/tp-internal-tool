import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateClientForm, ClientRow } from "./client-forms";
import type { Client } from "@/lib/db/types";

export default async function AdminClientsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("*")
    .order("name");
  const clients = (data ?? []) as Client[];
  const t = await getTranslations("Admin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
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
        <CardHeader>
          <CardTitle>{t("allClients", { count: clients.length })}</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          {clients.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">
              {t("noClients")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t("name")}</th>
                  <th className="px-5 py-3 font-medium">{t("code")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <ClientRow key={client.id} client={client} />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
