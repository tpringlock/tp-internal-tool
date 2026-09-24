import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody } from "@/components/ui/card";
import { getMyCourses, type MyCourseItem } from "@/lib/academy/queries";
import { CourseCard } from "../course-card";
import { ModuleEyebrow } from "@/components/page-title";

export default async function MyCoursesPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const t = await getTranslations("Academy");

  const { inProgress, completed } = await getMyCourses(supabase, user.id);

  const Section = ({
    title,
    items,
    withProgress,
  }: {
    title: string;
    items: MyCourseItem[];
    withProgress?: boolean;
  }) => (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-slate-900">
        {title}{" "}
        <span className="text-sm font-medium text-slate-400">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-500">
              {t("noneYet")}{" "}
              <Link href="/academy" className="text-primary underline">
                {t("browseCourses")}
              </Link>
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <CourseCard
              key={item.course.id}
              course={item.course}
              progress={
                withProgress
                  ? { done: item.done, total: item.total }
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      <div>
        <ModuleEyebrow id="academy" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t("myCourses")}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t("myCoursesSubtitle")}</p>
      </div>

      <Section title={t("inProgress")} items={inProgress} withProgress />
      <Section title={t("completed")} items={completed} />
    </div>
  );
}
