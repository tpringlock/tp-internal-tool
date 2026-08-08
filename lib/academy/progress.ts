/**
 * Course-completion rules, centralized and pure so the mark-complete action and
 * the UI progress bars agree. `total` is the course's lesson count, `done` the
 * number the user has marked complete.
 */

/** A course is complete when it has at least one lesson and all are done. */
export function isCourseComplete(total: number, done: number): boolean {
  return total > 0 && done >= total;
}

/**
 * Course completion that also honours quizzes: every chapter must be fully done
 * (lessons complete + quiz passed) and the course must have at least one lesson.
 * Used by the mark-complete and quiz-submit actions to set completed_at.
 */
export function isCourseCompleteWithQuizzes(
  chapters: { id: string; lessons: { id: string }[]; hasQuiz: boolean }[],
  completed: Set<string>,
  passedQuizzes: Set<string>,
): boolean {
  const total = chapters.reduce((n, ch) => n + ch.lessons.length, 0);
  if (total === 0) return false;
  return chapters.every((ch) =>
    isChapterFullyDone(ch, completed, passedQuizzes),
  );
}

/** Whole-number completion percentage, clamped to 0..100 (0 lessons → 0). */
export function progressPercent(total: number, done: number): number {
  if (total <= 0) return 0;
  const pct = Math.round((done / total) * 100);
  return Math.max(0, Math.min(100, pct));
}

/**
 * Whether a single chapter is "fully done": every lesson complete AND, if it
 * carries a quiz, that quiz passed. This is the gate an earlier chapter must
 * clear to unlock the next one.
 */
export function isChapterFullyDone(
  chapter: { id: string; lessons: { id: string }[]; hasQuiz: boolean },
  completed: Set<string>,
  passedQuizzes: Set<string>,
): boolean {
  const lessonsDone = chapter.lessons.every((l) => completed.has(l.id));
  const quizDone = !chapter.hasQuiz || passedQuizzes.has(chapter.id);
  return lessonsDone && quizDone;
}

/**
 * Which chapters are unlocked, in order. A chapter is unlocked once every earlier
 * chapter is fully done — all its lessons complete and its quiz (if any) passed
 * (the first chapter is always unlocked; earlier chapters with no lessons and no
 * quiz don't block later ones). Drives sequential "finish this chapter before the
 * next" gating in the lesson viewer.
 */
export function chapterUnlockFlags(
  chapters: { id: string; lessons: { id: string }[]; hasQuiz: boolean }[],
  completed: Set<string>,
  passedQuizzes: Set<string>,
): boolean[] {
  let earlierAllDone = true;
  return chapters.map((chapter) => {
    const unlocked = earlierAllDone;
    if (earlierAllDone) {
      earlierAllDone = isChapterFullyDone(chapter, completed, passedQuizzes);
    }
    return unlocked;
  });
}
