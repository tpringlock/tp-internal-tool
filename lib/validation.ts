import { z, type ZodError } from "zod";

// Validation messages are stored as translation keys (resolved against the
// "Validation" message namespace by `translateFieldErrors` at parse time, in
// the server action where the request locale is available).

/** Shared password policy for new/changed passwords. */
export const passwordSchema = z
  .string()
  .min(8, "passwordMin")
  .regex(/[a-zA-Z]/, "passwordLetter")
  .regex(/[0-9]/, "passwordNumber");

export const loginSchema = z.object({
  email: z.string().email("emailInvalid"),
  password: z.string().min(1, "passwordRequired"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("emailInvalid"),
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "passwordsNoMatch",
    path: ["confirm"],
  });

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1, "nameRequired").max(120, "nameTooLong"),
});

export const changePasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "passwordsNoMatch",
    path: ["confirm"],
  });

export const createUserSchema = z.object({
  email: z.string().email("emailInvalid"),
  full_name: z.string().trim().min(1, "nameRequired").max(120, "nameTooLong"),
  role: z.enum(["admin", "employee", "manager"]),
  password: passwordSchema,
});

/**
 * Short identifier code used in project/client references and (later) storage
 * paths. Letters, numbers, dashes and underscores; normalised to upper case.
 */
export const codeSchema = z
  .string()
  .trim()
  .min(2, "codeMin")
  .max(20, "codeMax")
  .regex(/^[A-Za-z0-9_-]+$/, "codeFormat")
  .transform((v) => v.toUpperCase());

export const clientSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(120, "nameTooLong"),
  code: codeSchema,
});

export const projectSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(120, "nameTooLong"),
  code: codeSchema,
  client_id: z.string().uuid("chooseClient"),
  status: z.enum(["active", "archived"]),
});

export const memberSchema = z.object({
  project_id: z.string().uuid(),
  user_id: z.string().uuid("chooseUser"),
});

// --- TP Academy ---------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "textTooLong")
    .optional()
    .transform((v) => (v ? v : null));

export const courseSchema = z.object({
  title: z.string().trim().min(1, "titleRequired").max(160, "titleTooLong"),
  description: optionalText(2000),
  category: z
    .string()
    .trim()
    .max(60, "textTooLong")
    .optional()
    .transform((v) => (v ? v : null)),
  instructor: z
    .string()
    .trim()
    .max(120, "textTooLong")
    .optional()
    .transform((v) => (v ? v : null)),
});

export const chapterSchema = z.object({
  title: z.string().trim().min(1, "titleRequired").max(160, "titleTooLong"),
});

export const lessonSchema = z.object({
  title: z.string().trim().min(1, "titleRequired").max(160, "titleTooLong"),
  description: optionalText(2000),
  // Empty video field is allowed (a lesson may be PDF-only); a non-empty value
  // must be a supported, parseable YouTube/Vimeo URL — checked in the action.
  video_url: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
});

/**
 * A single-correct quiz question: a prompt plus 2..6 option labels and the index
 * of the correct one. Options come in as an ordered array; the action persists
 * them and marks `correct_index` as is_correct.
 */
export const quizQuestionSchema = z.object({
  prompt: z.string().trim().min(1, "promptRequired").max(500, "textTooLong"),
  options: z
    .array(z.string().trim().min(1, "optionRequired").max(300, "textTooLong"))
    .min(2, "optionsMin")
    .max(6, "optionsMax"),
  correct_index: z.coerce
    .number()
    .int()
    .min(0, "correctRequired"),
});

/** A learner's lesson note. Empty is allowed (clearing a note). */
export const lessonNoteSchema = z.object({
  content: z.string().max(10000, "textTooLong"),
});

/** Minimal shape of a next-intl translator (from useTranslations/getTranslations). */
type Translator = ((key: string) => string) & { has: (key: string) => boolean };

/**
 * Flatten a ZodError into per-field messages, translating each message via the
 * "Validation" namespace. Messages that aren't known keys (e.g. Zod defaults)
 * pass through unchanged.
 */
export function translateFieldErrors(
  t: Translator,
  error: ZodError,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(error.flatten().fieldErrors)) {
    if (messages) {
      out[field] = (messages as string[]).map((m) => (t.has(m) ? t(m) : m));
    }
  }
  return out;
}

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ClientInput = z.infer<typeof clientSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type CourseInput = z.infer<typeof courseSchema>;
export type LessonInput = z.infer<typeof lessonSchema>;
export type QuizQuestionInput = z.infer<typeof quizQuestionSchema>;
export type LessonNoteInput = z.infer<typeof lessonNoteSchema>;
