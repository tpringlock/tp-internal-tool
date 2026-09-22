"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/misa", key: "dashboard" },
  { href: "/admin/misa/customers", key: "customers" },
  { href: "/admin/misa/products", key: "products" },
  { href: "/admin/misa/inventory", key: "inventory" },
] as const;

/** Section tabs shown across all MISA pages. */
export function MisaTabs() {
  const pathname = usePathname();
  const t = useTranslations("MisaData");

  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              active
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-slate-900",
            )}
          >
            {t(`tabs.${tab.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
