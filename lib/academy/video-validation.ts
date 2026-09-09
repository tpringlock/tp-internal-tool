import {
  ACCEPTED_VIDEO_MIME,
  MAX_VIDEO_SIZE,
  MAX_VIDEO_SIZE_LABEL,
} from "./constants";

/**
 * Client-side guard before uploading: presence, MIME, size. Returns a
 * translated error message, or null when the file is acceptable.
 */
export function validateVideoFile(
  file: File | undefined,
  t: (key: string, values?: Record<string, string>) => string,
): string | null {
  if (!file) return t("errVideoChoose");
  if (!ACCEPTED_VIDEO_MIME[file.type]) return t("errVideoType");
  if (file.size > MAX_VIDEO_SIZE) {
    return t("errVideoSize", { size: MAX_VIDEO_SIZE_LABEL });
  }
  return null;
}
