"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import {
  courseSchema,
  chapterSchema,
  lessonSchema,
  translateFieldErrors,
} from "@/lib/validation";
import { parseVideoUrl } from "@/lib/academy/video";
import { isCourseComplete } from "@/lib/academy/progress";
import {
  ACADEMY_BUCKET,
  ACCEPTED_MIME,
  MAX_FILE_SIZE,
  ACCEPTED_IMAGE_MIME,
  MAX_IMAGE_SIZE,
  buildLessonFilePath,
  buildThumbnailPath,
} from "@/lib/academy/constants";
import type { VideoProvider } from "@/lib/db/types";
import type { FormState } from "@/app/actions/auth";

// --- Courses ------------------------------------------------------------

export async function createCourse(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = courseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    instructor: formData.get("instructor"),
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .insert({ ...parsed.data, created_by: admin.id })
    .select("id")
    .single();
  if (error || !data) {
    return { error: error?.message ?? "Could not create the course." };
  }

  await logActivity(supabase, {
    action: "course.created",
    entityType: "course",
    entityId: data.id,
    metadata: { title: parsed.data.title },
  });
  redirect(`/admin/academy/${data.id}`);
}

export async function updateCourse(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const id = String(formData.get("id"));
  const parsed = courseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    instructor: formData.get("instructor"),
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("courses").update(parsed.data).eq("id", id);
  const t = await getTranslations("AcademyAdmin");
  if (error) return { error: error.message };

  await logActivity(supabase, {
    action: "course.updated",
    entityType: "course",
    entityId: id,
  });
  revalidatePath(`/admin/academy/${id}`);
  return { success: t("courseUpdated") };
}

export async function publishCourse(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id"));
  const publish = formData.get("publish") === "true";

  const supabase = await createClient();
  await supabase
    .from("courses")
    .update({
      status: publish ? "published" : "draft",
      published_at: publish ? new Date().toISOString() : null,
    })
    .eq("id", id);

  await logActivity(supabase, {
    action: publish ? "course.published" : "course.unpublished",
    entityType: "course",
    entityId: id,
  });
  revalidatePath(`/admin/academy/${id}`);
  revalidatePath("/admin/academy");
}

export async function deleteCourse(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id"));

  const supabase = await createClient();
  // Remove any stored PDFs first: DB rows cascade, but storage objects don't.
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id")
    .eq("course_id", id);
  const lessonIds = (lessons ?? []).map((l) => l.id);
  if (lessonIds.length > 0) {
    const { data: files } = await supabase
      .from("lesson_files")
      .select("storage_path")
      .in("lesson_id", lessonIds);
    const paths = (files ?? []).map((f) => f.storage_path);
    if (paths.length > 0) {
      await createAdminClient().storage.from(ACADEMY_BUCKET).remove(paths);
    }
  }

  await supabase.from("courses").delete().eq("id", id);
  await logActivity(supabase, {
    action: "course.deleted",
    entityType: "course",
    entityId: id,
  });
  redirect("/admin/academy");
}

// --- Lessons ------------------------------------------------------------

/** Resolve the raw video field into a stored url + provider, or a field error. */
async function resolveVideo(
  rawUrl: string | null,
): Promise<{ video_url: string | null; video_provider: VideoProvider | null } | { fieldError: string }> {
  if (!rawUrl) return { video_url: null, video_provider: null };
  const parsed = parseVideoUrl(rawUrl);
  if (!parsed) {
    const t = await getTranslations("AcademyAdmin");
    return { fieldError: t("errVideoUrl") };
  }
  return { video_url: rawUrl, video_provider: parsed.provider };
}

