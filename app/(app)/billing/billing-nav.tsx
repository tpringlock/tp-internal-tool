"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Calculator,
  CalendarOff,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  History,
  Info,
} from "lucide-react";
import { setShowDemo } from "@/app/actions/billing";
import { cn } from "@/lib/utils";
import { AsideHeading, WorkspaceAside } from "@/components/workspace-aside";
import { SidebarNav, type SidebarNavSection } from "@/components/sidebar-nav";

/** Billing app sidebar: calculate, history, and the data it runs on. */
export function BillingNav({
  contractCount,
  uploadCount,
  draftCount,
  showDemo,
  isAdmin,
}: {
  contractCount: number;
  uploadCount: number;
  draftCount: number;
  showDemo: boolean;
  isAdmin: boolean;
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
  if (isAdmin) {
    sections.push({
      title: t("sectionAdmin"),
      items: [
        {
          href: "/billing/compare",
          label: t("compare"),
          icon: <FileCheck2 aria-hidden />,
          active: under("/billing/compare"),
        },
      ],
    });
  }

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
          <form action={setShowDemo} className="px-3 pb-3">
            <input type="hidden" name="show" value={showDemo ? "0" : "1"} />
            <button
              type="submit"
              role="switch"
              aria-checked={showDemo}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                showDemo
                  ? "border-red-300 bg-red-50 text-red-800"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              <span className="min-w-0">
                <span className="block font-medium">{t("showDemo")}</span>
                <span className="block text-xs opacity-80">{t("showDemoHint")}</span>
              </span>
              <span
                aria-hidden
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  showDemo ? "bg-red-500" : "bg-slate-300",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                    showDemo ? "left-[1.125rem]" : "left-0.5",
                  )}
                />
              </span>
            </button>
          </form>
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
