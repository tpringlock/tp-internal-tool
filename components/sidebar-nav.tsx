"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export interface SidebarNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  /** Small secondary line or trailing count. */
  meta?: string;
}

export interface SidebarNavSection {
  title?: string;
  items: SidebarNavItem[];
}

/**
 * Navigation list styled like the Documents customer list: icon tile + label,
 * active item tinted primary. Used by the Academy and Admin sidebars.
 */
export function SidebarNav({
  label,
  sections,
  onNavigate,
}: {
  label: string;
  sections: SidebarNavSection[];
  onNavigate?: () => void;
}) {
  return (
    <nav
      aria-label={label}
      className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-5 pt-1"
    >
      {sections.map((section, i) => (
        <div key={section.title ?? i} className="space-y-1">
          {section.title && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {section.title}
            </p>
          )}
          {section.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                item.active
                  ? "border-primary/30 bg-primary/5 font-semibold text-primary"
                  : "border-transparent font-medium text-slate-700 hover:border-slate-200 hover:bg-slate-50",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg [&>svg]:h-[18px] [&>svg]:w-[18px]",
                  item.active
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-500",
                )}
              >
                {item.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.meta && (
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums",
                    item.active ? "text-primary" : "text-slate-400",
                  )}
                >
                  {item.meta}
                </span>
              )}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
