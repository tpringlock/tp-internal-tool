"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2, X } from "lucide-react";
import { deleteDocument } from "@/app/actions/documents";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/use-form-action";

/**
 * Delete control for a document row on the project manage page: danger button
 * + confirmation dialog, shown to admins only (RLS keeps deletion admin-only
 * regardless). Removes the row, its share links (DB cascade) and the stored
 * PDF.
 */
export function DeleteDocumentButton({
  documentId,
  documentName,
  variant = "outline",
}: {
  documentId: string;
  documentName: string;
  /** "outline": bordered X (admin tables); "ghost": red trash icon (workspace). */
  variant?: "outline" | "ghost";
}) {
  const t = useTranslations("Admin");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [, formProps, pending] = useFormAction<FormState>(deleteDocument, {}, {
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
        aria-label={t("deleteDocument")}
        title={t("deleteDocument")}
        className={
          variant === "ghost"
            ? "inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
            : "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
        }
      >
        {variant === "ghost" ? (
          <Trash2 className="h-[18px] w-[18px]" />
        ) : (
          <X className="h-4 w-4" />
        )}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("deleteDocument")}
      >
        <p className="text-sm text-slate-600">
          {t("confirmDeleteDocumentBody", { name: documentName })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <form {...formProps}>
            <input type="hidden" name="id" value={documentId} />
            <Button variant="danger" size="sm" type="submit" loading={pending}>
              {t("confirmDelete")}
            </Button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
