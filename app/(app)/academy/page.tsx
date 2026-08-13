import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/dal";
import { canManageContent } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import {
  listPublishedCourses,
  listPublishedCategories,
} from "@/lib/academy/queries";
import { AddFolderTile } from "@/components/add-folder-tile";
import { CreateCourseForm } from "@/app/(app)/admin/academy/course-forms";
import { AcademyTabs } from "./academy-tabs";
import { CourseCard } from "./course-card";

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

  const [courses, categories] = await Promise.all([
    listPublishedCourses(supabase, { category, q }),
    listPublishedCategories(supabase),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-primary">{t("title")}</h1>
        <p className="text-sm text-slate-500">{t("subtitle")}</p>
      </div>

      <AcademyTabs active="all" />

      <Card>
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="min-w-48 flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                {t("category")}
              </label>
              <Select name="category" defaultValue={category}>
                <option value="">{t("allCategories")}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-48 flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                {t("search")}
              </label>
              <Input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} />
            </div>
            <Button type="submit" variant="secondary">
              {t("filter")}
            </Button>
          </form>
        </CardBody>
      </Card>

      {courses.length === 0 && !canManage ? (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-500">{t("empty")}</p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
          {canManage && (
            <AddFolderTile
              label={t("addCourse")}
              dialogTitle={t("addCourseTitle")}
            >
              <CreateCourseForm />
            </AddFolderTile>
          )}
        </div>
      )}
    </div>
  );
}
