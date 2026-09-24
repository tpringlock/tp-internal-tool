"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Minimal accessible dropdown menu (no Radix dependency), shared by the module
 * switcher and the user menu.
 *
 * - Closes on outside click, Escape (focus returns to the trigger), choosing an
 *   item (call `close` from `children`) and route changes.
 * - Arrow Up/Down, Home and End move focus between `[role="menuitem"]`
 *   elements; opening with the keyboard focuses the first item.
 *
 * Menu items are ordinary links/buttons rendered by the caller with
 * `role="menuitem"`; use `menuItemClass` for consistent styling.
 */
export function DropdownMenu({
  label,
  trigger,
  children,
  align = "start",
  triggerClassName,
  menuClassName,
}: {
  /** Accessible name of the trigger button. */
  label: string;
  trigger: React.ReactNode | ((open: boolean) => React.ReactNode);
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
  triggerClassName?: string;
  menuClassName?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [focusFirst, setFocusFirst] = React.useState(false);
  const [prevPathname, setPrevPathname] = React.useState(pathname);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useId();

  // Close when the route changes (adjusting state during render instead of in
  // an effect, per React's "you might not need an effect" guidance).
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  const close = React.useCallback(() => setOpen(false), []);

  const items = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
        [],
    );

  // Outside click + Escape while open.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Keyboard-opened menus move focus to the first item once rendered.
  React.useEffect(() => {
    if (open && focusFirst) items()[0]?.focus();
  }, [open, focusFirst]);

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setFocusFirst(true);
      setOpen(true);
    }
  };

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (e.key === "ArrowDown") next = (index + 1) % list.length;
    else if (e.key === "ArrowUp")
      next = (index - 1 + list.length) % list.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = list.length - 1;
    else if (e.key === "Tab") setOpen(false);
    if (next !== null) {
      e.preventDefault();
      list[next].focus();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setFocusFirst(false);
          setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKeyDown}
        className={triggerClassName}
      >
        {typeof trigger === "function" ? trigger(open) : trigger}
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute top-full z-40 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/10 menu-pop",
            align === "end" ? "right-0" : "left-0",
            menuClassName,
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

/** Base styling for a `role="menuitem"` row. */
export const menuItemClass =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700 outline-none transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:bg-slate-100";
