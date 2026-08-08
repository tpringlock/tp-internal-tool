import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCourseTree,
  getCompletedLessonIds,
  getPassedChapterIds,
  getChapterQuiz,
} from "@/lib/academy/queries";
import { chapterUnlockFlags } from "@/lib/academy/progress";
import { QuizForm } from "./quiz-form";

export default async function ChapterQuizPage({
  params,
}: {
  params: Promise<{ courseId: string; chapterId: string }>;
}) {
  const user = await requireUser();
  const { courseId, chapterId } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Academy");

  const tree = await getCourseTree(supabase, courseId);
  if (!tree) notFound();
  const { course, chapters } = tree;

  const chapterIndex = chapters.findIndex((c) => c.id === chapterId);
  if (chapterIndex === -1) notFound();
  const chapter = chapters[chapterIndex];

  const [completedIds, passedIds] = await Promise.all([
    getCompletedLessonIds(supabase, user.id, courseId),
    getPassedChapterIds(supabase, user.id, courseId),
  ]);
  const unlockFlags = chapterUnlockFlags(chapters, completedIds, passedIds);

  // The chapter must be reachable, and all its lessons finished, before the quiz
  // can be taken — send stragglers back to the course overview.
  const lessonsDone = chapter.lessons.every((l) => completedIds.has(l.id));
  if (!unlockFlags[chapterIndex] || !lessonsDone) {
    redirect(`/academy/${courseId}`);
  }

  const questions = await getChapterQuiz(supabase, chapterId);
  if (questions.length === 0) notFound();

  // Where "Continue" goes after passing: the next chapter's first lesson, or the
  // course overview if this is the last chapter.
  const nextChapter = chapters[chapterIndex + 1];
  const nextFirstLesson = nextChapter?.lessons[0];
  const continueHref = nextFirstLesson
    ? `/academy/${courseId}/${nextFirstLesson.id}`
    : `/academy/${courseId}`;

  const alreadyPassed = passedIds.has(chapterId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/academy/${courseId}`}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← {course.title}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("quizTitle", { chapter: chapter.title })}</CardTitle>
          <p className="mt-1 text-xs text-slate-500">{t("quizIntro")}</p>
        </CardHeader>
        <CardBody>
          <QuizForm
            courseId={courseId}
            chapterId={chapterId}
            questions={questions}
            alreadyPassed={alreadyPassed}
            continueHref={continueHref}
          />
        </CardBody>
      </Card>
    </div>
  );
}
