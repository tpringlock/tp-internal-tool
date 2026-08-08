import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Course } from "@/lib/db/types";
import { Card } from "@/components/ui/card";
import { progressPercent } from "@/lib/academy/progress";

/** Course thumbnail with a company-logo fallback when none is set. */
export function CourseThumb({
  course,
}: {
  course: Pick<Course, "id" | "thumbnail_path">;
}) {
  if (course.thumbnail_path) {
    return (
      <div className="aspect-video w-full overflow-hidden bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/academy/thumbnails/${course.id}`}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <div className="flex aspect-video w-full items-center justify-center bg-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-tp.png" alt="" className="h-16 w-16 opacity-50" />
    </div>
  );
}

/**
 * A course card for the library and My Courses grids. Pass `progress`
 * (done/total) to show a progress bar instead of the plain "View Course" CTA.
 */
export async function CourseCard({
  course,
  progress,
}: {
  course: Course;
  progress?: { done: number; total: number };
}) {
  const t = await getTranslations("Academy");
  const pct = progress ? progressPercent(progress.total, progress.done) : null;

  return (
    <Link href={`/academy/${course.id}`} className="group block">
      <Card className="flex h-full flex-col overflow-hidden transition-colors group-hover:border-slate-300">
        <CourseThumb course={course} />
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start gap-2">
            <h3 className="flex-1 text-sm font-semibold text-primary">
              {course.title}
            </h3>
            {course.category && (
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {course.category}
              </span>
            )}
          </div>
          {course.instructor && (
            <p className="text-xs text-slate-500">{course.instructor}</p>
          )}
          {course.description && (
            <p className="line-clamp-2 text-sm text-slate-500">
              {course.description}
            </p>
          )}
          <div className="mt-auto pt-2">
            {pct !== null ? (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  {t("percentComplete", { percent: pct })}
                </p>
              </div>
            ) : (
              <span className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-white group-hover:bg-primary-hover">
                {t("viewCourse")}
              </span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
