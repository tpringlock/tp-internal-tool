import { getTranslations } from "next-intl/server";
import { KeyRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { setUserActive } from "@/app/actions/users";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { CreateUserForm } from "./create-user-form";
import { RoleSelect } from "./role-select";
import { EditUserButton } from "./edit-user-button";
import { DeleteUserButton } from "./delete-user-button";
import type { Profile } from "@/lib/db/types";

const PAGE_SIZE = 50;

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

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const currentAdmin = await requireAdmin();
  const allUsers = await getUsers();
  const t = await getTranslations("Admin");

  const { page = "1" } = await searchParams;
  const total = allUsers.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageNum = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const from = (pageNum - 1) * PAGE_SIZE;
  const users = allUsers.slice(from, from + PAGE_SIZE);
  const hrefForPage = (p: number) => `/admin/users?page=${p}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-primary">
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
          <CardTitle>{t("allUsers", { count: total })}</CardTitle>
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
                      <RoleSelect
                        userId={u.id}
                        email={u.email}
                        role={u.role}
                        disabled={isSelf}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <span
                        title={u.is_active ? t("active") : t("locked")}
                        aria-label={u.is_active ? t("active") : t("locked")}
                        className={`inline-block h-2.5 w-2.5 rounded-full ${
                          u.is_active ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <EditUserButton
                          user={{
                            id: u.id,
                            email: u.email,
                            full_name: u.full_name,
                            role: u.role,
                            is_active: u.is_active,
                          }}
                          disabled={isSelf}
                        />
                        <form action={setUserActive}>
                          <input type="hidden" name="user_id" value={u.id} />
                          <input
                            type="hidden"
                            name="active"
                            value={u.is_active ? "false" : "true"}
                          />
                          <button
                            type="submit"
                            disabled={isSelf && u.is_active}
                            aria-label={
                              u.is_active ? t("lockAccount") : t("unlockAccount")
                            }
                            title={
                              u.is_active ? t("lockAccount") : t("unlockAccount")
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-50"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                        </form>
                        <DeleteUserButton
                          userId={u.id}
                          email={u.email}
                          disabled={isSelf}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
