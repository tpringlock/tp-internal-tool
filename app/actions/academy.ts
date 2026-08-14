"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireContentManager, requireUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import {
  courseSchema,
  chapterSchema,
  lessonSchema,
  quizQuestionSchema,
  lessonNoteSchema,
  translateFieldErrors,
} from "@/lib/validation";
import { parseVideoUrl } from "@/lib/academy/video";
import { isCourseCompleteWithQuizzes } from "@/lib/academy/progress";
import {
  getCourseTree,
  getCompletedLessonIds,
  getPassedChapterIds,
} from "@/lib/academy/queries";
import {
  ACADEMY_BUCKET,
  ACCEPTED_MIME,
  MAX_FILE_SIZE,
  ACCEPTED_IMAGE_MIME,
  MAX_IMAGE_SIZE,
  ACCEPTED_VIDEO_MIME,
  MAX_VIDEO_SIZE,
  buildLessonFilePath,
  buildCourseFilePath,
  buildThumbnailPath,
  buildLessonVideoPath,
} from "@/lib/academy/constants";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VideoProvider, Database } from "@/lib/db/types";
import type { FormState } from "@/app/actions/auth";

/**
 * Recompute a course's completion for a user, honouring both lessons and chapter
 * quizzes, and flip course_enrollments.completed_at only on a transition. Logs
 * `course.completed` when it newly completes. Shared by the mark-complete and
 * quiz-submit actions. Returns true if the course just became complete.
 */
async function recomputeCourseCompletion(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string,
): Promise<boolean> {
  const [tree, completed, passed] = await Promise.all([
    getCourseTree(supabase, courseId),
    getCompletedLessonIds(supabase, userId, courseId),
    getPassedChapterIds(supabase, userId, courseId),
  ]);
  const completedNow = tree
    ? isCourseCompleteWithQuizzes(tree.chapters, completed, passed)
    : false;

  const { data: enrollment } = await supabase
    .from("course_enrollments")
    .select("completed_at")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  const wasComplete = Boolean(enrollment?.completed_at);

  if (completedNow !== wasComplete) {
    await supabase
      .from("course_enrollments")
      .update({ completed_at: completedNow ? new Date().toISOString() : null })
      .eq("user_id", userId)
      .eq("course_id", courseId);
  }

  const newlyCompleted = completedNow && !wasComplete;
  if (newlyCompleted) {
    await logActivity(supabase, {
      action: "course.completed",
      entityType: "course",
      entityId: courseId,
    });
  }
  return newlyCompleted;
}

// --- Courses ------------------------------------------------------------

export async function createCourse(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireContentManager();
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
  await requireContentManager();
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
  await requireContentManager();
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
  // Remove any stored PDFs + videos first: DB rows cascade, storage doesn't.
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, video_storage_path")
    .eq("course_id", id);
  const lessonIds = (lessons ?? []).map((l) => l.id);
  if (lessonIds.length > 0) {
    const { data: files } = await supabase
      .from("lesson_files")
      .select("storage_path")
      .in("lesson_id", lessonIds);
    const paths = (files ?? []).map((f) => f.storage_path);
    for (const l of lessons ?? []) {
      if (l.video_storage_path) paths.push(l.video_storage_path);
    }
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
): Promise<FormState & { lessonId?: string }> {
  await requireContentManager();
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
  return { success: t("lessonAdded"), lessonId: data.id };
}

export async function updateLesson(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireContentManager();
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

  const supabase = await createClient();
  // A self-hosted (uploaded) video is managed separately; the edit form hides
  // the link field for such lessons, so leave the video columns untouched here.
  const { data: current } = await supabase
    .from("lessons")
    .select("video_provider")
    .eq("id", id)
    .single();
  const isSelfHosted = current?.video_provider === "self_hosted";

  let videoFields: {
    video_url: string | null;
    video_provider: VideoProvider | null;
  } | null = null;
  if (!isSelfHosted) {
    const video = await resolveVideo(parsed.data.video_url);
    if ("fieldError" in video) {
      return { fieldErrors: { video_url: [video.fieldError] } };
    }
    videoFields = video;
  }

  const { error } = await supabase
    .from("lessons")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      ...(videoFields ?? {}),
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
  await requireContentManager();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));

  const supabase = await createClient();
  const { data: files } = await supabase
    .from("lesson_files")
    .select("storage_path")
    .eq("lesson_id", id);
  const { data: lessonRow } = await supabase
    .from("lessons")
    .select("video_storage_path")
    .eq("id", id)
    .single();
  const paths = (files ?? []).map((f) => f.storage_path);
  if (lessonRow?.video_storage_path) paths.push(lessonRow.video_storage_path);
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
  await requireContentManager();
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
  const admin = await requireContentManager();
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
  await requireContentManager();
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

