import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Course,
  Chapter,
  Lesson,
  CourseEnrollment,
  CourseFile,
  QuizQuestion,
  QuizOption,
  Database,
} from "@/lib/db/types";

type Db = SupabaseClient<Database>;

export type LessonLite = Pick<Lesson, "id" | "chapter_id" | "title" | "position">;
/** A chapter with its lessons and whether it carries a quiz (drives gating). */
export type ChapterWithLessons = Chapter & {
  lessons: LessonLite[];
  hasQuiz: boolean;
};

/** A quiz option shown to learners — never includes `is_correct`. */
export type QuizOptionLite = Pick<QuizOption, "id" | "label" | "position">;
export type QuizQuestionWithOptions = Pick<
  QuizQuestion,
  "id" | "prompt" | "position"
> & { options: QuizOptionLite[] };

export interface CourseTree {
  course: Course;
  chapters: ChapterWithLessons[];
  counts: { chapters: number; lessons: number; pdfs: number };
  /** Lessons flattened in display order — handy for "first lesson" / prev-next. */
  orderedLessons: LessonLite[];
}

export interface MyCourseItem {
  course: Course;
  done: number;
  total: number;
  completedAt: string | null;
}

/**
 * Published courses for the employee-facing library, optionally filtered by
 * category and a title search. Ordered newest-published first.
 *
 * The status filter is explicit (not left to RLS) so an admin browsing the
 * library sees the same published-only view employees do; drafts live in the
 * admin area.
 */
export async function listPublishedCourses(
  supabase: Db,
  { category, q }: { category?: string; q?: string } = {},
): Promise<Course[]> {
  let query = supabase
    .from("courses")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (category) query = query.eq("category", category);
  if (q) query = query.ilike("title", `%${q}%`);

  const { data } = await query;
  return (data ?? []) as Course[];
}

/** Distinct, non-empty categories among published courses, for the filter. */
export async function listPublishedCategories(supabase: Db): Promise<string[]> {
  const { data } = await supabase
    .from("courses")
    .select("category")
    .eq("status", "published")
    .not("category", "is", null);
  const set = new Set<string>();
  for (const row of data ?? []) {
    if (row.category) set.add(row.category);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * A course with its chapters (ordered), each chapter's lessons (ordered), and
 * the counts shown in the "This course includes" panel. Relies on RLS: returns
 * a draft only for admins. Returns null if the course isn't visible.
 */
export async function getCourseTree(
  supabase: Db,
  courseId: string,
): Promise<CourseTree | null> {
  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single<Course>();
  if (!course) return null;

  const { data: chapterRows } = await supabase
    .from("chapters")
    .select("*")
    .eq("course_id", courseId)
    .order("position", { ascending: true });
  const chapters = (chapterRows ?? []) as Chapter[];

  const { data: lessonRows } = await supabase
    .from("lessons")
    .select("id, chapter_id, title, position")
    .eq("course_id", courseId)
    .order("position", { ascending: true });
  const lessons = (lessonRows ?? []) as LessonLite[];

  const lessonIds = lessons.map((l) => l.id);
  let pdfs = 0;
  if (lessonIds.length > 0) {
    const { count } = await supabase
      .from("lesson_files")
      .select("id", { count: "exact", head: true })
      .in("lesson_id", lessonIds);
    pdfs = count ?? 0;
  }

  // Which chapters carry a quiz (any question) — one cheap query, tallied in JS.
  const chapterIds = chapters.map((ch) => ch.id);
  const chaptersWithQuiz = new Set<string>();
  if (chapterIds.length > 0) {
    const { data: quizRows } = await supabase
      .from("quiz_questions")
      .select("chapter_id")
      .in("chapter_id", chapterIds);
    for (const row of quizRows ?? []) chaptersWithQuiz.add(row.chapter_id);
  }

  const byChapter = new Map<string, LessonLite[]>();
  for (const lesson of lessons) {
    const list = byChapter.get(lesson.chapter_id) ?? [];
    list.push(lesson);
    byChapter.set(lesson.chapter_id, list);
  }
  const withLessons: ChapterWithLessons[] = chapters.map((ch) => ({
    ...ch,
    lessons: byChapter.get(ch.id) ?? [],
    hasQuiz: chaptersWithQuiz.has(ch.id),
  }));

  // Flatten in chapter order, then lesson order within each chapter.
  const orderedLessons = withLessons.flatMap((ch) => ch.lessons);

  return {
    course,
    chapters: withLessons,
    counts: { chapters: chapters.length, lessons: lessons.length, pdfs },
    orderedLessons,
  };
}

/** The current user's enrollment for a course, or null if not joined. */
export async function getEnrollment(
  supabase: Db,
  userId: string,
  courseId: string,
): Promise<CourseEnrollment | null> {
  const { data } = await supabase
    .from("course_enrollments")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle<CourseEnrollment>();
  return data ?? null;
}

/** Set of lesson ids the user has marked complete within a course. */
export async function getCompletedLessonIds(
  supabase: Db,
  userId: string,
  courseId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("lesson_progress")
    .select("lesson_id")
    .eq("user_id", userId)
    .eq("course_id", courseId);
  return new Set((data ?? []).map((r) => r.lesson_id));
}

/** Set of chapter ids whose quiz the user has passed within a course. */
export async function getPassedChapterIds(
  supabase: Db,
  userId: string,
  courseId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("chapter_quiz_passes")
    .select("chapter_id")
    .eq("user_id", userId)
    .eq("course_id", courseId);
  return new Set((data ?? []).map((r) => r.chapter_id));
}

/**
 * A chapter's quiz: ordered questions, each with its ordered options. Deliberately
 * omits `is_correct` so it never reaches the learner's browser — grading happens
 * server-side in submitChapterQuiz. Returns [] when the chapter has no quiz.
 */
export async function getChapterQuiz(
  supabase: Db,
  chapterId: string,
): Promise<QuizQuestionWithOptions[]> {
  const { data: questionRows } = await supabase
    .from("quiz_questions")
    .select("id, prompt, position")
    .eq("chapter_id", chapterId)
    .order("position", { ascending: true });
  const questions = (questionRows ?? []) as Pick<
    QuizQuestion,
    "id" | "prompt" | "position"
  >[];
  if (questions.length === 0) return [];

  const { data: optionRows } = await supabase
    .from("quiz_options")
    .select("id, question_id, label, position")
    .in(
      "question_id",
      questions.map((q) => q.id),
    )
    .order("position", { ascending: true });

  const byQuestion = new Map<string, QuizOptionLite[]>();
  for (const opt of optionRows ?? []) {
    const list = byQuestion.get(opt.question_id) ?? [];
    list.push({ id: opt.id, label: opt.label, position: opt.position });
    byQuestion.set(opt.question_id, list);
  }
  return questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    position: q.position,
    options: byQuestion.get(q.id) ?? [],
  }));
}

