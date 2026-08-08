"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { submitChapterQuiz } from "@/app/actions/academy";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { QuizQuestionWithOptions } from "@/lib/academy/queries";

/**
 * Renders a single-correct radio quiz and submits it for server-side grading.
 * Passing requires every question correct (unlimited retries). Once passed
 * (either previously or just now), inputs lock and a Continue link appears.
 */
export function QuizForm({
  courseId,
  chapterId,
  questions,
  alreadyPassed,
  continueHref,
}: {
  courseId: string;
  chapterId: string;
  questions: QuizQuestionWithOptions[];
  alreadyPassed: boolean;
  continueHref: string;
}) {
  const t = useTranslations("Academy");
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(
    submitChapterQuiz,
    {},
  );
  const passed = alreadyPassed || Boolean(state.success);

  useEffect(() => {
    // Refresh so the sidebar/course tree reflects the new pass + unlock.
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="chapter_id" value={chapterId} />

      {passed && <Alert tone="success">{t("quizPassedBanner")}</Alert>}
      {!passed && state.error && <Alert tone="error">{state.error}</Alert>}

      {questions.map((q, i) => (
        <fieldset key={q.id} className="space-y-3">
          <legend className="text-sm font-medium text-slate-800">
            {i + 1}. {q.prompt}
          </legend>
          <div className="space-y-2">
            {q.options.map((opt) => (
              <label
                key={opt.id}
                className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="radio"
                  name={`q_${q.id}`}
                  value={opt.id}
                  required
                  disabled={passed}
                  className="h-4 w-4 accent-primary"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {passed ? (
        <Link
          href={continueHref}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
        >
          {t("quizContinue")}
        </Link>
      ) : (
        <Button type="submit" disabled={pending}>
          {pending ? t("quizSubmitting") : t("quizSubmit")}
        </Button>
      )}
    </form>
  );
}
