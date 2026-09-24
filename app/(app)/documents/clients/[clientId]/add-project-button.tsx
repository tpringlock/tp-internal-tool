"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { CreateProjectForm } from "@/app/(app)/admin/projects/project-forms";

/** Round "+" button that opens the create-project form for this customer. */
export function AddProjectButton({
  client,
  label,
}: {
  client: { id: string; name: string };
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
      >
        <Plus className="h-4 w-4" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={label}>
        <CreateProjectForm clients={[client]} />
      </Dialog>
    </>
  );
}
