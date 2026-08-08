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
