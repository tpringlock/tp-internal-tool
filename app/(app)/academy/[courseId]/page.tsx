import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  PlayCircle,
  BookOpen,
  FileText,
  Layers,
  HelpCircle,
  Check,
  Lock,
} from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getCourseTree,
  getEnrollment,
  getCompletedLessonIds,
  getPassedChapterIds,
  getCourseFiles,
} from "@/lib/academy/queries";
import { progressPercent, chapterUnlockFlags } from "@/lib/academy/progress";
import { enrollAndStart } from "@/app/actions/academy";
import { formatDateTime } from "@/lib/format";
import { CourseThumb } from "../course-card";
import { CourseContentPanel } from "./course-content-panel";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const user = await requireUser();
  const { courseId } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Academy");

  const tree = await getCourseTree(supabase, courseId);
  if (!tree) notFound();
  const { course, chapters, counts, orderedLessons } = tree;

  const [enrollment, completedIds, passedIds, courseFiles] = await Promise.all([
    getEnrollment(supabase, user.id, courseId),
    getCompletedLessonIds(supabase, user.id, courseId),
    getPassedChapterIds(supabase, user.id, courseId),
    getCourseFiles(supabase, courseId),
  ]);
  const unlockFlags = chapterUnlockFlags(chapters, completedIds, passedIds);

  const doneCount = orderedLessons.filter((l) => completedIds.has(l.id)).length;
  const pct = progressPercent(counts.lessons, doneCount);
  const firstLesson = orderedLessons[0] ?? null;
  const cta = enrollment ? t("continueLearning") : t("startLearning");

  const meta = [
    course.instructor ? t("instructorBy", { name: course.instructor }) : null,
    t("chaptersLessonsCount", {
      chapters: counts.chapters,
      lessons: counts.lessons,
    }),
    t("lastUpdated", { date: formatDateTime(course.updated_at) }),
  ]
    .filter(Boolean)
    .join("   ·   ");

  return (
    <div className="space-y-6">
      {/* Signature-blue hero — full content width (cancels the layout's px-4/py-8). */}
      <div className="-mx-4 -mt-12 bg-linear-to-br from-primary to-primary-hover px-4 py-12 text-white sm:px-8 sm:py-14">
        <div className="mx-auto max-w-6xl">
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
            {course.title}
          </h1>
          <p className="mt-4 text-sm text-white/85">{meta}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          <CourseContentPanel
            documents={courseFiles}
            contentMeta={t("chaptersLessonsCount", {
              chapters: counts.chapters,
              lessons: counts.lessons,
            })}
            bodyClassName="p-0"
          >
            {chapters.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">
                {t("noLessons")}
              </p>
            ) : (
              chapters.map((chapter, ci) => {
                const unlocked = unlockFlags[ci];
                const chapterLessonsDone = chapter.lessons.every((l) =>
                  completedIds.has(l.id),
                );
                const quizPassed = passedIds.has(chapter.id);
                const quizAvailable = unlocked && chapterLessonsDone;
                return (
                  <details
                    key={chapter.id}
                    open={ci === 0}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <summary className="flex cursor-pointer items-center justify-between px-5 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50">
                      <span>{chapter.title}</span>
                      <span className="text-xs font-normal text-slate-400">
                        {t("lessonCount", { count: chapter.lessons.length })}
                      </span>
                    </summary>
                    <ul className="space-y-1 bg-slate-50/50 px-3 pb-3 pt-1">
                      {chapter.lessons.map((lesson) => (
                        <li key={lesson.id}>
                          <Link
                            href={`/academy/${courseId}/${lesson.id}`}
                            className="flex items-center gap-3 rounded-md px-4 py-2.5 text-sm hover:bg-white"
                          >
                            <PlayCircle
                              className={
                                completedIds.has(lesson.id)
                                  ? "h-4 w-4 shrink-0 text-primary"
                                  : "h-4 w-4 shrink-0 text-slate-300"
                              }
                              aria-hidden
                            />
                            <span className="text-slate-700">
                              {lesson.title}
                            </span>
                          </Link>
                        </li>
                      ))}
                      {chapter.hasQuiz && (
                        <li>
                          {quizAvailable ? (
                            <Link
                              href={`/academy/${courseId}/quiz/${chapter.id}`}
                              className="flex items-center gap-3 rounded-md px-4 py-2.5 text-sm hover:bg-white"
                            >
                              {quizPassed ? (
                                <Check
                                  className="h-4 w-4 shrink-0 text-primary"
                                  aria-hidden
                                />
                              ) : (
                                <HelpCircle
                                  className="h-4 w-4 shrink-0 text-slate-400"
                                  aria-hidden
                                />
                              )}
                              <span
                                className={cn(
                                  quizPassed
                                    ? "font-medium text-primary"
                                    : "text-slate-700",
                                )}
                              >
                                {quizPassed
                                  ? t("quizPassedLabel")
                                  : t("quizTakeLabel")}
                              </span>
                            </Link>
                          ) : (
                            <div className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-400">
                              <Lock className="h-4 w-4 shrink-0" aria-hidden />
                              <span>{t("quizLabel")}</span>
                            </div>
                          )}
                        </li>
                      )}
                    </ul>
                  </details>
                );
              })
            )}
          </CourseContentPanel>

          {course.description && (
            <Card>
              <CardHeader>
                <CardTitle>{t("description")}</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm text-slate-600">
                  {course.description}
                </p>
              </CardBody>
            </Card>
          )}
        </div>

        {/* Sticky aside */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <Card className="overflow-hidden">
            <CourseThumb course={course} />
            <CardBody className="space-y-4">
              {enrollment && (
                <div className="space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    {t("lessonsDone", {
                      done: doneCount,
                      total: counts.lessons,
                    })}
                  </p>
                </div>
              )}

              <form action={enrollAndStart}>
                <input type="hidden" name="course_id" value={course.id} />
                {firstLesson && (
                  <input
                    type="hidden"
                    name="first_lesson_id"
                    value={firstLesson.id}
                  />
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!firstLesson}
                >
                  {cta}
                </Button>
              </form>

              <div className="space-y-2 border-t border-slate-100 pt-4">
                <p className="text-sm font-medium text-slate-800">
                  {t("thisCourseIncludes")}
                </p>
                <ul className="space-y-1.5 text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-slate-400" aria-hidden />
                    {t("includesChapters", { count: counts.chapters })}
                  </li>
                  <li className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-slate-400" aria-hidden />
                    {t("includesLessons", { count: counts.lessons })}
                  </li>
                  <li className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-400" aria-hidden />
                    {t("includesPdfs", { count: counts.pdfs })}
                  </li>
                </ul>
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
