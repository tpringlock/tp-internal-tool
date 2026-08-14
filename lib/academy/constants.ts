/** Storage bucket for Academy lesson PDFs (private; see 0007_academy_storage.sql). */
export const ACADEMY_BUCKET = "academy";

/** Max lesson-PDF upload size (25 MB) and the only accepted MIME type. */
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const ACCEPTED_MIME = "application/pdf";

/**
 * Build the storage path for a lesson PDF: {courseId}/{lessonId}/{fileId}.pdf.
 * Namespacing by course + lesson keeps a course's files together and lets a
 * cascade delete map cleanly onto a storage prefix.
 */
export function buildLessonFilePath(
  courseId: string,
  lessonId: string,
  fileId: string,
): string {
  return `${courseId}/${lessonId}/${fileId}.pdf`;
}

/**
 * Build the storage path for a course-level PDF: {courseId}/course/{fileId}.pdf.
 * The `course/` segment keeps course documents from colliding with lesson files
 * (which live under {courseId}/{lessonId}/) inside the same course prefix.
 */
export function buildCourseFilePath(courseId: string, fileId: string): string {
  return `${courseId}/course/${fileId}.pdf`;
}

/** Course thumbnail uploads: images only, up to 5 MB, in the same private bucket. */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Storage path for a course thumbnail: thumbnails/{courseId}/{fileId}.{ext}. */
export function buildThumbnailPath(
  courseId: string,
  fileId: string,
  ext: string,
): string {
  return `thumbnails/${courseId}/${fileId}.${ext}`;
}

/**
 * Self-hosted lesson videos: uploaded straight to the private `academy` bucket
 * and streamed via a short-lived signed URL. Limit mirrors the bucket's
 * file_size_limit (see 0014_lesson_video_upload.sql). mp4 (H.264) and webm are
 * the formats the native <video> element plays reliably.
 */
export const MAX_VIDEO_SIZE = 1024 * 1024 * 1024; // 1 GiB
export const ACCEPTED_VIDEO_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/** Storage path for a lesson video: videos/{courseId}/{lessonId}/{fileId}.{ext}. */
export function buildLessonVideoPath(
  courseId: string,
  lessonId: string,
  fileId: string,
  ext: string,
): string {
  return `videos/${courseId}/${lessonId}/${fileId}.${ext}`;
}
