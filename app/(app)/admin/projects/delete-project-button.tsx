"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { deleteProject } from "@/app/actions/projects";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/use-form-action";

/**
 * Delete control for a project row: danger button + confirmation dialog, shown
 * to admins only (RLS keeps deletion admin-only regardless). Deleting a
 * project that still has documents is blocked by the DB and surfaced as a
 * toast; member assignments cascade away with the project.
 */
export function DeleteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const t = useTranslations("Admin");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [, formProps, pending] = useFormAction<FormState>(deleteProject, {}, {
    // Runs inside the action, before the revalidated page removes this
    // component, so the toast is not lost with it (an effect on `state`
    // never ran once the row or page was gone).
    onResult: (result) => {
      if (result.success || result.error) setOpen(false);
      if (result.success) toast(result.success, { tone: "success" });
      if (result.error) toast(result.error, { tone: "error" });
    },
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("deleteProject")}
        title={t("deleteProject")}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
      >
        <X className="h-4 w-4" />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("deleteProject")}
      >
        <p className="text-sm text-slate-600">
          {t("confirmDeleteProjectBody", { name: projectName })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <form {...formProps}>
            <input type="hidden" name="id" value={projectId} />
            <input type="hidden" name="name" value={projectName} />
            <Button variant="danger" size="sm" type="submit" loading={pending}>
              {t("confirmDelete")}
            </Button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
