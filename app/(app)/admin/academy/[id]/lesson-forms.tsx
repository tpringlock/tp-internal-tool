"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, ArrowDown, FileText, Trash2 } from "lucide-react";
import {
  addLesson,
  updateLesson,
  deleteLesson,
  reorderLesson,
  uploadLessonFile,
  deleteLessonFile,
} from "@/app/actions/academy";
import type { FormState } from "@/app/actions/auth";
import type { Lesson, LessonFile } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { formatBytes } from "@/lib/format";

type LessonWithFiles = Lesson & { files: Pick<LessonFile, "id" | "file_name" | "file_size">[] };

export function AddLessonForm({
  courseId,
  chapterId,
}: {
  courseId: string;
  chapterId: string;
}) {
  const t = useTranslations("AcademyAdmin");
  const [state, action, pending] = useActionState<FormState, FormData>(
    addLesson,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="chapter_id" value={chapterId} />
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field label={t("lessonTitle")} error={state.fieldErrors?.title?.[0]}>
        <Input name="title" required />
      </Field>
      <Field
        label={t("videoUrl")}
        error={state.fieldErrors?.video_url?.[0]}
        hint={t("videoUrlHint")}
      >
        <Input name="video_url" placeholder="https://youtube.com/watch?v=…" />
      </Field>
      <Field label={t("lessonDescription")} error={state.fieldErrors?.description?.[0]}>
        <Textarea name="description" rows={3} />
      </Field>
      <Button type="submit" loading={pending}>
        {pending ? t("saving") : t("addLesson")}
      </Button>
    </form>
  );
}

export function LessonEditor({
  courseId,
  lesson,
  isFirst,
  isLast,
}: {
  courseId: string;
  lesson: LessonWithFiles;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("AcademyAdmin");
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2 px-5 py-3">
        <div className="flex flex-col">
          <form action={reorderLesson}>
            <input type="hidden" name="id" value={lesson.id} />
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
          <form action={reorderLesson}>
            <input type="hidden" name="id" value={lesson.id} />
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
        <span className="flex-1 text-sm font-medium text-slate-900">
          {lesson.title}
          {lesson.video_provider && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500">
              {lesson.video_provider}
            </span>
          )}
        </span>
        <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? t("close") : t("edit")}
        </Button>
      </div>

      {open && (
        <div className="space-y-5 border-t border-slate-50 bg-slate-50/50 px-5 py-4">
          <EditLessonForm courseId={courseId} lesson={lesson} />

          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-700">{t("attachments")}</h4>
            {lesson.files.length === 0 ? (
              <p className="text-sm text-slate-500">{t("noFiles")}</p>
            ) : (
              <ul className="space-y-2">
                {lesson.files.map((file) => (
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
                    <form action={deleteLessonFile}>
                      <input type="hidden" name="id" value={file.id} />
                      <input type="hidden" name="course_id" value={courseId} />
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
            <UploadFileForm courseId={courseId} lessonId={lesson.id} />
          </div>

          <form action={deleteLesson}>
            <input type="hidden" name="id" value={lesson.id} />
            <input type="hidden" name="course_id" value={courseId} />
            <Button type="submit" variant="danger" size="sm">
              {t("deleteLesson")}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

function EditLessonForm({
  courseId,
  lesson,
}: {
  courseId: string;
  lesson: LessonWithFiles;
}) {
  const t = useTranslations("AcademyAdmin");
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateLesson,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={lesson.id} />
      <input type="hidden" name="course_id" value={courseId} />
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field label={t("lessonTitle")} error={state.fieldErrors?.title?.[0]}>
        <Input name="title" defaultValue={lesson.title} required />
      </Field>
      <Field
        label={t("videoUrl")}
        error={state.fieldErrors?.video_url?.[0]}
        hint={t("videoUrlHint")}
      >
        <Input name="video_url" defaultValue={lesson.video_url ?? ""} />
      </Field>
      <Field label={t("lessonDescription")} error={state.fieldErrors?.description?.[0]}>
        <Textarea name="description" rows={3} defaultValue={lesson.description ?? ""} />
      </Field>
      <Button type="submit" size="sm" loading={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}

function UploadFileForm({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
  const t = useTranslations("AcademyAdmin");
  const [state, action, pending] = useActionState<FormState, FormData>(
    uploadLessonFile,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="lesson_id" value={lessonId} />
      <div className="flex-1">
        <Field label={t("addPdf")} error={state.fieldErrors?.file?.[0]} hint={t("pdfHint")}>
          <input
            type="file"
            name="file"
            accept="application/pdf"
            required
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-50"
          />
        </Field>
      </div>
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        {pending ? t("uploading") : t("upload")}
      </Button>
      {state.error && (
        <div className="w-full">
          <Alert tone="error">{state.error}</Alert>
        </div>
      )}
    </form>
  );
}
