"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

/**
 * Primary header action ("+ Thêm …") that opens its form in a modal, so list
 * pages lead with the list instead of an always-open create form.
 */
export function DialogButton({
  label,
  title,
  children,
}: {
  label: string;
  /** Dialog heading; defaults to the button label. */
  title?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover"
      >
        <Plus className="h-4 w-4" aria-hidden />
        {label}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title ?? label}>
        {children}
      </Dialog>
    </>
  );
}