export async function addLesson(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const courseId = String(formData.get("course_id"));
  const chapterId = String(formData.get("chapter_id"));
  const parsed = lessonSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    video_url: formData.get("video_url"),
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const video = await resolveVideo(parsed.data.video_url);
  if ("fieldError" in video) {
    return { fieldErrors: { video_url: [video.fieldError] } };
  }

  const supabase = await createClient();
  // Position is scoped within the chapter.
  const { data: last } = await supabase
    .from("lessons")
    .select("position")
    .eq("chapter_id", chapterId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = last ? last.position + 1 : 0;

  const { data, error } = await supabase
    .from("lessons")
    .insert({
      course_id: courseId,
      chapter_id: chapterId,
      title: parsed.data.title,
      description: parsed.data.description,
      video_url: video.video_url,
      video_provider: video.video_provider,
      position,
    })
    .select("id")
    .single();
  const t = await getTranslations("AcademyAdmin");
  if (error || !data) return { error: error?.message ?? t("errSaveFailed") };

  await logActivity(supabase, {
    action: "lesson.created",
    entityType: "lesson",
    entityId: data.id,
    metadata: { course_id: courseId },
  });
  revalidatePath(`/admin/academy/${courseId}`);
  return { success: t("lessonAdded") };
}

export async function updateLesson(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));
  const parsed = lessonSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    video_url: formData.get("video_url"),
  });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const video = await resolveVideo(parsed.data.video_url);
  if ("fieldError" in video) {
    return { fieldErrors: { video_url: [video.fieldError] } };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lessons")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      video_url: video.video_url,
      video_provider: video.video_provider,
    })
    .eq("id", id);
  const t = await getTranslations("AcademyAdmin");
  if (error) return { error: error.message };

  await logActivity(supabase, {
    action: "lesson.updated",
    entityType: "lesson",
    entityId: id,
  });
  revalidatePath(`/admin/academy/${courseId}`);
  return { success: t("lessonUpdated") };
}

export async function deleteLesson(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));

  const supabase = await createClient();
  const { data: files } = await supabase
    .from("lesson_files")
    .select("storage_path")
    .eq("lesson_id", id);
  const paths = (files ?? []).map((f) => f.storage_path);
  if (paths.length > 0) {
    await createAdminClient().storage.from(ACADEMY_BUCKET).remove(paths);
  }

  await supabase.from("lessons").delete().eq("id", id);
  await logActivity(supabase, {
    action: "lesson.deleted",
    entityType: "lesson",
    entityId: id,
  });
  revalidatePath(`/admin/academy/${courseId}`);
}

/** Swap a lesson's position with its neighbour within its chapter (up | down). */
export async function reorderLesson(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));
  const direction = String(formData.get("direction"));

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("lessons")
    .select("id, position, chapter_id")
    .eq("id", id)
    .single();
  if (!current) return;

  const neighbourQuery = supabase
    .from("lessons")
    .select("id, position")
    .eq("chapter_id", current.chapter_id)
    .limit(1);
  const { data: neighbour } =
    direction === "up"
      ? await neighbourQuery
          .lt("position", current.position)
          .order("position", { ascending: false })
          .maybeSingle()
      : await neighbourQuery
          .gt("position", current.position)
          .order("position", { ascending: true })
          .maybeSingle();
  if (!neighbour) return;

  await supabase
    .from("lessons")
    .update({ position: neighbour.position })
    .eq("id", current.id);
  await supabase
    .from("lessons")
    .update({ position: current.position })
    .eq("id", neighbour.id);
  revalidatePath(`/admin/academy/${courseId}`);
}

// --- Lesson files (PDFs) -----------------------------------------------

export async function uploadLessonFile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  const lessonId = String(formData.get("lesson_id"));
  const courseId = String(formData.get("course_id"));
  const file = formData.get("file");
  const t = await getTranslations("AcademyAdmin");

  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { file: [t("errFileChoose")] } };
  }
  if (file.type !== ACCEPTED_MIME) {
    return { fieldErrors: { file: [t("errFilePdf")] } };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { fieldErrors: { file: [t("errFileSize")] } };
  }

  const fileId = crypto.randomUUID();
  const storagePath = buildLessonFilePath(courseId, lessonId, fileId);
  const adminClient = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await adminClient.storage
    .from(ACADEMY_BUCKET)
    .upload(storagePath, buffer, { contentType: ACCEPTED_MIME, upsert: false });
  if (uploadError) {
    return { error: t("errUploadFailed", { message: uploadError.message }) };
  }

  const supabase = await createClient();
  const { data: inserted, error: insertError } = await supabase
    .from("lesson_files")
    .insert({
      lesson_id: lessonId,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      created_by: admin.id,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    await adminClient.storage.from(ACADEMY_BUCKET).remove([storagePath]);
    return { error: insertError?.message ?? t("errSaveFailed") };
  }

  await logActivity(supabase, {
    action: "lesson_file.uploaded",
    entityType: "lesson_file",
    entityId: inserted.id,
    metadata: { lesson_id: lessonId },
  });
  revalidatePath(`/admin/academy/${courseId}`);
  return { success: t("fileUploaded") };
}

