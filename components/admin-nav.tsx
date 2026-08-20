"use client";

import type { ComponentType } from "react";
import { useSyncExternalStore } from "react";
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
  PanelLeft,
  PanelLeftClose,
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
 * Collapsible left sidebar for the /admin/* section. Expanded it shows an
 * icon + label per tab; collapsed it becomes a slim icon rail. The open/closed
 * state is remembered in localStorage across reloads.
 */
export function AdminNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const t = useTranslations("AdminNav");
  const collapsed = useSyncExternalStore(
    subscribe,
    getCollapsedSnapshot,
    () => false, // server + first hydration render: expanded
  );

  const toggle = () => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "0" : "1");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  const visible = items.filter((item) => role === "admin" || !item.adminOnly);

  return (
    <nav
      aria-label={t("menu")}
      className={cn(
        "sticky top-8 flex h-fit shrink-0 flex-col gap-1 self-start border-r border-slate-200 pr-3 transition-[width] duration-200",
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

      {visible.map((item) => {
        const active = pathname.startsWith(item.href);
        const { Icon } = item;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? t(item.key) : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              collapsed && "justify-center px-0",
              active
                ? "bg-slate-100 text-slate-900"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="truncate">{t(item.key)}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
