"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Left column shared by every module workspace (Documents, Academy, Admin):
 * a sticky full-height sidebar on `lg`+, and below that a bar showing where
 * the user is that opens the same content in a slide-in drawer.
 *
 * `children` renders the panel content; `close` dismisses the drawer (no-op
 * on desktop) and should be passed to links whose target only differs by
 * query string, since those don't change the pathname.
 */
export function WorkspaceAside({
  label,
  current,
  icon,
  widthClass = "w-72",
  children,
}: {
  /** Accessible name + small caption on the mobile bar. */
  label: string;
  /** What the mobile bar shows as the current location. */
  current: string;
  icon: React.ReactNode;
  widthClass?: string;
  children: (ctx: { close: () => void; inDrawer: boolean }) => React.ReactNode;
}) {
  const t = useTranslations("DocWorkspace");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const location = `${pathname}?${searchParams.toString()}`;
  const [open, setOpen] = useState(false);
  const [prevLocation, setPrevLocation] = useState(location);

  // Close the drawer after navigating (state adjusted during render).
  if (location !== prevLocation) {
    setPrevLocation(location);
    setOpen(false);
  }

  // While the drawer is open: Escape closes it and the page behind is locked.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const noop = () => {};

  return (
    <>
      <aside
        aria-label={label}
        className={cn(
          "sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex",
          widthClass,
        )}
      >
        {children({ close: noop, inDrawer: false })}
      </aside>

      <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm hover:border-slate-300"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {label}
            </span>
            <span className="block truncate text-sm font-medium text-slate-900">
              {current}
            </span>
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-slate-400"
            aria-hidden
          />
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 lg:hidden"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onClick={(e) => e.stopPropagation()}
            className="drawer-in relative flex h-full w-80 max-w-[85%] flex-col bg-white shadow-xl"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("close")}
              className="absolute right-3 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
            {children({ close: () => setOpen(false), inDrawer: true })}
          </div>
        </div>
      )}
    </>
  );
}

/** Caption block at the top of a workspace sidebar ("KHÁCH HÀNG / 4 khách hàng"). */
export function AsideHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5 pr-14 lg:pr-5">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          {title}
        </p>
        {subtitle && (
          <p className="mt-0.5 truncate text-sm text-slate-600">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}
