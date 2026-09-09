"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "error" | "success" | "info";

export interface ToastItem {
  id: string;
  message: string;
  tone: Tone;
}

const TOAST_DURATION = 5000;
const MAX_TOASTS = 5;

// Same palette as Alert, so toasts read as the floating variant of it.
const tones: Record<Tone, string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  success: "border-green-200 bg-green-50 text-green-800",
  info: "border-slate-200 bg-slate-50 text-slate-700",
};

/** Append a toast, dropping the oldest past the cap. Exported for tests. */
export function addToast(
  list: ToastItem[],
  item: ToastItem,
  max = MAX_TOASTS,
): ToastItem[] {
  const next = [...list, item];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Remove a toast by id; a no-op when absent. Exported for tests. */
export function removeToast(list: ToastItem[], id: string): ToastItem[] {
  return list.filter((t) => t.id !== id);
}

const ToastContext = React.createContext<{
  toast: (message: string, opts?: { tone?: Tone; duration?: number }) => void;
} | null>(null);

/** Fire a screen notification: `toast(message, { tone: "error" })`. */
export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/**
 * Surface a server-action FormState as a toast. Depends on the state object
 * itself: useActionState returns a fresh object per action, so submitting the
 * same failing form twice re-fires the toast.
 */
export function useFormStateToast(state: { error?: string; success?: string }) {
  const { toast } = useToast();
  React.useEffect(() => {
    if (state.error) toast(state.error, { tone: "error" });
  }, [state, toast]);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const timers = React.useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );

  const dismiss = React.useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((list) => removeToast(list, id));
  }, []);

  const toast = React.useCallback(
    (message: string, opts?: { tone?: Tone; duration?: number }) => {
      const id = crypto.randomUUID();
      setToasts((list) =>
        addToast(list, { id, message, tone: opts?.tone ?? "info" }),
      );
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), opts?.duration ?? TOAST_DURATION),
      );
    },
    [dismiss],
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
    };
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  const t = useTranslations("Common");
  return (
    // z-[60] keeps toasts above Dialog's z-50 overlay.
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role={item.tone === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm shadow-lg",
            tones[item.tone],
          )}
        >
          <span className="flex-1">{item.message}</span>
          <button
            type="button"
            aria-label={t("dismiss")}
            onClick={() => onDismiss(item.id)}
            className="shrink-0 opacity-60 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
