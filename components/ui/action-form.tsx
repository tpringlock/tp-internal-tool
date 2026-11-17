"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { BaseFormState } from "@/lib/forms/run-form-action";
import { useFormAction } from "./use-form-action";
import { useToast } from "./toast";

/** A server action bound to a one-button form: `(formData) => void`, or a FormState. */
export type OneShotAction = (formData: FormData) => Promise<void | BaseFormState>;

type ActionFormProps = Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & {
  action: OneShotAction;
};

/**
 * `<form action={serverAction}>` for forms that are only a button (reorder,
 * delete, toggle, log out), usable from server and client components:
 *
 *   <ActionForm action={reorderChapter}> …hidden inputs, button… </ActionForm>
 *
 * It goes through useFormAction, so a failed request (offline, dropped
 * connection, server error) shows a toast and leaves the page as it was,
 * instead of replacing it with the error boundary. A redirect from the
 * action still navigates. While the action runs the form is `aria-busy` and
 * further submits are ignored.
 */
export function ActionForm({ action, children, ...rest }: ActionFormProps) {
  const { toast } = useToast();
  const t = useTranslations("Errors");
  const run = React.useCallback(
    async (_prev: BaseFormState, formData: FormData): Promise<BaseFormState> =>
      (await action(formData)) ?? {},
    [action],
  );
  const [, formProps, pending] = useFormAction<BaseFormState>(run, {}, {
    failureMessages: { offline: t("offlineAction"), failed: t("actionFailedShort") },
    // Inside the action: the form may be gone once the page is revalidated.
    onResult: (result) => {
      if (result.error) toast(result.error, { tone: "error" });
      else if (result.success) toast(result.success, { tone: "success" });
    },
  });
  return (
    <form {...rest} {...formProps} aria-busy={pending || undefined}>
      {children}
    </form>
  );
}
