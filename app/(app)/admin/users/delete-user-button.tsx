"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { deleteUser } from "@/app/actions/users";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * Delete control for a user row: a danger button that opens a confirmation
 * dialog before submitting the irreversible `deleteUser` server action. The
 * admin's own row passes `disabled` so they cannot delete themselves.
 */
export function DeleteUserButton({
  userId,
  email,
  disabled,
}: {
  userId: string;
  email: string;
  disabled?: boolean;
}) {
  const t = useTranslations("Admin");
  const [open, setOpen] = useState(false);

  if (disabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("deleteAccount")}
        title={t("deleteAccount")}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
      >
        <X className="h-4 w-4" />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("confirmDeleteTitle")}
      >
        <p className="text-sm text-slate-600">
          {t("confirmDeleteUserBody", { email })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <form action={deleteUser}>
            <input type="hidden" name="user_id" value={userId} />
            <input type="hidden" name="email" value={email} />
            <Button variant="danger" size="sm" type="submit">
              {t("confirmDelete")}
            </Button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
