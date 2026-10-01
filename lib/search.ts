/**
 * Accent-insensitive search for pickers ("viet panel" finds "VIỆT PANEL",
 * "dung" finds "DŨNG"). Pure and client-safe.
 */

/** Lower-case, strip Vietnamese diacritics (đ -> d), single spaces. */
export function foldSearchText(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(query: string): string[] {
  const folded = foldSearchText(query);
  return folded ? folded.split(" ") : [];
}

/** Every word of the query appears somewhere in the fields (any order). */
export function matchesSearch(fields: (string | null | undefined)[], query: string): boolean {
  const words = tokens(query);
  if (words.length === 0) return true;
  const haystack = fields.map(foldSearchText).join(" | ");
  return words.every((w) => haystack.includes(w));
}

/**
 * Items matching the query, best first: the primary field (e.g. the MISA
 * warehouse code) equal to the query, then starting with it, then any field
 * starting with the first word, then the rest. Ties keep the input order.
 * An empty query returns the items unchanged.
 */
export function searchItems<T>(
  items: readonly T[],
  query: string,
  fields: (item: T) => (string | null | undefined)[],
  limit = Infinity,
): T[] {
  const words = tokens(query);
  if (words.length === 0) return items.slice(0, limit);
  const whole = words.join(" ");

  const scored: { item: T; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const f = fields(item);
    if (!matchesSearch(f, query)) return;
    const primary = foldSearchText(f[0]);
    const folded = f.map(foldSearchText);
    const score =
      primary === whole ? 0
      : primary.startsWith(whole) ? 1
      : folded.some((x) => x.startsWith(words[0]) || x.includes(` ${words[0]}`)) ? 2
      : 3;
    scored.push({ item, score, index });
  });
  return scored
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((s) => s.item);
}