export async function deleteLessonFile(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));

  const supabase = await createClient();
  const { data: fileRow } = await supabase
    .from("lesson_files")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (fileRow) {
    await createAdminClient()
      .storage.from(ACADEMY_BUCKET)
      .remove([fileRow.storage_path]);
    await supabase.from("lesson_files").delete().eq("id", id);
    await logActivity(supabase, {
      action: "lesson_file.deleted",
      entityType: "lesson_file",
      entityId: id,
    });
  }
  revalidatePath(`/admin/academy/${courseId}`);
}

// --- Course thumbnail ---------------------------------------------------

export async function uploadCourseThumbnail(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const courseId = String(formData.get("course_id"));
  const file = formData.get("file");
  const t = await getTranslations("AcademyAdmin");

  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { file: [t("errImageChoose")] } };
  }
  const ext = ACCEPTED_IMAGE_MIME[file.type];
  if (!ext) {
    return { fieldErrors: { file: [t("errImageType")] } };
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return { fieldErrors: { file: [t("errImageSize")] } };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("courses")
    .select("thumbnail_path")
    .eq("id", courseId)
    .single();

  const fileId = crypto.randomUUID();
  const storagePath = buildThumbnailPath(courseId, fileId, ext);
  const adminClient = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await adminClient.storage
    .from(ACADEMY_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { error: t("errUploadFailed", { message: uploadError.message }) };
  }

  const { error: updateError } = await supabase
    .from("courses")
    .update({ thumbnail_path: storagePath })
    .eq("id", courseId);
  if (updateError) {
    await adminClient.storage.from(ACADEMY_BUCKET).remove([storagePath]);
    return { error: updateError.message };
  }

  // Best-effort cleanup of the previous image.
  if (existing?.thumbnail_path) {
    await adminClient.storage.from(ACADEMY_BUCKET).remove([existing.thumbnail_path]);
  }
  revalidatePath(`/admin/academy/${courseId}`);
  return { success: t("thumbnailUpdated") };
}

export async function removeCourseThumbnail(formData: FormData): Promise<void> {
  await requireAdmin();
  const courseId = String(formData.get("course_id"));

  const supabase = await createClient();
  const { data: course } = await supabase
    .from("courses")
    .select("thumbnail_path")
    .eq("id", courseId)
    .single();
  if (course?.thumbnail_path) {
    await createAdminClient()
      .storage.from(ACADEMY_BUCKET)
      .remove([course.thumbnail_path]);
    await supabase
      .from("courses")
      .update({ thumbnail_path: null })
      .eq("id", courseId);
  }
  revalidatePath(`/admin/academy/${courseId}`);
}

// --- Chapters -----------------------------------------------------------

export async function addChapter(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const courseId = String(formData.get("course_id"));
  const parsed = chapterSchema.safeParse({ title: formData.get("title") });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("chapters")
    .select("position")
    .eq("course_id", courseId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = last ? last.position + 1 : 0;

  const { error } = await supabase
    .from("chapters")
    .insert({ course_id: courseId, title: parsed.data.title, position });
  const t = await getTranslations("AcademyAdmin");
  if (error) return { error: error.message };
  revalidatePath(`/admin/academy/${courseId}`);
  return { success: t("chapterAdded") };
}

export async function updateChapter(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));
  const parsed = chapterSchema.safeParse({ title: formData.get("title") });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("chapters")
    .update({ title: parsed.data.title })
    .eq("id", id);
  const t = await getTranslations("AcademyAdmin");
  if (error) return { error: error.message };
  revalidatePath(`/admin/academy/${courseId}`);
  return { success: t("chapterUpdated") };
}

