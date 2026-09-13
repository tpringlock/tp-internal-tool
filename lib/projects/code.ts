/**
 * Derive a project code (codeSchema format: 2-20 chars, [A-Za-z0-9_-]) from a
 * free-text Vietnamese project name, for the "create project while uploading"
 * flow where users only type a name. `attempt` > 0 appends a numeric suffix
 * for retrying after a unique-code collision.
 */
export function generateProjectCode(name: string, attempt = 0): string {
  const base = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 16)
    .replace(/_+$/g, "");

  // "DA" = dự án; also pads 1-char results up to the 2-char minimum.
  const code = base.length < 2 ? "DA" : base;
  return attempt > 0 ? `${code}-${attempt + 1}` : code;
}
