"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Activity,
  Briefcase,
  FileCode,
  FolderKanban,
  GraduationCap,
  Receipt,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { UserRole } from "@/lib/db/types";
import { AsideHeading, WorkspaceAside } from "@/components/workspace-aside";
import { SidebarNav, type SidebarNavSection } from "@/components/sidebar-nav";

type Key =
  "clients" | "projects" | "misa" | "courses" | "users" | "activity" | "docs";

const SECTIONS: {
  title: "sectionData" | "sectionTraining" | "sectionSystem";
  items: { href: string; key: Key; adminOnly: boolean; Icon: typeof Users }[];
}[] = [
  {
    title: "sectionData",
    items: [
      {
        href: "/admin/clients",
        key: "clients",
        adminOnly: false,
        Icon: Briefcase,
      },
      {
        href: "/admin/projects",
        key: "projects",
        adminOnly: false,
        Icon: FolderKanban,
      },
      { href: "/admin/misa", key: "misa", adminOnly: false, Icon: Receipt },
    ],
  },
  {
    title: "sectionTraining",
    items: [
      {
        href: "/admin/academy",
        key: "courses",
        adminOnly: false,
        Icon: GraduationCap,
      },
    ],
  },
  {
    title: "sectionSystem",
    items: [
      { href: "/admin/users", key: "users", adminOnly: true, Icon: Users },
      {
        href: "/admin/activity",
        key: "activity",
        adminOnly: true,
        Icon: Activity,
      },
      { href: "/admin/docs", key: "docs", adminOnly: true, Icon: FileCode },
    ],
  },
];

/**
 * Admin Panel sidebar, in the shared WorkspaceAside shell. Admin-only
 * sections are hidden from managers here; the pages and actions enforce it
 * server-side (requireAdmin).
 */
export function AdminNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const t = useTranslations("AdminNav");
  const tn = useTranslations("Nav");
  const tm = useTranslations("AppModules");

  const sections: SidebarNavSection[] = SECTIONS.map((section) => ({
    title: t(section.title),
    items: section.items
      .filter((item) => role === "admin" || !item.adminOnly)
      .map(({ href, key, Icon }) => ({
        href,
        label: t(key),
        icon: <Icon aria-hidden />,
        active: pathname === href || pathname.startsWith(href + "/"),
      })),
  })).filter((section) => section.items.length > 0);

  const current =
    sections.flatMap((s) => s.items).find((i) => i.active)?.label ??
    tm("admin.name");

  return (
    <WorkspaceAside
      label={tm("admin.name")}
      current={current}
      icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
    >
      {() => (
        <>
          <AsideHeading
            title={tm("admin.name")}
            subtitle={t("signedInAs", {
              role: role === "admin" ? tn("admin") : tn("manager"),
            })}
          />
          <SidebarNav label={t("menu")} sections={sections} />
        </>
      )}
    </WorkspaceAside>
  );
}
