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
  ACCEPTED_VIDEO_MIME,
  MAX_VIDEO_SIZE,
} from "@/lib/academy/constants";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

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
  if (uploadError) return uploadError.message;

  const result = await finalizeLessonVideo({
    lessonId,
    courseId,
    storagePath: signed.path,
    fileName: file.name,
    fileSize: file.size,
  });
  return result.error ?? null;
}

/**
 * Client-side guard before uploading: presence, MIME, size. Returns a
 * translated error message, or null when the file is acceptable.
 */
export function validateVideoFile(
  file: File | undefined,
  t: (key: string) => string,
): string | null {
  if (!file) return t("errVideoChoose");
  if (!ACCEPTED_VIDEO_MIME[file.type]) return t("errVideoType");
  if (file.size > MAX_VIDEO_SIZE) return t("errVideoSize");
  return null;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const file = inputRef.current?.files?.[0];
    const invalid = validateVideoFile(file, t);
    if (invalid) {
      setError(invalid);
      return;
    }

    setPending(true);
    try {
      const uploadError = await uploadLessonVideoFile(courseId, lessonId, file!);
      if (uploadError) {
        setError(uploadError);
        return;
      }
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex-1">
        <Field label={t("uploadVideo")} hint={t("uploadVideoHint")}>
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
