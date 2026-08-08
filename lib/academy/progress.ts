/**
 * Course-completion rules, centralized and pure so the mark-complete action and
 * the UI progress bars agree. `total` is the course's lesson count, `done` the
 * number the user has marked complete.
 */

/** A course is complete when it has at least one lesson and all are done. */
export function isCourseComplete(total: number, done: number): boolean {
  return total > 0 && done >= total;
}

/** Whole-number completion percentage, clamped to 0..100 (0 lessons → 0). */
export function progressPercent(total: number, done: number): number {
  if (total <= 0) return 0;
  const pct = Math.round((done / total) * 100);
  return Math.max(0, Math.min(100, pct));
}

/**
 * Which chapters are unlocked, in order. A chapter is unlocked once every lesson
 * in all earlier chapters is complete (the first chapter is always unlocked;
 * earlier chapters with no lessons don't block later ones). Drives sequential
 * "finish this chapter before the next" gating in the lesson viewer.
 */
export function chapterUnlockFlags(
  chapters: { lessons: { id: string }[] }[],
  completed: Set<string>,
): boolean[] {
  let earlierAllDone = true;
  return chapters.map((chapter) => {
    const unlocked = earlierAllDone;
    if (earlierAllDone) {
      earlierAllDone = chapter.lessons.every((l) => completed.has(l.id));
    }
    return unlocked;
  });
}
