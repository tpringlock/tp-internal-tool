"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { setUserRole, setUserActive, deleteUser } from "@/app/actions/users";
import type { FormState } from "@/app/actions/auth";
import type { UserRole } from "@/lib/db/types";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

type EditableUser = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
};

/**
 * Per-row "Edit" button opening a detailed modal: email + full name (read
 * only), role change, lock/unlock, and delete — all wired to the same server
 * actions used by the inline row controls, gathered in one place.
 */
export function EditUserButton({
  user,
  disabled,
}: {
  user: EditableUser;
  disabled?: boolean;
}) {
  const t = useTranslations("Admin");
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [roleState, roleAction, rolePending] = useActionState<
    FormState,
    FormData
  >(setUserRole, {});

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("editUser")}
        title={t("editUser")}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      >
        <Pencil className="h-4 w-4" />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("editUserTitle")}
      >
        <div className="space-y-4">
          <Field label={t("name")}>
            <p className="text-sm text-slate-700">{user.full_name || "—"}</p>
          </Field>

          <Field label={t("colEmail")}>
            <p className="text-sm text-slate-700">{user.email}</p>
          </Field>

          <form action={roleAction} className="space-y-1.5">
            <input type="hidden" name="user_id" value={user.id} />
            <Field label={t("role")}>
              <div className="flex items-center gap-2">
                <Select
                  name="role"
                  defaultValue={user.role}
                  disabled={disabled}
                  className="h-9"
                >
                  <option value="employee">{t("employee")}</option>
                  <option value="manager">{t("managerRole")}</option>
                  <option value="admin">{t("adminRole")}</option>
                </Select>
                <Button
                  type="submit"
                  size="sm"
                  loading={rolePending}
                  disabled={disabled}
                >
                  {t("save")}
                </Button>
              </div>
            </Field>
            {roleState.success && (
              <Alert tone="success">{roleState.success}</Alert>
            )}
          </form>

          <Field label={t("status")}>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 text-sm text-slate-700">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    user.is_active ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                {user.is_active ? t("active") : t("locked")}
              </span>
              <form action={setUserActive}>
                <input type="hidden" name="user_id" value={user.id} />
                <input
                  type="hidden"
                  name="active"
                  value={user.is_active ? "false" : "true"}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={disabled && user.is_active}
                >
                  {user.is_active ? t("lockAccount") : t("unlockAccount")}
                </Button>
              </form>
            </div>
          </Field>

          {!disabled && (
            <div className="border-t border-slate-100 pt-4">
              {!confirmingDelete ? (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmingDelete(true)}
                >
                  {t("deleteAccount")}
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">
                    {t("confirmDeleteUserBody", { email: user.email })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      {t("cancel")}
                    </Button>
                    <form action={deleteUser}>
                      <input type="hidden" name="user_id" value={user.id} />
                      <input type="hidden" name="email" value={user.email} />
                      <Button type="submit" variant="danger" size="sm">
                        {t("confirmDelete")}
                      </Button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