/** The learner's saved note text for a lesson (empty string if none). */
export async function getLessonNote(
  supabase: Db,
  userId: string,
  lessonId: string,
): Promise<string> {
  const { data } = await supabase
    .from("lesson_notes")
    .select("content")
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  return data?.content ?? "";
}

/** Course-level PDF documents (id, name, size), oldest first. */
export async function getCourseFiles(
  supabase: Db,
  courseId: string,
): Promise<Pick<CourseFile, "id" | "file_name" | "file_size">[]> {
  const { data } = await supabase
    .from("course_files")
    .select("id, file_name, file_size")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true });
  return (data ?? []) as Pick<CourseFile, "id" | "file_name" | "file_size">[];
}

/**
 * The user's enrolled courses split into in-progress vs completed, each with a
 * done/total lesson tally for a progress bar. A few small queries tallied in JS
 * keep this simple and avoid embedded-join typing.
 */
export async function getMyCourses(
  supabase: Db,
  userId: string,
): Promise<{ inProgress: MyCourseItem[]; completed: MyCourseItem[] }> {
  const { data: enrollRows } = await supabase
    .from("course_enrollments")
    .select("course_id, completed_at, enrolled_at")
    .eq("user_id", userId)
    .order("enrolled_at", { ascending: false });
  const enrollments = enrollRows ?? [];
  if (enrollments.length === 0) return { inProgress: [], completed: [] };

  const courseIds = enrollments.map((e) => e.course_id);

  const [{ data: courseRows }, { data: lessonRows }, { data: progressRows }] =
    await Promise.all([
      supabase.from("courses").select("*").in("id", courseIds),
      supabase.from("lessons").select("id, course_id").in("course_id", courseIds),
      supabase
        .from("lesson_progress")
        .select("course_id")
        .eq("user_id", userId)
        .in("course_id", courseIds),
    ]);

  const courseById = new Map<string, Course>(
    ((courseRows ?? []) as Course[]).map((c) => [c.id, c]),
  );
  const totalByCourse = new Map<string, number>();
  for (const l of lessonRows ?? []) {
    totalByCourse.set(l.course_id, (totalByCourse.get(l.course_id) ?? 0) + 1);
  }
  const doneByCourse = new Map<string, number>();
  for (const p of progressRows ?? []) {
    doneByCourse.set(p.course_id, (doneByCourse.get(p.course_id) ?? 0) + 1);
  }

  const inProgress: MyCourseItem[] = [];
  const completed: MyCourseItem[] = [];
  for (const e of enrollments) {
    const course = courseById.get(e.course_id);
    if (!course) continue; // course deleted or no longer visible
    const item: MyCourseItem = {
      course,
      done: doneByCourse.get(e.course_id) ?? 0,
      total: totalByCourse.get(e.course_id) ?? 0,
      completedAt: e.completed_at,
    };
    (e.completed_at ? completed : inProgress).push(item);
  }
  return { inProgress, completed };
}
