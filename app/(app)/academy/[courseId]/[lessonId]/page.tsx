import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Check,
  Lock,
  HelpCircle,
} from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PdfFrame } from "@/components/ui/pdf-frame";
import { DownloadLink } from "@/components/ui/download-link";
import { cn } from "@/lib/utils";
import { parseVideoUrl } from "@/lib/academy/video";
import {
  getCourseTree,
  getCompletedLessonIds,
  getPassedChapterIds,
  getCourseFiles,
  getLessonNote,
} from "@/lib/academy/queries";
import { chapterUnlockFlags } from "@/lib/academy/progress";
import { toggleLessonComplete } from "@/app/actions/academy";
import { formatBytes } from "@/lib/format";
import type { Lesson, LessonFile } from "@/lib/db/types";
import { CourseContentPanel } from "../course-content-panel";
import { LessonNotes } from "./notes";

/** A checkbox-styled submit button toggling lesson completion (no client JS). */
function CompleteCheckbox({
  courseId,
  lessonId,
  done,
  ariaLabel,
}: {
  courseId: string;
  lessonId: string;
  done: boolean;
  ariaLabel: string;
}) {
  return (
    <form action={toggleLessonComplete} className="flex">
      <input type="hidden" name="lesson_id" value={lessonId} />
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="complete" value={done ? "false" : "true"} />
      <button
        type="submit"
        aria-label={ariaLabel}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
          done
            ? "border-primary bg-primary text-white"
            : "border-slate-300 bg-white hover:border-primary",
        )}
      >
        {done && <Check className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </form>
  );
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const user = await requireUser();
  const { courseId, lessonId } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Academy");

  const tree = await getCourseTree(supabase, courseId);
  if (!tree) notFound();
  const { course, chapters, orderedLessons } = tree;

  // Which chapter holds each lesson, and the current lesson's chapter.
  const chapterIndexByLesson = new Map<string, number>();
  chapters.forEach((ch, i) =>
    ch.lessons.forEach((l) => chapterIndexByLesson.set(l.id, i)),
  );
  const currentChapterIndex = chapterIndexByLesson.get(lessonId);
  if (currentChapterIndex === undefined) notFound();

  const [completedIds, passedIds, courseFiles] = await Promise.all([
    getCompletedLessonIds(supabase, user.id, courseId),
    getPassedChapterIds(supabase, user.id, courseId),
    getCourseFiles(supabase, courseId),
  ]);
  const unlockFlags = chapterUnlockFlags(chapters, completedIds, passedIds);

  // Server-side gating: a locked chapter's lessons are not reachable by URL.
  if (!unlockFlags[currentChapterIndex]) {
    redirect(`/academy/${courseId}`);
  }

  const note = await getLessonNote(supabase, user.id, lessonId);

  // Full lesson row (video + description) and its PDFs.
  const { data: lesson } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .single<Lesson>();
  if (!lesson) notFound();

  const { data: fileData } = await supabase
    .from("lesson_files")
    .select("id, file_name, file_size")
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: true });
  const files = (fileData ?? []) as Pick<
    LessonFile,
    "id" | "file_name" | "file_size"
  >[];

  const isSelfHostedVideo =
    lesson.video_provider === "self_hosted" && Boolean(lesson.video_storage_path);
  const video =
    !isSelfHostedVideo && lesson.video_url
      ? parseVideoUrl(lesson.video_url)
      : null;

  const isDone = completedIds.has(lessonId);
  const doneCount = orderedLessons.filter((l) => completedIds.has(l.id)).length;
  const total = orderedLessons.length;

  const currentIndex = orderedLessons.findIndex((l) => l.id === lessonId);
  const prev = currentIndex > 0 ? orderedLessons[currentIndex - 1] : null;
  const nextLesson =
    currentIndex >= 0 && currentIndex < orderedLessons.length - 1
      ? orderedLessons[currentIndex + 1]
      : null;
  const nextUnlocked = nextLesson
    ? unlockFlags[chapterIndexByLesson.get(nextLesson.id) ?? 0]
    : false;

  const completedLabel = t("completedLabel");
  const markComplete = t("markComplete");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/academy/${courseId}`}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← {course.title}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* Main column: video + details */}
        <div className="space-y-6 lg:col-span-2">
          {(isSelfHostedVideo || video) && (
            <Card>
              <CardBody className="p-0">
                <div className="aspect-video w-full overflow-hidden rounded-lg">
                  {isSelfHostedVideo ? (
                    <video
                      controls
                      preload="metadata"
                      className="h-full w-full bg-black"
                      src={`/api/academy/videos/${lessonId}`}
                    />
                  ) : (
                    <iframe
                      src={video!.embedUrl}
                      title={lesson.title}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                      allowFullScreen
                      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                    />
                  )}
                </div>
              </CardBody>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold text-primary">{lesson.title}</h1>
            <div className="flex items-center gap-2">
              <CompleteCheckbox
                courseId={courseId}
                lessonId={lessonId}
                done={isDone}
                ariaLabel={isDone ? completedLabel : markComplete}
              />
              <span className="text-sm text-slate-600">
                {isDone ? completedLabel : markComplete}
              </span>
            </div>
          </div>

          {lesson.description && (
            <Card>
              <CardBody>
                <p className="whitespace-pre-line text-sm text-slate-600">
                  {lesson.description}
                </p>
              </CardBody>
            </Card>
          )}

          {files.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("attachments")}</CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                {files.map((file) => (
                  <div key={file.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <FileText
                          className="h-4 w-4 shrink-0 text-primary"
                          aria-hidden
                        />
                        <span className="font-medium">{file.file_name}</span>
                        <span className="text-xs text-slate-400">
                          {formatBytes(file.file_size)}
                        </span>
                      </div>
                      <DownloadLink
                        href={`/api/academy/files/${file.id}?dl=1`}
                        className="text-sm font-medium text-slate-700 underline hover:text-slate-900"
                      >
                        {t("download")}
                      </DownloadLink>
                    </div>
                    <PdfFrame
                      src={`/api/academy/files/${file.id}`}
                      title={file.file_name}
                      className="h-[600px] w-full rounded-md border border-slate-200"
                    />
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <LessonNotes
            courseId={courseId}
            lessonId={lessonId}
            initialContent={note}
          />

          <div className="flex items-center justify-between">
            {prev ? (
              <Link
                href={`/academy/${courseId}/${prev.id}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-slate-900"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                {t("previous")}
              </Link>
            ) : (
              <span />
            )}
            {nextLesson && nextUnlocked ? (
              <Link
                href={`/academy/${courseId}/${nextLesson.id}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-slate-900"
              >
                {t("next")}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : nextLesson ? (
              <span
                title={t("lockedHint")}
                className="inline-flex cursor-not-allowed items-center gap-1 text-sm font-medium text-slate-300"
              >
                {t("next")}
                <Lock className="h-3.5 w-3.5" aria-hidden />
              </span>
            ) : (
              <span />
            )}
          </div>
        </div>

        {/* Right column: course content / documents toggle */}
        <aside className="lg:sticky lg:top-6">
          <CourseContentPanel
            documents={courseFiles}
            contentMeta={t("lessonsDone", { done: doneCount, total })}
            bodyClassName="max-h-[70vh] overflow-y-auto p-0"
          >
            {chapters.map((chapter, ci) => {
              const unlocked = unlockFlags[ci];
              const chapterLessonsDone = chapter.lessons.every((l) =>
                completedIds.has(l.id),
              );
              const quizPassed = passedIds.has(chapter.id);
              const quizAvailable = unlocked && chapterLessonsDone;
              return (
                <div
                  key={chapter.id}
                  className="border-b border-slate-100 last:border-0"
                >
                  <div className="flex items-center justify-between gap-2 px-4 py-3">
                    <span className="text-sm font-medium text-slate-800">
                      {chapter.title}
                    </span>
                    {!unlocked && (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                    )}
                  </div>
                  <ul className="space-y-0.5 px-2 pb-2">
                    {chapter.lessons.map((l) => {
                      const done = completedIds.has(l.id);
                      const current = l.id === lessonId;
                      if (!unlocked) {
                        return (
                          <li
                            key={l.id}
                            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-400"
                          >
                            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span className="line-clamp-1">{l.title}</span>
                          </li>
                        );
                      }
                      return (
                        <li
                          key={l.id}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5",
                            current && "bg-primary/10",
                          )}
                        >
                          <CompleteCheckbox
                            courseId={courseId}
                            lessonId={l.id}
                            done={done}
                            ariaLabel={done ? completedLabel : markComplete}
                          />
                          <Link
                            href={`/academy/${courseId}/${l.id}`}
                            className={cn(
                              "line-clamp-1 flex-1 text-sm",
                              current
                                ? "font-medium text-primary"
                                : "text-slate-700 hover:text-slate-900",
                            )}
                          >
                            {l.title}
                          </Link>
                        </li>
                      );
                    })}
                    {chapter.hasQuiz &&
                      (quizAvailable ? (
                        <li>
                          <Link
                            href={`/academy/${courseId}/quiz/${chapter.id}`}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                              quizPassed
                                ? "font-medium text-primary"
                                : "text-slate-700 hover:text-slate-900",
                            )}
                          >
                            {quizPassed ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                            ) : (
                              <HelpCircle className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                            )}
                            <span className="line-clamp-1">
                              {quizPassed
                                ? t("quizPassedLabel")
                                : t("quizTakeLabel")}
                            </span>
                          </Link>
                        </li>
                      ) : (
                        <li className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-400">
                          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span className="line-clamp-1">{t("quizLabel")}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              );
            })}
          </CourseContentPanel>
        </aside>
      </div>
    </div>
  );
}
