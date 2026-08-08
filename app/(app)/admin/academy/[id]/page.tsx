import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { publishCourse, deleteCourse } from "@/app/actions/academy";
import { EditCourseForm, ThumbnailManager } from "../course-forms";
import { AddLessonForm, LessonEditor } from "./lesson-forms";
import { AddChapterForm, ChapterHeader } from "./chapter-forms";
import type { Course, Chapter, Lesson, LessonFile } from "@/lib/db/types";

type FileRow = Pick<LessonFile, "id" | "lesson_id" | "file_name" | "file_size">;

export default async function AdminCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("AcademyAdmin");

  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("id", id)
    .single<Course>();
  if (!course) notFound();

  const { data: chapterData } = await supabase
    .from("chapters")
    .select("*")
    .eq("course_id", id)
    .order("position", { ascending: true });
  const chapters = (chapterData ?? []) as Chapter[];

  const { data: lessonData } = await supabase
    .from("lessons")
    .select("*")
    .eq("course_id", id)
    .order("position", { ascending: true });
  const lessons = (lessonData ?? []) as Lesson[];

  const lessonIds = lessons.map((l) => l.id);
  let files: FileRow[] = [];
  if (lessonIds.length > 0) {
    const { data: fileData } = await supabase
      .from("lesson_files")
      .select("id, lesson_id, file_name, file_size")
      .in("lesson_id", lessonIds)
      .order("created_at", { ascending: true });
    files = (fileData ?? []) as FileRow[];
  }
  const filesByLesson = new Map<string, FileRow[]>();
  for (const file of files) {
    const list = filesByLesson.get(file.lesson_id) ?? [];
    list.push(file);
    filesByLesson.set(file.lesson_id, list);
  }
  const lessonsByChapter = new Map<string, Lesson[]>();
  for (const lesson of lessons) {
    const list = lessonsByChapter.get(lesson.chapter_id) ?? [];
    list.push(lesson);
    lessonsByChapter.set(lesson.chapter_id, list);
  }

  const published = course.status === "published";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/academy"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← {t("backToCourses")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-primary">{course.title}</h1>
            <span
              className={
                published
                  ? "rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700"
                  : "rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600"
              }
            >
              {published ? t("published") : t("draft")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <form action={publishCourse}>
              <input type="hidden" name="id" value={course.id} />
              <input type="hidden" name="publish" value={published ? "false" : "true"} />
              <Button type="submit" variant={published ? "secondary" : "primary"} size="sm">
                {published ? t("unpublish") : t("publish")}
              </Button>
            </form>
            <form action={deleteCourse}>
              <input type="hidden" name="id" value={course.id} />
              <Button type="submit" variant="danger" size="sm">
                {t("deleteCourse")}
              </Button>
            </form>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("courseDetails")}</CardTitle>
        </CardHeader>
        <CardBody>
          <EditCourseForm course={course} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("thumbnail")}</CardTitle>
        </CardHeader>
        <CardBody>
          <ThumbnailManager course={course} />
        </CardBody>
      </Card>

      <div>
        <h2 className="mb-3 text-base font-semibold text-slate-800">
          {t("chaptersHeading", { count: chapters.length })}
        </h2>

        {chapters.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-sm text-slate-500">{t("noChapters")}</p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-4">
            {chapters.map((chapter, ci) => {
              const chapterLessons = lessonsByChapter.get(chapter.id) ?? [];
              return (
                <Card key={chapter.id}>
                  <CardHeader>
                    <ChapterHeader
                      courseId={course.id}
                      chapter={chapter}
                      isFirst={ci === 0}
                      isLast={ci === chapters.length - 1}
                    />
                  </CardHeader>
                  <CardBody className="p-0">
                    {chapterLessons.length === 0 ? (
                      <p className="px-5 py-4 text-sm text-slate-500">
                        {t("noLessons")}
                      </p>
                    ) : (
                      chapterLessons.map((lesson, li) => (
                        <LessonEditor
                          key={lesson.id}
                          courseId={course.id}
                          lesson={{
                            ...lesson,
                            files: filesByLesson.get(lesson.id) ?? [],
                          }}
                          isFirst={li === 0}
                          isLast={li === chapterLessons.length - 1}
                        />
                      ))
                    )}
                  </CardBody>
                  <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4">
                    <p className="mb-3 text-sm font-medium text-slate-700">
                      {t("addLesson")}
                    </p>
                    <AddLessonForm courseId={course.id} chapterId={chapter.id} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("addChapter")}</CardTitle>
        </CardHeader>
        <CardBody>
          <AddChapterForm courseId={course.id} />
        </CardBody>
      </Card>
    </div>
  );
}
