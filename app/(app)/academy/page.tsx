import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { GraduationCap, Search, X } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { canManageContent } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { listPublishedCourses } from "@/lib/academy/queries";
import { DialogButton } from "@/components/dialog-button";
import { CreateCourseForm } from "@/app/(app)/admin/academy/course-forms";
import { ModuleEyebrow, pageTitleClass } from "@/components/page-title";
import { CourseCard } from "./course-card";

/**
 * Course library. Categories are picked in the Academy sidebar (?category=);
 * the title search lives here and keeps the selected category.
 */
export default async function AcademyPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const user = await requireUser();
  const canManage = canManageContent(user.profile.role);
  const { category = "", q = "" } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("Academy");
  const tn = await getTranslations("AcademyNav");

  const courses = await listPublishedCourses(supabase, { category, q });

  const clearHref = (drop: "category" | "q") => {
    const sp = new URLSearchParams();
    if (category && drop !== "category") sp.set("category", category);
    if (q && drop !== "q") sp.set("q", q);
    const qs = sp.toString();
    return qs ? `/academy?${qs}` : "/academy";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <ModuleEyebrow id="academy" />
          <h1 className={pageTitleClass}>{category || t("allCoursesTab")}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t("subtitle")}</p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
          <form method="get" className="relative w-full md:w-80">
            {category && (
              <input type="hidden" name="category" value={category} />
            )}
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              name="q"
              defaultValue={q}
              placeholder={t("searchPlaceholder")}
              aria-label={t("search")}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-primary focus-visible:outline-none"
            />
          </form>
          {canManage && (
            <DialogButton label={t("addCourse")} title={t("addCourseTitle")}>
              <CreateCourseForm />
            </DialogButton>
          )}
        </div>
      </div>

      {(category || q) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">
            {tn("resultCount", { count: courses.length })}
          </span>
          {category && (
            <FilterChip
              href={clearHref("category")}
              label={`${t("category")}: ${category}`}
            />
          )}
          {q && <FilterChip href={clearHref("q")} label={`“${q}”`} />}
        </div>
      )}

      {courses.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-14 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <GraduationCap className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-sm text-slate-500">{t("empty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-medium text-primary hover:bg-primary/10"
    >
      {label}
      <X className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}
