import { describe, it, expect } from "vitest";
import {
  isCourseComplete,
  progressPercent,
  chapterUnlockFlags,
} from "./progress";

const chapters = (ids: string[][]) =>
  ids.map((lessonIds) => ({ lessons: lessonIds.map((id) => ({ id })) }));

describe("chapterUnlockFlags", () => {
  it("always unlocks the first chapter", () => {
    const flags = chapterUnlockFlags(chapters([["a"], ["b"]]), new Set());
    expect(flags[0]).toBe(true);
  });

  it("locks a chapter until every earlier lesson is complete", () => {
    const ch = chapters([["a", "b"], ["c"], ["d"]]);
    expect(chapterUnlockFlags(ch, new Set(["a"]))).toEqual([true, false, false]);
    expect(chapterUnlockFlags(ch, new Set(["a", "b"]))).toEqual([
      true,
      true,
      false,
    ]);
    expect(chapterUnlockFlags(ch, new Set(["a", "b", "c"]))).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("does not let an earlier empty chapter block later ones", () => {
    const ch = chapters([[], ["a"]]);
    expect(chapterUnlockFlags(ch, new Set())).toEqual([true, true]);
  });

  it("returns an empty array for a course with no chapters", () => {
    expect(chapterUnlockFlags([], new Set())).toEqual([]);
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
