"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowUp, ArrowDown, Trash2, Plus, X } from "lucide-react";
import {
  addQuizQuestion,
  updateQuizQuestion,
  deleteQuizQuestion,
  reorderQuizQuestion,
} from "@/app/actions/academy";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export type AdminQuizOption = {
  id: string;
  label: string;
  is_correct: boolean;
  position: number;
};
export type AdminQuizQuestion = {
  id: string;
  prompt: string;
  position: number;
  options: AdminQuizOption[];
};

const MAX_OPTIONS = 6;

/** Shared add/edit form for a single-correct question with dynamic options. */
function QuizQuestionForm({
  courseId,
  chapterId,
  question,
  onSaved,
}: {
  courseId: string;
  chapterId?: string;
  question?: AdminQuizQuestion;
  onSaved?: () => void;
}) {
  const t = useTranslations("AcademyAdmin");
  const router = useRouter();
  const isEdit = Boolean(question);
  const [state, action, pending] = useActionState<FormState, FormData>(
    isEdit ? updateQuizQuestion : addQuizQuestion,
    {},
  );
  const [options, setOptions] = useState<string[]>(
    question ? question.options.map((o) => o.label) : ["", ""],
  );
  const [correctIndex, setCorrectIndex] = useState<number>(
    question
      ? Math.max(
          0,
          question.options.findIndex((o) => o.is_correct),
        )
      : 0,
  );

  useEffect(() => {
    // On success the parent collapses this form (unmounting it), so no local
    // reset is needed; refresh so the saved question shows in the list.
    if (!state.success) return;
    onSaved?.();
    router.refresh();
  }, [state.success, onSaved, router]);

  const setOption = (i: number, value: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));

  const addOption = () =>
    setOptions((prev) =>
      prev.length >= MAX_OPTIONS ? prev : [...prev, ""],
    );

  const removeOption = (i: number) =>
    setOptions((prev) => {
      if (prev.length <= 2) return prev;
      const next = prev.filter((_, idx) => idx !== i);
      setCorrectIndex((ci) => (ci === i ? 0 : ci > i ? ci - 1 : ci));
      return next;
    });

  return (
    <form action={action} className="space-y-3">
      {isEdit ? (
        <input type="hidden" name="id" value={question!.id} />
      ) : (
        <input type="hidden" name="chapter_id" value={chapterId} />
      )}
      <input type="hidden" name="course_id" value={courseId} />

      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <Field label={t("quizPrompt")} error={state.fieldErrors?.prompt?.[0]}>
        <Input name="prompt" defaultValue={question?.prompt ?? ""} required />
      </Field>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-600">{t("quizOptions")}</p>
        {state.fieldErrors?.options?.[0] && (
          <p className="text-xs text-red-600">{state.fieldErrors.options[0]}</p>
        )}
        {state.fieldErrors?.correct_index?.[0] && (
          <p className="text-xs text-red-600">
            {state.fieldErrors.correct_index[0]}
          </p>
        )}
        {options.map((value, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="correct_index"
              value={i}
              checked={correctIndex === i}
              onChange={() => setCorrectIndex(i)}
              aria-label={t("quizMarkCorrect")}
              className="h-4 w-4 shrink-0 accent-primary"
            />
            <Input
              name="option"
              value={value}
              onChange={(e) => setOption(i, e.target.value)}
              placeholder={t("quizOptionPlaceholder", { n: i + 1 })}
              required
            />
            <button
              type="button"
              onClick={() => removeOption(i)}
              disabled={options.length <= 2}
              aria-label={t("quizRemoveOption")}
              className="text-slate-400 hover:text-red-600 disabled:opacity-30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {options.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={addOption}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <Plus className="h-3.5 w-3.5" /> {t("quizAddOption")}
          </button>
        )}
      </div>

      <Button type="submit" size="sm" loading={pending}>
        {pending ? t("saving") : isEdit ? t("save") : t("quizAddQuestion")}
      </Button>
    </form>
  );
}

/** One existing question row: prompt + options, with reorder/edit/delete. */
function QuizQuestionRow({
  courseId,
  chapterId,
  question,
  index,
  isFirst,
  isLast,
}: {
  courseId: string;
  chapterId: string;
  question: AdminQuizQuestion;
  index: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("AcademyAdmin");
  const [editing, setEditing] = useState(false);

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-col">
          <form action={reorderQuizQuestion}>
            <input type="hidden" name="id" value={question.id} />
            <input type="hidden" name="chapter_id" value={chapterId} />
            <input type="hidden" name="course_id" value={courseId} />
            <input type="hidden" name="direction" value="up" />
            <button
              type="submit"
              disabled={isFirst}
              aria-label={t("moveUp")}
              className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
          <form action={reorderQuizQuestion}>
            <input type="hidden" name="id" value={question.id} />
            <input type="hidden" name="chapter_id" value={chapterId} />
            <input type="hidden" name="course_id" value={courseId} />
            <input type="hidden" name="direction" value="down" />
            <button
              type="submit"
              disabled={isLast}
              aria-label={t("moveDown")}
              className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          </form>
        </div>

        <div className="flex-1">
          <p className="text-sm font-medium text-slate-800">
            {index + 1}. {question.prompt}
          </p>
          <ul className="mt-1.5 space-y-1">
            {question.options.map((o) => (
              <li
                key={o.id}
                className={
                  o.is_correct
                    ? "text-sm font-medium text-primary"
                    : "text-sm text-slate-600"
                }
              >
                {o.is_correct ? "✓ " : "• "}
                {o.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? t("close") : t("edit")}
          </Button>
          <form action={deleteQuizQuestion}>
            <input type="hidden" name="id" value={question.id} />
            <input type="hidden" name="course_id" value={courseId} />
            <button
              type="submit"
              aria-label={t("quizDeleteQuestion")}
              className="text-slate-400 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {editing && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <QuizQuestionForm
            courseId={courseId}
            question={question}
            onSaved={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  );
}

/** Quiz section for one chapter: existing questions + an add-question form. */
export function QuizManager({
  courseId,
  chapterId,
  questions,
}: {
  courseId: string;
  chapterId: string;
  questions: AdminQuizQuestion[];
}) {
  const t = useTranslations("AcademyAdmin");
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">
          {t("quizHeading", { count: questions.length })}
        </p>
        {!adding && (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            {t("quizAddQuestion")}
          </Button>
        )}
      </div>

      {questions.length > 0 && (
        <div className="space-y-2">
          {questions.map((q, i) => (
            <QuizQuestionRow
              key={q.id}
              courseId={courseId}
              chapterId={chapterId}
              question={q}
              index={i}
              isFirst={i === 0}
              isLast={i === questions.length - 1}
            />
          ))}
        </div>
      )}

      {adding && (
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <QuizQuestionForm
            courseId={courseId}
            chapterId={chapterId}
            onSaved={() => setAdding(false)}
          />
        </div>
      )}
    </div>
  );
}
