"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Calculator,
  Check,
  ChevronDown,
  FolderOpen,
  GraduationCap,
  LayoutGrid,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getActiveModuleId,
  type AppModuleId,
  type AppModuleLink,
} from "@/lib/app-modules";
import { DropdownMenu, menuItemClass } from "@/components/ui/dropdown-menu";

const ICONS: Record<AppModuleId, LucideIcon> = {
  documents: FolderOpen,
  academy: GraduationCap,
  billing: Calculator,
  admin: ShieldCheck,
};

/**
 * Header control for moving between the apps in this project. The list comes
 * from the server (getModulesForRole), so it only ever contains modules the
 * user may open; the active one is derived from the pathname.
 */
export function ModuleSwitcher({ modules }: { modules: AppModuleLink[] }) {
  const pathname = usePathname();
  const t = useTranslations("AppModules");
  const activeId = getActiveModuleId(pathname);
  const active = modules.find((m) => m.id === activeId);
  const ActiveIcon = active ? ICONS[active.id] : LayoutGrid;
  const activeLabel = active ? t(`${active.id}.name`) : t("apps");

  // A single module needs no menu: show where the user is and stop there.
  if (modules.length <= 1) {
    return (
      <span className="flex items-center gap-2 px-2 text-sm font-medium text-slate-700">
        <ActiveIcon className="h-4 w-4 text-primary" aria-hidden />
        <span className="hidden sm:inline">{activeLabel}</span>
      </span>
    );
  }

  return (
    <DropdownMenu
      label={t("switch")}
      triggerClassName="flex h-9 items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 aria-expanded:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-2.5"
      menuClassName="w-80 max-sm:fixed max-sm:inset-x-4 max-sm:top-[4.5rem] max-sm:mt-0 max-sm:w-auto"
      trigger={(open) => (
        <>
          <ActiveIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="hidden max-w-[12rem] truncate sm:inline">
            {activeLabel}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-slate-400 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </>
      )}
    >
      {(close) => (
        <>
          <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t("apps")}
          </p>
          {modules.map((m) => {
            const Icon = ICONS[m.id];
            const isActive = m.id === activeId;
            return (
              <Link
                key={m.id}
                href={m.href}
                role="menuitem"
                aria-current={isActive ? "page" : undefined}
                onClick={close}
                className={cn(
                  menuItemClass,
                  "items-start py-2.5",
                  isActive && "bg-primary/5 hover:bg-primary/10",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    isActive
                      ? "bg-primary text-white"
                      : "bg-slate-100 text-slate-500",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block font-medium",
                      isActive ? "text-primary" : "text-slate-900",
                    )}
                  >
                    {t(`${m.id}.name`)}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {t(`${m.id}.description`)}
                  </span>
                </span>
                {isActive && (
                  <Check
                    className="mt-1.5 h-4 w-4 shrink-0 text-primary"
                    aria-hidden
                  />
                )}
              </Link>
            );
          })}
        </>
      )}
    </DropdownMenu>
  );
}
