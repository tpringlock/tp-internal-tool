"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import {
  addChapter,
  updateChapter,
  deleteChapter,
  reorderChapter,
} from "@/app/actions/academy";
import type { FormState } from "@/app/actions/auth";
import type { Chapter } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function AddChapterForm({ courseId }: { courseId: string }) {
  const t = useTranslations("AcademyAdmin");
  const [state, action, pending] = useActionState<FormState, FormData>(
    addChapter,
    {},
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="course_id" value={courseId} />
      <div className="flex-1">
        <Field label={t("chapterTitle")} error={state.fieldErrors?.title?.[0]}>
          <Input name="title" required />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("addChapter")}
      </Button>
    </form>
  );
}

/** Chapter title with rename toggle + reorder + delete controls. */
export function ChapterHeader({
  courseId,
  chapter,
  isFirst,
  isLast,
}: {
  courseId: string;
  chapter: Chapter;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("AcademyAdmin");
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateChapter,
    {},
  );

  if (editing) {
    return (
      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={chapter.id} />
        <input type="hidden" name="course_id" value={courseId} />
        {state.error && <Alert tone="error">{state.error}</Alert>}
        <Field label={t("chapterTitle")} error={state.fieldErrors?.title?.[0]}>
          <Input name="title" defaultValue={chapter.title} required />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
          >
            {state.success ? t("done") : t("cancel")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col">
        <form action={reorderChapter}>
          <input type="hidden" name="id" value={chapter.id} />
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
        <form action={reorderChapter}>
          <input type="hidden" name="id" value={chapter.id} />
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
      <h3 className="flex-1 text-sm font-semibold text-slate-800">
        {chapter.title}
      </h3>
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
        {t("rename")}
      </Button>
      <form action={deleteChapter}>
        <input type="hidden" name="id" value={chapter.id} />
        <input type="hidden" name="course_id" value={courseId} />
        <button
          type="submit"
          aria-label={t("deleteChapter")}
          className="text-slate-400 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
