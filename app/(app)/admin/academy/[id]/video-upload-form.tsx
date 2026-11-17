"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createLessonVideoUploadUrl,
  finalizeLessonVideo,
} from "@/app/actions/academy";
import { createClient } from "@/lib/supabase/client";
import {
  ACADEMY_BUCKET,
  MAX_VIDEO_SIZE_LABEL,
} from "@/lib/academy/constants";
import { validateVideoFile } from "@/lib/academy/video-validation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { useActionFailureMessage } from "@/components/ui/use-form-action";
import { classifyStorageError } from "@/lib/errors/user-error";

/**
 * Upload a video file straight from the browser to Supabase Storage (one-time
 * signed URL, so large files bypass the Next.js server) and record it on the
 * lesson. Three steps: get URL → PUT file → finalize. Shared by the add-lesson
 * and edit-lesson forms. Returns an error string, or null on success.
 */
export async function uploadLessonVideoFile(
  courseId: string,
  lessonId: string,
  file: File,
  opts: { sizeErrorMessage: string; failedMessage: string },
): Promise<string | null> {
  const signed = await createLessonVideoUploadUrl({
    courseId,
    lessonId,
    fileName: file.name,
    fileSize: file.size,
    contentType: file.type,
  });
  if ("error" in signed) return signed.error;

  const supabase = createClient();
  const { error: uploadError } = await supabase.storage
    .from(ACADEMY_BUCKET)
    .uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: file.type,
    });
  if (uploadError) {
    // Storage text ("The object exceeded…", bucket names) is not shown:
    // oversized objects (bucket file_size_limit or the project-wide cap) get
    // the translated size error, anything else the generic upload error.
    console.error("[video-upload]", uploadError);
    if (
      classifyStorageError(uploadError) === "too_large" ||
      /exceed|too large|413|payload/i.test(uploadError.message)
    ) {
      return opts.sizeErrorMessage;
    }
    return opts.failedMessage;
  }

  const result = await finalizeLessonVideo({
    lessonId,
    courseId,
    storagePath: signed.path,
    fileName: file.name,
    fileSize: file.size,
  });
  return result.error ?? null;
}

/** Standalone upload control shown in the lesson editor (existing lessons). */
export function VideoUploadForm({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
  const t = useTranslations("AcademyAdmin");
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const failureMessage = useActionFailureMessage();

  function fail(message: string) {
    setError(message);
    toast(message, { tone: "error" });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const file = inputRef.current?.files?.[0];
    const invalid = validateVideoFile(file, t);
    if (invalid) {
      fail(invalid);
      return;
    }

    setPending(true);
    try {
      const uploadError = await uploadLessonVideoFile(
        courseId,
        lessonId,
        file!,
        {
          sizeErrorMessage: t("errVideoSize", { size: MAX_VIDEO_SIZE_LABEL }),
          failedMessage: t("errUploadFailed"),
        },
      );
      if (uploadError) {
        fail(uploadError);
        return;
      }
      if (inputRef.current) inputRef.current.value = "";
      toast(t("videoUploaded"), { tone: "success" });
      router.refresh();
    } catch (err) {
      // Offline / dropped connection: the chosen file stays in the input.
      fail(failureMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex-1">
        <Field
          label={t("uploadVideo")}
          hint={t("uploadVideoHint", { size: MAX_VIDEO_SIZE_LABEL })}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/webm"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-50"
          />
        </Field>
      </div>
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        {pending ? t("uploadingVideo") : t("upload")}
      </Button>
      {error && (
        <div className="w-full">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </form>
  );
}
