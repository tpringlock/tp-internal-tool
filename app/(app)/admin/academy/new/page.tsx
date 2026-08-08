import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/dal";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateCourseForm } from "../course-forms";

export default async function NewCoursePage() {
  await requireAdmin();
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
        <h1 className="mt-2 text-xl font-semibold text-primary">
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