// --- Lesson video (self-hosted) ----------------------------------------

/**
 * Issue a one-time signed URL the browser can PUT a video file to, straight
 * into the private `academy` bucket. Keeps large uploads out of the server
 * action (no body-size/memory limits); the server still owns the storage path.
 * The lesson row is written afterwards by {@link finalizeLessonVideo}.
 */
export async function createLessonVideoUploadUrl(input: {
  courseId: string;
  lessonId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
}): Promise<{ path: string; token: string } | { error: string }> {
  await requireContentManager();
  const t = await getTranslations("AcademyAdmin");

  const ext = ACCEPTED_VIDEO_MIME[input.contentType];
  if (!ext) return { error: t("errVideoType") };
  if (input.fileSize <= 0 || input.fileSize > MAX_VIDEO_SIZE) {
    return { error: t("errVideoSize") };
  }

  const fileId = crypto.randomUUID();
  const path = buildLessonVideoPath(input.courseId, input.lessonId, fileId, ext);
  const { data, error } = await createAdminClient()
    .storage.from(ACADEMY_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    return { error: t("errUploadFailed", { message: error?.message ?? "" }) };
  }
  return { path: data.path, token: data.token };
}

/**
 * Record an uploaded video on the lesson: switch it to the self_hosted provider,
 * store the path + metadata, and clear any pasted link (a lesson has either a
 * link or a file, never both). Removes a previously uploaded video if replaced.
 */
export async function finalizeLessonVideo(input: {
  lessonId: string;
  courseId: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
}): Promise<FormState> {
  await requireContentManager();
  const t = await getTranslations("AcademyAdmin");
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("lessons")
    .select("video_storage_path")
    .eq("id", input.lessonId)
    .single();

  const { error } = await supabase
    .from("lessons")
    .update({
      video_provider: "self_hosted",
      video_storage_path: input.storagePath,
      video_file_name: input.fileName,
      video_file_size: input.fileSize,
      video_url: null,
    })
    .eq("id", input.lessonId);
  if (error) {
    // The uploaded object is now orphaned — best-effort cleanup.
    await createAdminClient()
      .storage.from(ACADEMY_BUCKET)
      .remove([input.storagePath]);
    return { error: error.message };
  }

  if (
    existing?.video_storage_path &&
    existing.video_storage_path !== input.storagePath
  ) {
    await createAdminClient()
      .storage.from(ACADEMY_BUCKET)
      .remove([existing.video_storage_path]);
  }

  await logActivity(supabase, {
    action: "lesson_video.uploaded",
    entityType: "lesson",
    entityId: input.lessonId,
    metadata: { course_id: input.courseId },
  });
  revalidatePath(`/admin/academy/${input.courseId}`);
  return { success: t("videoUploaded") };
}

/** Remove a lesson's uploaded video (object + metadata). */
export async function removeLessonVideo(formData: FormData): Promise<void> {
  await requireContentManager();
  const lessonId = String(formData.get("lesson_id"));
  const courseId = String(formData.get("course_id"));

  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("video_storage_path")
    .eq("id", lessonId)
    .single();
  if (lesson?.video_storage_path) {
    await createAdminClient()
      .storage.from(ACADEMY_BUCKET)
      .remove([lesson.video_storage_path]);
  }

  await supabase
    .from("lessons")
    .update({
      video_provider: null,
      video_storage_path: null,
      video_file_name: null,
      video_file_size: null,
    })
    .eq("id", lessonId);
  await logActivity(supabase, {
    action: "lesson_video.removed",
    entityType: "lesson",
    entityId: lessonId,
  });
  revalidatePath(`/admin/academy/${courseId}`);
}

// --- Course thumbnail ---------------------------------------------------

