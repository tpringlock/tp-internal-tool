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
  role: z.enum(["admin", "employee", "manager", "accountant"]),
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

/** Optional free-text field; empty submissions become null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "textTooLong")
    .optional()
    .transform((v) => (v ? v : null));

export const clientSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(120, "nameTooLong"),
  code: codeSchema,
  tax_code: optionalText(20),
  address: optionalText(300),
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

// --- Billing (Tính hóa đơn tự động) ------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateInvalid");
const misaCode = z.string().trim().min(1).max(50, "textTooLong");

export const billingContractSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "codeMin")
    .max(40, "codeMax40")
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "billingCodeFormat"),
  customer_name: z.string().trim().min(1, "nameRequired").max(200, "nameTooLong"),
  project_name: z.string().trim().min(1, "nameRequired").max(200, "nameTooLong"),
  contract_no: z.string().trim().max(100, "textTooLong"),
  // Compared with the "Mã kho" in the MISA file: no case change, but runs of
  // spaces collapse to one, as misa-parser's normalizeCode does.
  misa_kho: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "misaKhoRequired").max(50, "textTooLong")),
  period_start_day: z.coerce.number().int().min(2, "startDayRange").max(28, "startDayRange"),
  contract_start: z
    .union([isoDate, z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  active: z.boolean(),
});

export const billingItemSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(200, "nameTooLong"),
  unit: z.string().trim().min(1, "unitRequired").max(20, "textTooLong"),
  // Integer VND per day; the cap keeps qty x days x price a safe integer.
  unit_price: z.number().int("priceInvalid").min(0, "priceInvalid").max(10_000_000, "priceInvalid"),
  ma_hang: z.array(misaCode).min(1, "codesRequired"),
});

export const billingContractConfigSchema = z.object({
  items: z.array(billingItemSchema).max(200),
  excluded: z.array(misaCode).max(200),
});

export const billingExcludedRangeSchema = z
  .object({
    contract_id: z
      .union([z.string().uuid(), z.literal("")])
      .optional()
      .transform((v) => (v ? v : null)),
    date_from: isoDate,
    date_to: isoDate,
    reason: z.string().trim().min(1, "reasonRequired").max(200, "textTooLong"),
  })
  .refine((v) => v.date_to >= v.date_from, { message: "rangeOrder", path: ["date_to"] });

/** Excel comparison (admin): MISA files + a date range, no contract. */
export const compareDemoSchema = z
  .object({
    upload_ids: z.array(z.string().uuid()).min(1, "chooseUpload").max(12),
    date_from: isoDate,
    date_to: isoDate,
  })
  .refine((v) => v.date_to >= v.date_from, { message: "rangeOrder", path: ["date_to"] });

/** Longest custom range accepted (a sanity cap; files must still cover it). */
export const MAX_RANGE_DAYS = 400;

const computeBase = {
  contract_id: z.string().uuid("chooseContract"),
  upload_ids: z.array(z.string().uuid()).min(1, "chooseUpload").max(12),
};

/**
 * Either a billing month (the 26 -> 25 period used for the payment dossier,
 * confirmable) or a custom date range (quick look, never confirmable).
 */
export const computeRentSchema = z.discriminatedUnion("mode", [
  z.object({
    ...computeBase,
    mode: z.literal("month"),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "monthInvalid"),
  }),
  z
    .object({
      ...computeBase,
      mode: z.literal("range"),
      date_from: isoDate,
      date_to: isoDate,
    })
    .refine((v) => v.date_to >= v.date_from, { message: "rangeOrder", path: ["date_to"] })
    .refine(
      (v) =>
        (Date.parse(v.date_to) - Date.parse(v.date_from)) / 86_400_000 < MAX_RANGE_DAYS,
      { message: "rangeTooLong", path: ["date_to"] },
    ),
]);

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
export type BillingContractInput = z.infer<typeof billingContractSchema>;
export type BillingItemInput = z.infer<typeof billingItemSchema>;
