"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/db/types";

const items = [
  { href: "/admin/users", key: "users", adminOnly: true },
  { href: "/admin/clients", key: "clients", adminOnly: false },
  { href: "/admin/projects", key: "projects", adminOnly: false },
  { href: "/admin/academy", key: "academy", adminOnly: false },
  { href: "/admin/activity", key: "activity", adminOnly: true },
] as const;

export function AdminNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const t = useTranslations("AdminNav");
  const visible = items.filter((item) => role === "admin" || !item.adminOnly);

  return (
    <nav className="flex gap-1 border-b border-slate-200 pb-2">
      {visible.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-slate-100 text-slate-900"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
