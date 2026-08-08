"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin/users", key: "users" },
  { href: "/admin/clients", key: "clients" },
  { href: "/admin/projects", key: "projects" },
  { href: "/admin/academy", key: "academy" },
  { href: "/admin/activity", key: "activity" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const t = useTranslations("AdminNav");

  return (
    <nav className="flex gap-1 border-b border-slate-200 pb-2">
      {items.map((item) => {
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
