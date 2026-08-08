"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { uploadCourseFile } from "@/app/actions/academy";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

/** Upload a course-level PDF document (mirrors the lesson attachment form). */
export function UploadCourseFileForm({ courseId }: { courseId: string }) {
  const t = useTranslations("AcademyAdmin");
  const [state, action, pending] = useActionState<FormState, FormData>(
    uploadCourseFile,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="course_id" value={courseId} />
      <div className="flex-1">
        <Field
          label={t("addCourseDoc")}
          error={state.fieldErrors?.file?.[0]}
          hint={t("pdfHint")}
        >
          <input
            type="file"
            name="file"
            accept="application/pdf"
            required
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-50"
          />
        </Field>
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
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
