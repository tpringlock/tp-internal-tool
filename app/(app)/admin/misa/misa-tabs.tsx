"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { segmentedTabClass, segmentedTabsClass } from "@/components/page-title";

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
    <nav className={segmentedTabsClass}>
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={segmentedTabClass(active)}
          >
            {t(`tabs.${tab.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
