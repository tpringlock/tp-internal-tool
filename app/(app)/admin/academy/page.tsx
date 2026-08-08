import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import type { Course } from "@/lib/db/types";

export default async function AdminAcademyPage() {
  await requireAdmin();
  const supabase = await createClient();
  const t = await getTranslations("AcademyAdmin");

  const { data, count } = await supabase
    .from("courses")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  const courses = (data ?? []) as Course[];
  const total = count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-primary">{t("title")}</h1>
          <p className="text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        <Link href="/admin/academy/new">
          <Button>{t("addCourse")}</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("allCourses", { count: total })}</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          {courses.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">{t("noCourses")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t("courseTitle")}</th>
                  <th className="px-5 py-3 font-medium">{t("category")}</th>
                  <th className="px-5 py-3 font-medium">{t("status")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr
                    key={course.id}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {course.title}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {course.category ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          course.status === "published"
                            ? "rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700"
                            : "rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600"
                        }
                      >
                        {course.status === "published"
                          ? t("published")
                          : t("draft")}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/admin/academy/${course.id}`}>
                        <Button variant="secondary" size="sm">
                          {t("manage")}
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
