import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FileText, Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import {
  publishCourse,
  deleteCourse,
  deleteCourseFile,
} from "@/app/actions/academy";
import { formatBytes } from "@/lib/format";
import { EditCourseForm, ThumbnailManager } from "../course-forms";
import { AddLessonForm, LessonEditor } from "./lesson-forms";
import { AddChapterForm, ChapterHeader } from "./chapter-forms";
import { QuizManager, type AdminQuizQuestion } from "./quiz-forms";
import { UploadCourseFileForm } from "./course-docs-forms";
import type {
  Course,
  Chapter,
  Lesson,
  LessonFile,
  CourseFile,
} from "@/lib/db/types";

type FileRow = Pick<LessonFile, "id" | "lesson_id" | "file_name" | "file_size">;
type CourseDocRow = Pick<CourseFile, "id" | "file_name" | "file_size">;

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

  // Quiz questions + options grouped by chapter (admins see correct answers).
  const chapterIds = chapters.map((c) => c.id);
  const quizByChapter = new Map<string, AdminQuizQuestion[]>();
  if (chapterIds.length > 0) {
    const { data: questionData } = await supabase
      .from("quiz_questions")
      .select("id, chapter_id, prompt, position")
      .in("chapter_id", chapterIds)
      .order("position", { ascending: true });
    const questions = questionData ?? [];
    const questionIds = questions.map((q) => q.id);

    const optionsByQuestion = new Map<
      string,
      AdminQuizQuestion["options"]
    >();
    if (questionIds.length > 0) {
      const { data: optionData } = await supabase
        .from("quiz_options")
        .select("id, question_id, label, is_correct, position")
        .in("question_id", questionIds)
        .order("position", { ascending: true });
      for (const o of optionData ?? []) {
        const list = optionsByQuestion.get(o.question_id) ?? [];
        list.push({
          id: o.id,
          label: o.label,
          is_correct: o.is_correct,
          position: o.position,
        });
        optionsByQuestion.set(o.question_id, list);
      }
    }
    for (const q of questions) {
      const list = quizByChapter.get(q.chapter_id) ?? [];
      list.push({
        id: q.id,
        prompt: q.prompt,
        position: q.position,
        options: optionsByQuestion.get(q.id) ?? [],
      });
      quizByChapter.set(q.chapter_id, list);
    }
  }

  const { data: courseDocData } = await supabase
    .from("course_files")
    .select("id, file_name, file_size")
    .eq("course_id", id)
    .order("created_at", { ascending: true });
  const courseDocs = (courseDocData ?? []) as CourseDocRow[];

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
                  <div className="border-t border-slate-100 px-5 py-4">
                    <QuizManager
                      courseId={course.id}
                      chapterId={chapter.id}
                      questions={quizByChapter.get(chapter.id) ?? []}
                    />
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

      <Card>
        <CardHeader>
          <CardTitle>{t("courseDocuments")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {courseDocs.length === 0 ? (
            <p className="text-sm text-slate-500">{t("noCourseDocs")}</p>
          ) : (
            <ul className="space-y-2">
              {courseDocs.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {file.file_name}
                    <span className="text-xs text-slate-400">
                      {formatBytes(file.file_size)}
                    </span>
                  </span>
                  <form action={deleteCourseFile}>
                    <input type="hidden" name="id" value={file.id} />
                    <input type="hidden" name="course_id" value={course.id} />
                    <button
                      type="submit"
                      aria-label={t("removeFile")}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <UploadCourseFileForm courseId={course.id} />
        </CardBody>
      </Card>
    </div>
  );
}
