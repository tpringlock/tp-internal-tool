import { describe, it, expect } from "vitest";
import {
  isCourseComplete,
  isCourseCompleteWithQuizzes,
  progressPercent,
  chapterUnlockFlags,
} from "./progress";

// Chapter ids are c0, c1, … so quiz-pass sets can target them by index.
const chapters = (ids: string[][], quizAt: number[] = []) =>
  ids.map((lessonIds, i) => ({
    id: `c${i}`,
    lessons: lessonIds.map((id) => ({ id })),
    hasQuiz: quizAt.includes(i),
  }));

const NO_QUIZ: Set<string> = new Set();

describe("chapterUnlockFlags", () => {
  it("always unlocks the first chapter", () => {
    const flags = chapterUnlockFlags(
      chapters([["a"], ["b"]]),
      new Set(),
      NO_QUIZ,
    );
    expect(flags[0]).toBe(true);
  });

  it("locks a chapter until every earlier lesson is complete", () => {
    const ch = chapters([["a", "b"], ["c"], ["d"]]);
    expect(chapterUnlockFlags(ch, new Set(["a"]), NO_QUIZ)).toEqual([
      true,
      false,
      false,
    ]);
    expect(chapterUnlockFlags(ch, new Set(["a", "b"]), NO_QUIZ)).toEqual([
      true,
      true,
      false,
    ]);
    expect(chapterUnlockFlags(ch, new Set(["a", "b", "c"]), NO_QUIZ)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("keeps the next chapter locked until an earlier quiz is passed", () => {
    // Chapter 0 has a quiz; finishing its lessons alone is not enough.
    const ch = chapters([["a"], ["b"]], [0]);
    expect(chapterUnlockFlags(ch, new Set(["a"]), new Set())).toEqual([
      true,
      false,
    ]);
    expect(chapterUnlockFlags(ch, new Set(["a"]), new Set(["c0"]))).toEqual([
      true,
      true,
    ]);
  });

  it("does not let an earlier empty chapter block later ones", () => {
    const ch = chapters([[], ["a"]]);
    expect(chapterUnlockFlags(ch, new Set(), NO_QUIZ)).toEqual([true, true]);
  });

  it("returns an empty array for a course with no chapters", () => {
    expect(chapterUnlockFlags([], new Set(), NO_QUIZ)).toEqual([]);
  });
});

describe("isCourseCompleteWithQuizzes", () => {
  it("requires every lesson done and every quiz passed", () => {
    const ch = chapters([["a"], ["b"]], [1]);
    // All lessons done but chapter 1's quiz not passed yet.
    expect(
      isCourseCompleteWithQuizzes(ch, new Set(["a", "b"]), new Set()),
    ).toBe(false);
    expect(
      isCourseCompleteWithQuizzes(ch, new Set(["a", "b"]), new Set(["c1"])),
    ).toBe(true);
  });

  it("is not complete when a lesson is unfinished", () => {
    const ch = chapters([["a"], ["b"]]);
    expect(isCourseCompleteWithQuizzes(ch, new Set(["a"]), NO_QUIZ)).toBe(false);
  });

  it("treats a course with no lessons as not complete", () => {
    expect(isCourseCompleteWithQuizzes([], new Set(), NO_QUIZ)).toBe(false);
  });
});

describe("isCourseComplete", () => {
  it("is complete only when every lesson is done", () => {
    expect(isCourseComplete(3, 3)).toBe(true);
    expect(isCourseComplete(3, 2)).toBe(false);
  });

  it("treats a course with no lessons as not complete", () => {
    // An empty course can't be 'finished' — avoids marking placeholder courses done.
    expect(isCourseComplete(0, 0)).toBe(false);
  });

  it("does not over-count if done exceeds total (stale rows)", () => {
    expect(isCourseComplete(2, 5)).toBe(true);
  });
});

describe("progressPercent", () => {
  it("returns whole-number percentages", () => {
    expect(progressPercent(4, 1)).toBe(25);
    expect(progressPercent(3, 3)).toBe(100);
  });

  it("returns 0 when there are no lessons", () => {
    expect(progressPercent(0, 0)).toBe(0);
  });

  it("clamps to 100 and never below 0", () => {
    expect(progressPercent(2, 5)).toBe(100);
    expect(progressPercent(4, -1)).toBe(0);
  });
});
