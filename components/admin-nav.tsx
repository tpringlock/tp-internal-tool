"use client";

import type { ComponentType } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Users,
  Briefcase,
  FolderKanban,
  GraduationCap,
  Activity,
  FileCode,
  Receipt,
  PanelLeft,
  PanelLeftClose,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/db/types";

type IconType = ComponentType<{ className?: string }>;

const items: {
  href: string;
  key: string;
  adminOnly: boolean;
  Icon: IconType;
}[] = [
  { href: "/admin/users", key: "users", adminOnly: true, Icon: Users },
  { href: "/admin/clients", key: "clients", adminOnly: false, Icon: Briefcase },
  {
    href: "/admin/projects",
    key: "projects",
    adminOnly: false,
    Icon: FolderKanban,
  },
  {
    href: "/admin/academy",
    key: "academy",
    adminOnly: false,
    Icon: GraduationCap,
  },
  { href: "/admin/activity", key: "activity", adminOnly: true, Icon: Activity },
  { href: "/admin/misa", key: "misa", adminOnly: true, Icon: Receipt },
  { href: "/admin/docs", key: "docs", adminOnly: true, Icon: FileCode },
];

const STORAGE_KEY = "admin-nav-collapsed";
const CHANGE_EVENT = "admin-nav-collapsed-change";

// localStorage-backed store read via useSyncExternalStore: this keeps the
// persisted state in sync without a setState-in-effect and lets React reconcile
// the server snapshot (always expanded) with the client value on hydration.
function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getCollapsedSnapshot() {
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

/**
 * Admin section navigation. On `md`+ it's a collapsible sticky left sidebar
 * (icon + label per tab, or a slim icon rail); the open/closed state is
 * remembered in localStorage. Below `md` the sidebar is hidden and replaced by
 * a hamburger button that opens a slide-in drawer with the same links.
 */
export function AdminNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const t = useTranslations("AdminNav");
  const collapsed = useSyncExternalStore(
    subscribe,
    getCollapsedSnapshot,
    () => false, // server + first hydration render: expanded
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggle = () => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "0" : "1");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  // While the drawer is open, close on Escape and lock body scroll.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  const visible = items.filter((item) => role === "admin" || !item.adminOnly);

  const renderLink = (
    item: (typeof items)[number],
    variant: "sidebar" | "drawer",
  ) => {
    const active = pathname.startsWith(item.href);
    const { Icon } = item;
    const sidebarCollapsed = variant === "sidebar" && collapsed;
    return (
      <Link
        key={item.href}
        href={item.href}
        title={sidebarCollapsed ? t(item.key) : undefined}
        onClick={variant === "drawer" ? () => setDrawerOpen(false) : undefined}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          sidebarCollapsed && "justify-center px-0",
          active
            ? "bg-slate-100 text-slate-900"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {!sidebarCollapsed && <span className="truncate">{t(item.key)}</span>}
      </Link>
    );
  };

  return (
    <>
      {/* Desktop: sticky collapsible sidebar (md and up). */}
      <nav
        aria-label={t("menu")}
        className={cn(
          "sticky top-8 hidden h-fit shrink-0 flex-col gap-1 self-start border-r border-slate-200 pr-3 transition-[width] duration-200 md:flex",
          collapsed ? "w-14" : "w-52",
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? t("expand") : t("collapse")}
          title={collapsed ? t("expand") : t("collapse")}
          className="mb-1 flex h-9 w-9 items-center justify-center self-end rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        >
          {collapsed ? (
            <PanelLeft className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>

        {visible.map((item) => renderLink(item, "sidebar"))}
      </nav>

      {/* Mobile: hamburger button that opens a slide-in drawer (below md). */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t("menu")}
          aria-expanded={drawerOpen}
          className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Menu className="h-5 w-5" />
          {t("menu")}
        </button>

        {drawerOpen && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/40"
            onClick={() => setDrawerOpen(false)}
            role="presentation"
          >
            <nav
              aria-label={t("menu")}
              onClick={(e) => e.stopPropagation()}
              className="flex h-full w-64 max-w-[80%] flex-col gap-1 overflow-y-auto border-r border-slate-200 bg-white p-3 shadow-xl"
            >
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t("collapse")}
                className="mb-1 flex h-9 w-9 items-center justify-center self-end rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
              {visible.map((item) => renderLink(item, "drawer"))}
            </nav>
          </div>
        )}
      </div>
    </>
  );
}
