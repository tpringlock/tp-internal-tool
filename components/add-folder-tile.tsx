"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

/**
 * A dashed, folder-sized grid tile that opens a modal with a create form.
 * Rendered as the last item in the customer / course grids. `children` is the
 * form to show inside the modal (e.g. CreateClientForm, CreateCourseForm).
 */
export function AddFolderTile({
  label,
  dialogTitle,
  children,
}: {
  label: string;
  dialogTitle: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-full min-h-20 w-full items-center justify-center gap-3 rounded-lg border-2 border-dashed border-slate-300 bg-white/40 px-5 py-4 text-slate-500 transition hover:border-primary hover:bg-primary/5 hover:text-primary"
      >
        <Plus className="h-6 w-6" />
        <span className="font-medium">{label}</span>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={dialogTitle}>
        {children}
      </Dialog>
    </>
  );
}
