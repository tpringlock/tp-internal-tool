"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { FormState } from "@/app/actions/auth";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * A button that runs a billing server action on one record (`id`) after a
 * confirmation dialog. The outcome is shown as a toast; the dialog is closed
 * from inside the action wrapper rather than in an effect.
 */
export function ActionButton({
  action,
  id,
  label,
  title,
  body,
  confirmLabel,
  variant = "secondary",
  icon,
  iconOnly = false,
}: {
  action: Action;
  id: string;
  label: string;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  variant?: ButtonProps["variant"];
  icon?: React.ReactNode;
  iconOnly?: boolean;
}) {
  const t = useTranslations("Billing");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      setOpen(false);
      if (result.error) toast(result.error, { tone: "error" });
      if (result.success) toast(result.success, { tone: "success" });
      return result;
    },
    {},
  );

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        className={iconOnly ? "w-8 px-0" : undefined}
      >
        {icon}
        {!iconOnly && label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title}>
        <div className="text-sm text-slate-600">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <form action={formAction}>
            <input type="hidden" name="id" value={id} />
            <Button
              type="submit"
              size="sm"
              variant={variant === "danger" ? "danger" : "primary"}
              loading={pending}
            >
              {confirmLabel}
            </Button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
