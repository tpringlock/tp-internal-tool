"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useToastHost } from "@/components/ui/toast";

/** What to focus when the dialog opens: a form field first, else a button. */
const FIELD_SELECTOR =
  "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])";
const BUTTON_SELECTOR = "button:not([disabled]), a[href]";

/**
 * Modal dialog matching the custom Tailwind kit, built on the native
 * `<dialog>` element (no Radix dependency). `showModal()` gives the focus
 * trap, makes the rest of the page inert and puts the dialog in the top
 * layer; this component adds what the platform leaves to the author:
 *
 * - initial focus on the first form field, or on the first button of the body
 *   when there is none (the "Cancel" of a confirmation, never the destructive
 *   action), instead of the header's close button;
 * - focus goes back to the element that opened it;
 * - Escape and a click on the backdrop call `onClose` (state stays with the
 *   parent, as before);
 * - body scroll is locked while open.
 *
 * Rendered only while `open`, so the content (and any form state in it) is
 * mounted fresh each time, exactly like the previous implementation.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations("Common");
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  // A press that starts inside the panel and ends on the backdrop (dragging a
  // text selection out of an input) must not close the dialog.
  const pressedBackdrop = React.useRef(false);
  const titleId = React.useId();
  const registerToastHost = useToastHost();

  React.useEffect(() => {
    const el = dialogRef.current;
    if (!open || !el) return;

    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!el.open) el.showModal();

    const body = bodyRef.current;
    const first =
      body?.querySelector<HTMLElement>(FIELD_SELECTOR) ??
      body?.querySelector<HTMLElement>(BUTTON_SELECTOR) ??
      closeRef.current;
    first?.focus();

    // Toasts live outside the dialog and would be inert and under the
    // backdrop; host them inside the dialog while it is open.
    const releaseToastHost = registerToastHost(el);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      releaseToastHost();
      document.body.style.overflow = prevOverflow;
      if (el.open) el.close();
      // The opener may be gone (e.g. the deleted row's button).
      if (opener?.isConnected) opener.focus();
    };
  }, [open, registerToastHost]);

  if (!open) return null;

  const isBackdrop = (e: React.MouseEvent) =>
    e.target === e.currentTarget ||
    (e.target instanceof HTMLElement && e.target.dataset.dialogBackdrop === "");

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      // Escape: keep the element open and let the parent's state close it.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // The browser closed it anyway (e.g. a second Escape): sync the state.
      onClose={onClose}
      onMouseDown={(e) => {
        pressedBackdrop.current = isBackdrop(e);
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && isBackdrop(e)) onClose();
        pressedBackdrop.current = false;
      }}
      // Full-viewport scroll container (transparent); the visible panel is
      // the inner box, so tall content scrolls like the previous overlay.
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto bg-transparent p-4 text-foreground backdrop:bg-slate-900/40"
    >
      <div
        data-dialog-backdrop=""
        className="flex min-h-full items-start justify-center sm:items-center"
      >
        <div
          className={cn(
            "my-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl",
            className,
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 id={titleId} className="text-base font-bold text-slate-900">
              {title}
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={t("dismiss")}
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div ref={bodyRef} className="px-5 py-4">
            {children}
          </div>
        </div>
      </div>
    </dialog>
  );
}
