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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Clients</h1>
        <p className="text-sm text-slate-500">
          The client repository. Projects and documents are organised under
          these.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a client</CardTitle>
        </CardHeader>
        <CardBody>
          <CreateClientForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All clients ({clients.length})</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          {clients.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">
              No clients yet. Add your first one above.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Code</th>
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
