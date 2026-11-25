import { describe, expect, it } from "vitest";
import { answersForRetry, gradeQuiz, quizScorePercent } from "./quiz-grade";

const correct = new Map([
  ["q1", "a1"],
  ["q2", "b2"],
  ["q3", "c1"],
]);

describe("gradeQuiz", () => {
  it("passes when every answer is right", () => {
    const answers: Record<string, string> = { q1: "a1", q2: "b2", q3: "c1" };
    const grade = gradeQuiz(["q1", "q2", "q3"], correct, (q) => answers[q] ?? null);
    expect(grade).toMatchObject({ total: 3, correctCount: 3, passed: true });
    expect(grade.results.every((r) => r.correct)).toBe(true);
  });

  it("marks wrong and skipped questions, keeping the given order", () => {
    const answers: Record<string, string> = { q1: "a2", q3: "c1" };
    const grade = gradeQuiz(["q1", "q2", "q3"], correct, (q) => answers[q] ?? null);
    expect(grade.passed).toBe(false);
    expect(grade.correctCount).toBe(1);
    expect(grade.results).toEqual([
      { questionId: "q1", selectedOptionId: "a2", correct: false },
      { questionId: "q2", selectedOptionId: null, correct: false },
      { questionId: "q3", selectedOptionId: "c1", correct: true },
    ]);
  });

  it("treats an empty answer as skipped", () => {
    const grade = gradeQuiz(["q1"], correct, () => "");
    expect(grade.results[0]).toEqual({ questionId: "q1", selectedOptionId: null, correct: false });
  });

  it("never passes a question without a correct option", () => {
    const grade = gradeQuiz(["qx"], correct, () => "anything");
    expect(grade.passed).toBe(false);
  });

  it("never passes an empty quiz", () => {
    expect(gradeQuiz([], correct, () => null).passed).toBe(false);
  });
});

describe("quizScorePercent", () => {
  it("rounds to a whole number", () => {
    expect(quizScorePercent({ total: 3, correctCount: 2 })).toBe(67);
    expect(quizScorePercent({ total: 4, correctCount: 4 })).toBe(100);
  });

  it("is 0 without questions", () => {
    expect(quizScorePercent({ total: 0, correctCount: 0 })).toBe(0);
  });
});

describe("answersForRetry", () => {
  it("keeps right answers and clears wrong ones", () => {
    const answers: Record<string, string> = { q1: "a2", q2: "b2", q3: "c1" };
    const grade = gradeQuiz(["q1", "q2", "q3"], correct, (q) => answers[q] ?? null);
    expect(answersForRetry(answers, grade)).toEqual({ q2: "b2", q3: "c1" });
  });

  it("drops an answer changed after grading", () => {
    const graded: Record<string, string> = { q1: "a1" };
    const grade = gradeQuiz(["q1"], correct, (q) => graded[q] ?? null);
    expect(answersForRetry({ q1: "a3" }, grade)).toEqual({});
  });
});
