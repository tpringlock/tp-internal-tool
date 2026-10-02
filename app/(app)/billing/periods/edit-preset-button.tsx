"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PresetForm, type PresetFormValue } from "./preset-form";

/** Pencil button opening the preset form in a modal (admin). */
export function EditPresetButton({ preset, exampleMonth }: { preset: PresetFormValue; exampleMonth: string }) {
  const t = useTranslations("BillingPresets");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={t("edit")}
        title={t("edit")}
        className="w-8 px-0"
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("edit")}>
        <PresetForm preset={preset} exampleMonth={exampleMonth} />
      </Dialog>
    </>
  );
}