export async function deleteChapter(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));

  const supabase = await createClient();
  // Remove PDFs for lessons in this chapter (DB rows cascade; storage doesn't).
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id")
    .eq("chapter_id", id);
  const lessonIds = (lessons ?? []).map((l) => l.id);
  if (lessonIds.length > 0) {
    const { data: files } = await supabase
      .from("lesson_files")
      .select("storage_path")
      .in("lesson_id", lessonIds);
    const paths = (files ?? []).map((f) => f.storage_path);
    if (paths.length > 0) {
      await createAdminClient().storage.from(ACADEMY_BUCKET).remove(paths);
    }
  }

  await supabase.from("chapters").delete().eq("id", id);
  revalidatePath(`/admin/academy/${courseId}`);
}

/** Swap a chapter's position with its neighbour within the course (up | down). */
export async function reorderChapter(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));
  const direction = String(formData.get("direction"));

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("chapters")
    .select("id, position")
    .eq("id", id)
    .single();
  if (!current) return;

  const neighbourQuery = supabase
    .from("chapters")
    .select("id, position")
    .eq("course_id", courseId)
    .limit(1);
  const { data: neighbour } =
    direction === "up"
      ? await neighbourQuery
          .lt("position", current.position)
          .order("position", { ascending: false })
          .maybeSingle()
      : await neighbourQuery
          .gt("position", current.position)
          .order("position", { ascending: true })
          .maybeSingle();
  if (!neighbour) return;

  await supabase
    .from("chapters")
    .update({ position: neighbour.position })
    .eq("id", current.id);
  await supabase
    .from("chapters")
    .update({ position: current.position })
    .eq("id", neighbour.id);
  revalidatePath(`/admin/academy/${courseId}`);
}

// --- Enrollment + progress (employee, self-service) --------------------

/** Join a course (idempotent) and jump to its first lesson. */
export async function enrollAndStart(formData: FormData): Promise<void> {
  const user = await requireUser();
  const courseId = String(formData.get("course_id"));
  const firstLessonId = String(formData.get("first_lesson_id") ?? "");

  const supabase = await createClient();
  // Insert enrollment if absent (RLS allows only published courses + self).
  const { data: existing } = await supabase
    .from("course_enrollments")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!existing) {
    await supabase
      .from("course_enrollments")
      .insert({ user_id: user.id, course_id: courseId });
    await logActivity(supabase, {
      action: "course.enrolled",
      entityType: "course",
      entityId: courseId,
    });
  }

  if (firstLessonId) {
    redirect(`/academy/${courseId}/${firstLessonId}`);
  }
  redirect(`/academy/${courseId}`);
}

/** Mark or unmark a lesson complete, then recompute the course's completion. */
export async function toggleLessonComplete(formData: FormData): Promise<void> {
  const user = await requireUser();
  const lessonId = String(formData.get("lesson_id"));
  const courseId = String(formData.get("course_id"));
  const complete = formData.get("complete") === "true";

  const supabase = await createClient();

  // Ensure the user is enrolled (marking progress implies joining the course).
  const { data: enrollment } = await supabase
    .from("course_enrollments")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!enrollment) {
    await supabase
      .from("course_enrollments")
      .insert({ user_id: user.id, course_id: courseId });
  }

  if (complete) {
    await supabase
      .from("lesson_progress")
      .upsert(
        { user_id: user.id, lesson_id: lessonId, course_id: courseId },
        { onConflict: "user_id,lesson_id" },
      );
  } else {
    await supabase
      .from("lesson_progress")
      .delete()
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId);
  }

  // Recompute completion: done vs the course's current lesson count.
  const [{ count: total }, { count: done }] = await Promise.all([
    supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId),
    supabase
      .from("lesson_progress")
      .select("lesson_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("course_id", courseId),
  ]);
  const completedNow = isCourseComplete(total ?? 0, done ?? 0);
  await supabase
    .from("course_enrollments")
    .update({ completed_at: completedNow ? new Date().toISOString() : null })
    .eq("user_id", user.id)
    .eq("course_id", courseId);

  if (completedNow) {
    await logActivity(supabase, {
      action: "course.completed",
      entityType: "course",
      entityId: courseId,
    });
  }
  revalidatePath(`/academy/${courseId}/${lessonId}`);
  revalidatePath(`/academy/${courseId}`);
  revalidatePath("/academy/my-courses");
}
