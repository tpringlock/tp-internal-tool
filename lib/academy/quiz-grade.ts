/**
 * Chapter quiz grading, pure so the submit action and the result screen agree.
 *
 * Only whether each answer was right is returned, never which option is the
 * correct one: a learner who failed retries the wrong questions on their own.
 */

export interface QuizQuestionResult {
  questionId: string;
  /** The option the learner picked, or null when the question was skipped. */
  selectedOptionId: string | null;
  correct: boolean;
}

export interface QuizGrade {
  total: number;
  correctCount: number;
  /** A pass needs every question right (and at least one question). */
  passed: boolean;
  /** One entry per question, in the order given. */
  results: QuizQuestionResult[];
}

/**
 * Grade the answers against the correct option of each question. A question
 * without a correct option configured can never be answered right.
 */
export function gradeQuiz(
  questionIds: readonly string[],
  correctByQuestion: ReadonlyMap<string, string>,
  answerFor: (questionId: string) => string | null,
): QuizGrade {
  const results = questionIds.map((questionId) => {
    const selected = answerFor(questionId) || null;
    const expected = correctByQuestion.get(questionId);
    return {
      questionId,
      selectedOptionId: selected,
      correct: selected !== null && expected !== undefined && selected === expected,
    };
  });
  const correctCount = results.filter((r) => r.correct).length;
  return {
    total: results.length,
    correctCount,
    passed: results.length > 0 && correctCount === results.length,
    results,
  };
}

/** Whole-number score percentage, 0 when there are no questions. */
export function quizScorePercent(grade: Pick<QuizGrade, "total" | "correctCount">): number {
  if (grade.total <= 0) return 0;
  return Math.round((grade.correctCount / grade.total) * 100);
}

/**
 * Answers to keep when the learner retries: the right ones stay selected, the
 * wrong or skipped ones are cleared so they have to be answered again.
 */
export function answersForRetry(
  answers: Readonly<Record<string, string>>,
  grade: QuizGrade,
): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const r of grade.results) {
    if (r.correct && answers[r.questionId] === r.selectedOptionId) {
      kept[r.questionId] = answers[r.questionId];
    }
  }
  return kept;
}
