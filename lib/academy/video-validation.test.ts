import { describe, it, expect } from "vitest";
import { validateVideoFile } from "./video-validation";
import { MAX_VIDEO_SIZE, MAX_VIDEO_SIZE_LABEL } from "./constants";

/** Fake File with a given type/size without allocating real bytes. */
function fakeFile(type: string, size: number): File {
  const file = new File([], "video.mp4", { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

/** t stub that records interpolation values in the returned string. */
const t = (key: string, values?: Record<string, string>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

describe("validateVideoFile", () => {
  it("requires a file", () => {
    expect(validateVideoFile(undefined, t)).toBe("errVideoChoose");
  });

  it("rejects non-video MIME types", () => {
    expect(validateVideoFile(fakeFile("application/pdf", 10), t)).toBe(
      "errVideoType",
    );
    expect(validateVideoFile(fakeFile("video/quicktime", 10), t)).toBe(
      "errVideoType",
    );
  });

  it("accepts mp4 and webm at exactly the size limit", () => {
    expect(validateVideoFile(fakeFile("video/mp4", MAX_VIDEO_SIZE), t)).toBeNull();
    expect(validateVideoFile(fakeFile("video/webm", MAX_VIDEO_SIZE), t)).toBeNull();
  });

  it("rejects files one byte over the limit, passing the size label", () => {
    expect(validateVideoFile(fakeFile("video/mp4", MAX_VIDEO_SIZE + 1), t)).toBe(
      `errVideoSize:${JSON.stringify({ size: MAX_VIDEO_SIZE_LABEL })}`,
    );
  });

  it("limit is 50 MB, matching migration 0019", () => {
    expect(MAX_VIDEO_SIZE).toBe(52428800);
    expect(MAX_VIDEO_SIZE_LABEL).toBe("50 MB");
  });
});