export async function uploadCourseThumbnail(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireContentManager();
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
  await requireContentManager();
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
  await requireContentManager();
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
  await requireContentManager();
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
  await requireContentManager();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));

  const supabase = await createClient();
  // Remove PDFs + videos for lessons in this chapter (rows cascade; storage doesn't).
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, video_storage_path")
    .eq("chapter_id", id);
  const lessonIds = (lessons ?? []).map((l) => l.id);
  if (lessonIds.length > 0) {
    const { data: files } = await supabase
      .from("lesson_files")
      .select("storage_path")
      .in("lesson_id", lessonIds);
    const paths = (files ?? []).map((f) => f.storage_path);
    for (const l of lessons ?? []) {
      if (l.video_storage_path) paths.push(l.video_storage_path);
    }
    if (paths.length > 0) {
      await createAdminClient().storage.from(ACADEMY_BUCKET).remove(paths);
    }
  }

  await supabase.from("chapters").delete().eq("id", id);
  revalidatePath(`/admin/academy/${courseId}`);
}

/** Swap a chapter's position with its neighbour within the course (up | down). */
export async function reorderChapter(formData: FormData): Promise<void> {
  await requireContentManager();
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

  // Recompute completion (lessons + chapter quizzes) and flip completed_at.
  await recomputeCourseCompletion(supabase, user.id, courseId);

  revalidatePath(`/academy/${courseId}/${lessonId}`);
  revalidatePath(`/academy/${courseId}`);
  revalidatePath("/academy/my-courses");
}

// --- Quiz authoring (admin) --------------------------------------------

/** Read a question's prompt, option labels, and the chosen correct index. */
function parseQuizQuestionForm(formData: FormData) {
  return quizQuestionSchema.safeParse({
    prompt: formData.get("prompt"),
    options: formData.getAll("option").map((o) => String(o)),
    correct_index: formData.get("correct_index"),
  });
}

/** Rows for quiz_options given ordered labels and the correct index. */
function optionRows(
  questionId: string,
  options: string[],
  correctIndex: number,
) {
  return options.map((label, i) => ({
    question_id: questionId,
    label,
    is_correct: i === correctIndex,
    position: i,
  }));
}

export async function addQuizQuestion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireContentManager();
  const chapterId = String(formData.get("chapter_id"));
  const courseId = String(formData.get("course_id"));
  const parsed = parseQuizQuestionForm(formData);
  const t = await getTranslations("AcademyAdmin");
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }
  const { prompt, options, correct_index } = parsed.data;
  if (correct_index >= options.length) {
    return { fieldErrors: { correct_index: [t("errQuizCorrect")] } };
  }

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("quiz_questions")
    .select("position")
    .eq("chapter_id", chapterId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = last ? last.position + 1 : 0;

  const { data: inserted, error } = await supabase
    .from("quiz_questions")
    .insert({ chapter_id: chapterId, prompt, position })
    .select("id")
    .single();
  if (error || !inserted) return { error: error?.message ?? t("errSaveFailed") };

  const { error: optError } = await supabase
    .from("quiz_options")
    .insert(optionRows(inserted.id, options, correct_index));
  if (optError) {
    await supabase.from("quiz_questions").delete().eq("id", inserted.id);
    return { error: optError.message };
  }

  await logActivity(supabase, {
    action: "quiz_question.created",
    entityType: "quiz_question",
    entityId: inserted.id,
    metadata: { chapter_id: chapterId },
  });
  revalidatePath(`/admin/academy/${courseId}`);
  return { success: t("quizQuestionAdded") };
}

export async function updateQuizQuestion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireContentManager();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));
  const parsed = parseQuizQuestionForm(formData);
  const t = await getTranslations("AcademyAdmin");
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }
  const { prompt, options, correct_index } = parsed.data;
  if (correct_index >= options.length) {
    return { fieldErrors: { correct_index: [t("errQuizCorrect")] } };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("quiz_questions")
    .update({ prompt })
    .eq("id", id);
  if (error) return { error: error.message };

  // Replace the option set wholesale — simplest correct approach for an edit.
  await supabase.from("quiz_options").delete().eq("question_id", id);
  const { error: optError } = await supabase
    .from("quiz_options")
    .insert(optionRows(id, options, correct_index));
  if (optError) return { error: optError.message };

  await logActivity(supabase, {
    action: "quiz_question.updated",
    entityType: "quiz_question",
    entityId: id,
  });
  revalidatePath(`/admin/academy/${courseId}`);
  return { success: t("quizQuestionUpdated") };
}

export async function deleteQuizQuestion(formData: FormData): Promise<void> {
  await requireContentManager();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));

  const supabase = await createClient();
  await supabase.from("quiz_questions").delete().eq("id", id); // options cascade
  await logActivity(supabase, {
    action: "quiz_question.deleted",
    entityType: "quiz_question",
    entityId: id,
  });
  revalidatePath(`/admin/academy/${courseId}`);
}

