import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireContentManager } from "@/lib/auth/dal";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateCourseForm } from "../course-forms";
import { ModuleEyebrow } from "@/components/page-title";

export default async function NewCoursePage() {
  await requireContentManager();
  const t = await getTranslations("AcademyAdmin");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/academy"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← {t("backToCourses")}
        </Link>
        <ModuleEyebrow id="admin" className="mt-2" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {t("newCourse")}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("courseDetails")}</CardTitle>
        </CardHeader>
        <CardBody>
          <CreateCourseForm />
        </CardBody>
      </Card>
    </div>
  );
}
