"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setUserRole } from "@/app/actions/users";
import type { UserRole } from "@/lib/db/types";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const ROLE_KEYS: Record<UserRole, string> = {
  employee: "employee",
  manager: "managerRole",
  admin: "adminRole",
};

/**
 * Role dropdown shown in the Role column. Picking a different role opens a
 * confirmation modal; only on confirm is the change submitted. Cancelling
 * reverts the dropdown to the current role.
 */
export function RoleSelect({
  userId,
  email,
  role,
  disabled,
}: {
  userId: string;
  email: string;
  role: UserRole;
  disabled?: boolean;
}) {
  const t = useTranslations("Admin");
  const [pending, setPending] = useState<UserRole | null>(null);
  const [isSaving, startTransition] = useTransition();

  const confirm = () => {
    if (!pending) return;
    const fd = new FormData();
    fd.set("user_id", userId);
    fd.set("role", pending);
    // revalidatePath in the action refreshes the row with the new role.
    startTransition(async () => {
      await setUserRole({}, fd);
      setPending(null);
    });
  };

  return (
    <>
      <Select
        aria-label={t("role")}
        value={pending ?? role}
        disabled={disabled || isSaving}
        onChange={(e) => {
          const next = e.target.value as UserRole;
          if (next !== role) setPending(next);
        }}
        className="h-8 w-auto py-0"
      >
        <option value="employee">{t("employee")}</option>
        <option value="manager">{t("managerRole")}</option>
        <option value="admin">{t("adminRole")}</option>
      </Select>

      <Dialog
        open={pending !== null}
        onClose={() => {
          if (!isSaving) setPending(null);
        }}
        title={t("changeRoleTitle")}
      >
        <p className="text-sm text-slate-600">
          {t("changeRoleBody", {
            email,
            role: pending ? t(ROLE_KEYS[pending]) : "",
          })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setPending(null)}
            disabled={isSaving}
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            loading={isSaving}
            onClick={confirm}
          >
            {t("confirmRoleChange")}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
