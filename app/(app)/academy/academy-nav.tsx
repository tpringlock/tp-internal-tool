"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BookMarked,
  GraduationCap,
  Library,
  Settings2,
  Tag,
  TrendingUp,
} from "lucide-react";
import { AsideHeading, WorkspaceAside } from "@/components/workspace-aside";
import { SidebarNav, type SidebarNavSection } from "@/components/sidebar-nav";

export interface AcademyCategory {
  name: string;
  count: number;
}

/** True on /academy/<courseId>/... (course, lesson and quiz pages). */
function isCoursePage(pathname: string): boolean {
  const seg = pathname.split("/").filter(Boolean);
  return seg[0] === "academy" && seg.length >= 2 && seg[1] !== "my-courses";
}

/**
 * TP Academy sidebar: library, the user's courses, categories and (for
 * content managers) a shortcut to course management, plus a progress card.
 */
export function AcademyNav({
  categories,
  totalCourses,
  inProgress,
  completed,
  canManage,
}: {
  categories: AcademyCategory[];
  totalCourses: number;
  inProgress: number;
  completed: number;
  canManage: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("AcademyNav");
  const ta = useTranslations("Academy");

  if (isCoursePage(pathname)) return null;

  const category =
    pathname === "/academy" ? (searchParams.get("category") ?? "") : "";

  const sections: SidebarNavSection[] = [
    {
      title: t("library"),
      items: [
        {
          href: "/academy",
          label: ta("allCoursesTab"),
          icon: <Library aria-hidden />,
          active: pathname === "/academy" && !category,
          meta: String(totalCourses),
        },
        {
          href: "/academy/my-courses",
          label: ta("myCourses"),
          icon: <BookMarked aria-hidden />,
          active: pathname === "/academy/my-courses",
          meta: String(inProgress + completed),
        },
      ],
    },
  ];
  if (categories.length > 0) {
    sections.push({
      title: ta("category"),
      items: categories.map((c) => ({
        href: `/academy?category=${encodeURIComponent(c.name)}`,
        label: c.name,
        icon: <Tag aria-hidden />,
        active: category === c.name,
        meta: String(c.count),
      })),
    });
  }
  if (canManage) {
    sections.push({
      title: t("manage"),
      items: [
        {
          href: "/admin/academy",
          label: t("manageCourses"),
          icon: <Settings2 aria-hidden />,
          active: false,
        },
      ],
    });
  }

  const current =
    sections.flatMap((s) => s.items).find((i) => i.active)?.label ??
    ta("title");

  return (
    <WorkspaceAside
      label={ta("title")}
      current={current}
      icon={<GraduationCap className="h-4 w-4" aria-hidden />}
    >
      {({ close }) => (
        <>
          <AsideHeading
            title={ta("title")}
            subtitle={t("courseCount", { count: totalCourses })}
          />
          <SidebarNav
            label={ta("title")}
            sections={sections}
            onNavigate={close}
          />
          <div className="p-3 pt-0">
            <Link
              href="/academy/my-courses"
              onClick={close}
              className="block rounded-2xl bg-primary p-4 text-white shadow-sm transition-colors hover:bg-primary-hover"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="h-4 w-4" aria-hidden />
                {t("progressTitle")}
              </span>
              <span className="mt-3 grid grid-cols-2 gap-2">
                <span className="rounded-xl bg-white/10 px-3 py-2">
                  <span className="block text-xl font-bold">{inProgress}</span>
                  <span className="block text-xs text-white/80">
                    {ta("inProgress")}
                  </span>
                </span>
                <span className="rounded-xl bg-white/10 px-3 py-2">
                  <span className="block text-xl font-bold">{completed}</span>
                  <span className="block text-xs text-white/80">
                    {ta("completed")}
                  </span>
                </span>
              </span>
            </Link>
          </div>
        </>
      )}
    </WorkspaceAside>
  );
}
