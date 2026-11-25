"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, RotateCcw, Trophy, XCircle } from "lucide-react";
import { submitChapterQuiz, type QuizSubmitState } from "@/app/actions/academy";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { fireConfetti } from "@/components/ui/confetti";
import { useActionCall } from "@/components/ui/use-form-action";
import type { QuizQuestionWithOptions } from "@/lib/academy/queries";
import { answersForRetry, quizScorePercent, type QuizGrade } from "@/lib/academy/quiz-grade";
import { cn } from "@/lib/utils";

const linkBase =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const primaryLink = cn(linkBase, "bg-primary text-white hover:bg-primary-hover");
const secondaryLink = cn(
  linkBase,
  "border border-slate-300 bg-white text-slate-900 hover:border-primary hover:bg-primary hover:text-white",
);

/**
 * A single-correct radio quiz, graded on the server. Passing requires every
 * question right (unlimited retries). After a submit the learner sees a result
 * screen: score, which questions were right or wrong (never the correct
 * option), and either "retry the wrong ones" (right answers stay selected) or,
 * on a pass, confetti and a Continue link.
 */
export function QuizForm({
  courseId,
  chapterId,
  questions,
  alreadyPassed,
  continueHref,
  courseHref,
  hasNextChapter,
}: {
  courseId: string;
  chapterId: string;
  questions: QuizQuestionWithOptions[];
  alreadyPassed: boolean;
  continueHref: string;
  courseHref: string;
  hasNextChapter: boolean;
}) {
  const t = useTranslations("Academy");
  const router = useRouter();
  const [state, call, pending] = useActionCall<QuizSubmitState>(submitChapterQuiz, {});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // The result the learner left with "retry": hidden, its wrong questions flagged.
  const [dismissed, setDismissed] = useState<QuizGrade | null>(null);
  // Taking an already passed quiz again, for practice.
  const [practicing, setPracticing] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const grade = state.grade && state.grade !== dismissed ? state.grade : null;
  const flaggedIds = new Set(
    (dismissed?.results ?? []).filter((r) => !r.correct).map((r) => r.questionId),
  );

  useEffect(() => {
    if (!grade) return;
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!grade.passed) return;
    // Refresh so the sidebar / course tree show the pass and the unlock.
    router.refresh();
    return fireConfetti();
  }, [grade, router]);

  const scrollToTop = () =>
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    call(new FormData(event.currentTarget));
  };

  const retry = () => {
    if (!grade) return;
    setAnswers((current) => answersForRetry(current, grade));
    setDismissed(grade);
    scrollToTop();
  };

  const practice = () => {
    setAnswers({});
    setDismissed(state.grade ?? null);
    setPracticing(true);
    scrollToTop();
  };

  let body: React.ReactNode;
  if (grade) {
    body = (
      <QuizResult
        grade={grade}
        questions={questions}
        continueHref={continueHref}
        courseHref={courseHref}
        hasNextChapter={hasNextChapter}
        onRetry={retry}
      />
    );
  } else if (alreadyPassed && !practicing) {
    body = (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Trophy className="h-12 w-12 text-amber-500" aria-hidden />
        <h2 className="text-lg font-semibold text-slate-900">{t("quizAlreadyPassedTitle")}</h2>
        <p className="text-sm text-slate-600">
          {hasNextChapter ? t("quizResultPassedNext") : t("quizResultPassedLast")}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link href={continueHref} className={primaryLink}>
            {hasNextChapter ? t("quizContinue") : t("quizBackToCourse")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Button variant="secondary" onClick={practice}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t("quizPractice")}
          </Button>
        </div>
      </div>
    );
  } else {
    const answered = questions.filter((q) => answers[q.id]).length;
    body = (
      <form onSubmit={onSubmit} className="space-y-6">
        <input type="hidden" name="course_id" value={courseId} />
        <input type="hidden" name="chapter_id" value={chapterId} />

        {practicing && <Alert tone="info">{t("quizPracticeNote")}</Alert>}
        {flaggedIds.size > 0 && (
          <Alert tone="info">{t("quizRetryHint", { count: flaggedIds.size })}</Alert>
        )}
        {state.error && <Alert tone="error">{state.error}</Alert>}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{t("quizAnswered", { answered, total: questions.length })}</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-valuenow={answered}
            aria-label={t("quizAnswered", { answered, total: questions.length })}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${(answered / questions.length) * 100}%` }}
            />
          </div>
        </div>

        {questions.map((q, i) => {
          const flagged = flaggedIds.has(q.id);
          return (
            <fieldset
              key={q.id}
              className={cn(
                "space-y-3",
                flagged && "rounded-lg border border-red-200 bg-red-50/50 p-3 sm:p-4",
              )}
            >
              <legend className="sr-only">
                {i + 1}. {q.prompt}
              </legend>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p
                  aria-hidden
                  className="whitespace-pre-wrap text-sm font-medium text-slate-800"
                >
                  {i + 1}. {q.prompt}
                </p>
                {flagged && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    <XCircle className="h-3.5 w-3.5" aria-hidden />
                    {t("quizWrongLastTime")}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {q.options.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 has-[:checked]:border-primary has-[:checked]:bg-sky-50"
                  >
                    <input
                      type="radio"
                      name={`q_${q.id}`}
                      value={opt.id}
                      required
                      checked={answers[q.id] === opt.id}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt.id }))}
                      className="h-4 w-4 shrink-0 accent-primary"
                    />
                    <span className="whitespace-pre-wrap">{opt.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}

        <Button type="submit" loading={pending} className="w-full sm:w-auto">
          {pending ? t("quizSubmitting") : t("quizSubmit")}
        </Button>
      </form>
    );
  }

  return (
    <div ref={topRef} className="scroll-mt-24">
      {body}
    </div>
  );
}

/** Score, headline, next step, then a right / wrong review of every question. */
function QuizResult({
  grade,
  questions,
  continueHref,
  courseHref,
  hasNextChapter,
  onRetry,
}: {
  grade: QuizGrade;
  questions: QuizQuestionWithOptions[];
  continueHref: string;
  courseHref: string;
  hasNextChapter: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations("Academy");
  const byId = new Map(questions.map((q) => [q.id, q]));
  const wrong = grade.total - grade.correctCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 py-2 text-center" role="status">
        <ScoreRing grade={grade} />
        <h2 className="quiz-pop text-xl font-bold tracking-tight text-slate-900">
          {grade.passed
            ? t("quizResultPassedTitle")
            : t("quizResultFailedTitle", { correct: grade.correctCount, total: grade.total })}
        </h2>
        <p className="max-w-md text-sm text-slate-600">
          {grade.passed
            ? hasNextChapter
              ? t("quizResultPassedNext")
              : t("quizResultPassedLast")
            : t("quizResultFailedText", { wrong, total: grade.total })}
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {grade.passed ? (
            <>
              <Link href={continueHref} className={primaryLink}>
                {hasNextChapter ? t("quizContinue") : t("quizBackToCourse")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              {hasNextChapter && (
                <Link href={courseHref} className={secondaryLink}>
                  {t("quizBackToCourse")}
                </Link>
              )}
            </>
          ) : (
            <>
              <Button onClick={onRetry}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                {t("quizRetryWrong")}
              </Button>
              <Link href={courseHref} className={secondaryLink}>
                {t("quizBackToCourse")}
              </Link>
            </>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">{t("quizReviewHeading")}</h3>
        <ol className="mt-3 space-y-2">
          {grade.results.map((r, i) => {
            const q = byId.get(r.questionId);
            const chosen = q?.options.find((o) => o.id === r.selectedOptionId);
            return (
              <li
                key={r.questionId}
                className={cn(
                  "flex gap-3 rounded-lg border px-3 py-2.5",
                  r.correct ? "border-green-200 bg-green-50/60" : "border-red-200 bg-red-50/60",
                )}
              >
                {r.correct ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="whitespace-pre-wrap break-words text-sm font-medium text-slate-800">
                    <span className="sr-only">
                      {r.correct ? t("quizCorrectBadge") : t("quizWrongBadge")}:{" "}
                    </span>
                    {i + 1}. {q?.prompt}
                  </p>
                  <p
                    className={cn(
                      "whitespace-pre-wrap break-words text-xs",
                      r.correct ? "text-green-800" : "text-red-800",
                    )}
                  >
                    {chosen ? t("quizYourAnswer", { answer: chosen.label }) : t("quizSkipped")}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Circular score that fills up from empty when it appears. */
function ScoreRing({ grade }: { grade: QuizGrade }) {
  const t = useTranslations("Academy");
  const percent = quizScorePercent(grade);
  const offset = RING_LENGTH * (1 - percent / 100);
  const color = grade.passed
    ? "text-green-500"
    : grade.correctCount > 0
      ? "text-amber-500"
      : "text-red-500";

  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={RING_RADIUS} fill="none" strokeWidth="10" className="stroke-slate-100" />
        <circle
          cx="60"
          cy="60"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={offset}
          className={cn("quiz-ring", color)}
          style={{ "--ring-length": `${RING_LENGTH}px` } as React.CSSProperties}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {grade.passed ? (
          <Trophy className="quiz-pop h-7 w-7 text-amber-500" aria-hidden />
        ) : null}
        <span className="text-2xl font-bold tabular-nums text-slate-900">
          {grade.correctCount}/{grade.total}
        </span>
        <span className="text-xs text-slate-500">{t("quizScorePercent", { percent })}</span>
      </div>
    </div>
  );
}
