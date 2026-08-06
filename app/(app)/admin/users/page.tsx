import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { setUserActive, setUserRole } from "@/app/actions/users";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateUserForm } from "./create-user-form";
import type { Profile } from "@/lib/db/types";

interface UserRow extends Profile {
  email: string;
}

async function getUsers(): Promise<UserRow[]> {
  const admin = createAdminClient();
  const [{ data: authData }, { data: profiles }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("profiles").select("*"),
  ]);

  const emailById = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  return (profiles ?? [])
    .map((p) => ({ ...p, email: emailById.get(p.id) ?? "" }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export default async function AdminUsersPage() {
  const currentAdmin = await requireAdmin();
  const users = await getUsers();
  const t = await getTranslations("Admin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          {t("usersTitle")}
        </h1>
        <p className="text-sm text-slate-500">{t("usersSubtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("addUser")}</CardTitle>
        </CardHeader>
        <CardBody>
          <CreateUserForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("allUsers", { count: users.length })}</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="px-5 py-3 font-medium">{t("name")}</th>
                <th className="px-5 py-3 font-medium">{t("colEmail")}</th>
                <th className="px-5 py-3 font-medium">{t("role")}</th>
                <th className="px-5 py-3 font-medium">{t("status")}</th>
                <th className="px-5 py-3 font-medium">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentAdmin.id;
                return (
                  <tr
                    key={u.id}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {u.full_name || "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{u.email}</td>
                    <td className="px-5 py-3">
                      <span className="text-slate-700">
                        {u.role === "admin" ? t("adminRole") : t("employee")}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {u.is_active ? (
                        <span className="text-green-700">{t("active")}</span>
                      ) : (
                        <span className="text-slate-400">{t("disabled")}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-2">
                        <form action={setUserRole}>
                          <input type="hidden" name="user_id" value={u.id} />
                          <input
                            type="hidden"
                            name="role"
                            value={u.role === "admin" ? "employee" : "admin"}
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            type="submit"
                            disabled={isSelf}
                          >
                            {u.role === "admin"
                              ? t("makeEmployee")
                              : t("makeAdmin")}
                          </Button>
                        </form>
                        <form action={setUserActive}>
                          <input type="hidden" name="user_id" value={u.id} />
                          <input
                            type="hidden"
                            name="active"
                            value={u.is_active ? "false" : "true"}
                          />
                          <Button
                            variant={u.is_active ? "danger" : "secondary"}
                            size="sm"
                            type="submit"
                            disabled={isSelf && u.is_active}
                          >
                            {u.is_active ? t("deactivate") : t("activate")}
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
