"use client";

import { useActionState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import {
  createCourse,
  updateCourse,
  uploadCourseThumbnail,
  removeCourseThumbnail,
} from "@/app/actions/academy";
import type { FormState } from "@/app/actions/auth";
import type { Course } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

/** Shared title/category/description fields for create + edit. */
function CourseFields({
  t,
  state,
  course,
}: {
  t: (key: string) => string;
  state: FormState;
  course?: Course;
}) {
  return (
    <>
      <Field label={t("courseTitle")} htmlFor="title" error={state.fieldErrors?.title?.[0]}>
        <Input id="title" name="title" defaultValue={course?.title} required />
      </Field>
      <Field
        label={t("category")}
        htmlFor="category"
        error={state.fieldErrors?.category?.[0]}
        hint={t("categoryHint")}
      >
        <Input
          id="category"
          name="category"
          defaultValue={course?.category ?? ""}
        />
      </Field>
      <Field
        label={t("instructor")}
        htmlFor="instructor"
        error={state.fieldErrors?.instructor?.[0]}
        hint={t("instructorHint")}
      >
        <Input
          id="instructor"
          name="instructor"
          defaultValue={course?.instructor ?? ""}
        />
      </Field>
      <Field
        label={t("description")}
        htmlFor="description"
        error={state.fieldErrors?.description?.[0]}
      >
        <Textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={course?.description ?? ""}
        />
      </Field>
    </>
  );
}

export function CreateCourseForm() {
  const t = useTranslations("AcademyAdmin");
  const [state, action, pending] = useActionState<FormState, FormData>(
    createCourse,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <CourseFields t={t} state={state} />
      <Button type="submit" loading={pending}>
        {pending ? t("creating") : t("createCourse")}
      </Button>
    </form>
  );
}

export function EditCourseForm({ course }: { course: Course }) {
  const t = useTranslations("AcademyAdmin");
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateCourse,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={course.id} />
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <CourseFields t={t} state={state} course={course} />
      <Button type="submit" loading={pending}>
        {pending ? t("saving") : t("saveChanges")}
      </Button>
    </form>
  );
}

export function ThumbnailManager({ course }: { course: Course }) {
  const t = useTranslations("AcademyAdmin");
  const [state, action, pending] = useActionState<FormState, FormData>(
    uploadCourseThumbnail,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="h-24 w-40 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
          {course.thumbnail_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/academy/thumbnails/${course.id}`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-tp.png" alt="" className="h-8 w-8 opacity-60" />
            </div>
          )}
        </div>
        {course.thumbnail_path && (
          <form action={removeCourseThumbnail}>
            <input type="hidden" name="course_id" value={course.id} />
            <Button type="submit" variant="ghost" size="sm">
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("removeThumbnail")}
            </Button>
          </form>
        )}
      </div>

      <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="course_id" value={course.id} />
        <div className="flex-1">
          <Field
            label={t("uploadThumbnail")}
            error={state.fieldErrors?.file?.[0]}
            hint={t("thumbnailHint")}
          >
            <input
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
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
    </div>
  );
}
