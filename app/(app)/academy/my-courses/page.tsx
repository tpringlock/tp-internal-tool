import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody } from "@/components/ui/card";
import { getMyCourses, type MyCourseItem } from "@/lib/academy/queries";
import { AcademyTabs } from "../academy-tabs";
import { CourseCard } from "../course-card";

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
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <h1 className="text-xl font-semibold text-primary">{t("myCourses")}</h1>
        <p className="text-sm text-slate-500">{t("myCoursesSubtitle")}</p>
      </div>

      <AcademyTabs active="mine" />

      <Section title={t("inProgress")} items={inProgress} withProgress />
      <Section title={t("completed")} items={completed} />
    </div>
  );
}