/** Swap a question's position with its neighbour within the chapter. */
export async function reorderQuizQuestion(formData: FormData): Promise<void> {
  await requireContentManager();
  const id = String(formData.get("id"));
  const chapterId = String(formData.get("chapter_id"));
  const courseId = String(formData.get("course_id"));
  const direction = String(formData.get("direction"));

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("quiz_questions")
    .select("id, position")
    .eq("id", id)
    .single();
  if (!current) return;

  const neighbourQuery = supabase
    .from("quiz_questions")
    .select("id, position")
    .eq("chapter_id", chapterId)
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
    .from("quiz_questions")
    .update({ position: neighbour.position })
    .eq("id", current.id);
  await supabase
    .from("quiz_questions")
    .update({ position: current.position })
    .eq("id", neighbour.id);
  revalidatePath(`/admin/academy/${courseId}`);
}

// --- Quiz submission (employee) ----------------------------------------

/**
 * Grade a chapter quiz server-side. Records a pass only when every question is
 * answered correctly; unlimited retries. Selected option per question arrives as
 * `q_{questionId}` = optionId.
 */
export async function submitChapterQuiz(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const chapterId = String(formData.get("chapter_id"));
  const courseId = String(formData.get("course_id"));
  const t = await getTranslations("Academy");

  const supabase = await createClient();
  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("id")
    .eq("chapter_id", chapterId);
  const questionIds = (questions ?? []).map((q) => q.id);
  if (questionIds.length === 0) return { error: t("quizEmpty") };

  const { data: options } = await supabase
    .from("quiz_options")
    .select("id, question_id, is_correct")
    .in("question_id", questionIds);
  const correctByQuestion = new Map<string, string>();
  for (const opt of options ?? []) {
    if (opt.is_correct) correctByQuestion.set(opt.question_id, opt.id);
  }

  let wrong = 0;
  for (const qid of questionIds) {
    const selected = String(formData.get(`q_${qid}`) ?? "");
    if (selected !== correctByQuestion.get(qid)) wrong += 1;
  }

  if (wrong > 0) {
    return { error: t("quizFailed", { wrong }) };
  }

  // Ensure enrollment (passing a quiz implies participating in the course).
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

  await supabase
    .from("chapter_quiz_passes")
    .upsert(
      { user_id: user.id, chapter_id: chapterId, course_id: courseId },
      { onConflict: "user_id,chapter_id" },
    );
  await logActivity(supabase, {
    action: "chapter_quiz.passed",
    entityType: "chapter",
    entityId: chapterId,
  });

  await recomputeCourseCompletion(supabase, user.id, courseId);

  revalidatePath(`/academy/${courseId}`);
  revalidatePath(`/academy/${courseId}/quiz/${chapterId}`);
  revalidatePath("/academy/my-courses");
  return { success: t("quizPassed") };
}

// --- Lesson notes (employee) -------------------------------------------

/** Upsert the current user's private note for a lesson. Empty clears it. */
export async function saveLessonNote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const lessonId = String(formData.get("lesson_id"));
  const courseId = String(formData.get("course_id"));
  const parsed = lessonNoteSchema.safeParse({ content: formData.get("content") });
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("lesson_notes").upsert(
    {
      user_id: user.id,
      lesson_id: lessonId,
      course_id: courseId,
      content: parsed.data.content,
    },
    { onConflict: "user_id,lesson_id" },
  );
  if (error) return { error: error.message };
  return { success: "saved" };
}

// --- Course documents (admin) ------------------------------------------

export async function uploadCourseFile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireContentManager();
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
  const storagePath = buildCourseFilePath(courseId, fileId);
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
    .from("course_files")
    .insert({
      course_id: courseId,
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
    action: "course_file.uploaded",
    entityType: "course_file",
    entityId: inserted.id,
    metadata: { course_id: courseId },
  });
  revalidatePath(`/admin/academy/${courseId}`);
  return { success: t("fileUploaded") };
}

export async function deleteCourseFile(formData: FormData): Promise<void> {
  await requireContentManager();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));

  const supabase = await createClient();
  const { data: fileRow } = await supabase
    .from("course_files")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (fileRow) {
    await createAdminClient()
      .storage.from(ACADEMY_BUCKET)
      .remove([fileRow.storage_path]);
    await supabase.from("course_files").delete().eq("id", id);
    await logActivity(supabase, {
      action: "course_file.deleted",
      entityType: "course_file",
      entityId: id,
    });
  }
  revalidatePath(`/admin/academy/${courseId}`);
}
