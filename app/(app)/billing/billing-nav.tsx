"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Calculator,
  CalendarOff,
  FileSpreadsheet,
  FileText,
  History,
  Info,
} from "lucide-react";
import { AsideHeading, WorkspaceAside } from "@/components/workspace-aside";
import { SidebarNav, type SidebarNavSection } from "@/components/sidebar-nav";

/** Billing app sidebar: calculate, history, and the data it runs on. */
export function BillingNav({
  contractCount,
  uploadCount,
  draftCount,
}: {
  contractCount: number;
  uploadCount: number;
  draftCount: number;
}) {
  const pathname = usePathname();
  const t = useTranslations("BillingNav");
  const tm = useTranslations("AppModules");
  const under = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const sections: SidebarNavSection[] = [
    {
      title: t("sectionRent"),
      items: [
        {
          href: "/billing",
          label: t("calculate"),
          icon: <Calculator aria-hidden />,
          active: pathname === "/billing",
        },
        {
          href: "/billing/history",
          label: t("history"),
          icon: <History aria-hidden />,
          active: under("/billing/history") || under("/billing/calculations"),
          meta: draftCount > 0 ? t("drafts", { count: draftCount }) : undefined,
        },
      ],
    },
    {
      title: t("sectionData"),
      items: [
        {
          href: "/billing/uploads",
          label: t("uploads"),
          icon: <FileSpreadsheet aria-hidden />,
          active: under("/billing/uploads"),
          meta: String(uploadCount),
        },
        {
          href: "/billing/contracts",
          label: t("contracts"),
          icon: <FileText aria-hidden />,
          active: under("/billing/contracts"),
          meta: String(contractCount),
        },
        {
          href: "/billing/excluded-ranges",
          label: t("excludedRanges"),
          icon: <CalendarOff aria-hidden />,
          active: under("/billing/excluded-ranges"),
        },
      ],
    },
  ];

  const current =
    sections.flatMap((s) => s.items).find((i) => i.active)?.label ??
    tm("billing.name");

  return (
    <WorkspaceAside
      label={tm("billing.name")}
      current={current}
      icon={<Calculator className="h-4 w-4" aria-hidden />}
    >
      {({ close }) => (
        <>
          <AsideHeading title={tm("billing.name")} subtitle={t("subtitle")} />
          <SidebarNav
            label={tm("billing.name")}
            sections={sections}
            onNavigate={close}
          />
          <div className="p-3 pt-0">
            <div className="flex gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{t("scopeNote")}</p>
            </div>
          </div>
        </>
      )}
    </WorkspaceAside>
  );
}
