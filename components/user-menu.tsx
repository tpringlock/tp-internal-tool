"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/db/types";
import { DropdownMenu, menuItemClass } from "@/components/ui/dropdown-menu";

/**
 * Letter shown in the avatar. Vietnamese names put the given name last
 * ("Bùi Viết Quyền" -> "Q"), so use the first letter of the last word.
 */
export function avatarInitial(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const word = words[words.length - 1] ?? "";
  return (word.charAt(0) || "?").toLocaleUpperCase("vi");
}

/**
 * Header account control: name + email + letter avatar as the trigger (avatar
 * only on small screens); the menu holds the profile link and sign-out.
 */
export function UserMenu({
  fullName,
  email,
  role,
}: {
  fullName: string;
  email: string | null;
  role: UserRole;
}) {
  const t = useTranslations("Nav");
  const roleLabel =
    role === "admin"
      ? t("admin")
      : role === "manager"
        ? t("manager")
        : role === "accountant"
          ? t("accountant")
          : null;

  return (
    <DropdownMenu
      label={t("openUserMenu")}
      align="end"
      triggerClassName="flex items-center gap-3 rounded-xl p-1 text-left transition-colors hover:bg-slate-100 aria-expanded:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:pl-3"
      menuClassName="w-64"
      trigger={(open) => (
        <>
          <span className="hidden min-w-0 text-right sm:block">
            <span className="block max-w-[14rem] truncate text-sm font-semibold text-slate-900">
              {fullName}
            </span>
            {email && (
              <span className="block max-w-[14rem] truncate text-xs text-slate-500">
                {email}
              </span>
            )}
          </span>
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
          >
            {avatarInitial(fullName)}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "hidden h-4 w-4 shrink-0 text-slate-400 transition-transform sm:block",
              open && "rotate-180",
            )}
          />
        </>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white"
            >
              {avatarInitial(fullName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {fullName}
              </p>
              {email && (
                <p className="truncate text-xs text-slate-500">{email}</p>
              )}
              {roleLabel && (
                <span className="mt-1 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                  {roleLabel}
                </span>
              )}
            </div>
          </div>

          <div className="my-1 h-px bg-slate-100" role="separator" />

          <Link
            href="/profile"
            role="menuitem"
            onClick={close}
            className={menuItemClass}
          >
            <UserRound className="h-4 w-4 text-slate-400" aria-hidden />
            {t("profile")}
          </Link>

          <form action={logout}>
            <button
              type="submit"
              role="menuitem"
              className={cn(
                menuItemClass,
                "text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:bg-red-50",
              )}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {t("signOut")}
            </button>
          </form>
        </>
      )}
    </DropdownMenu>
  );
}
