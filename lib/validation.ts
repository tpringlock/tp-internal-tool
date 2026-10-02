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
  role: z.enum(["admin", "employee", "manager", "accountant", "billing_viewer"]),
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
  // Warehouse name as on MISA (optional; also filled by the price import).
  misa_kho_name: z.string().trim().max(200, "textTooLong").default(""),
  period_start_day: z.coerce.number().int().min(2, "startDayRange").max(28, "startDayRange"),
  contract_start: z
    .union([isoDate, z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  active: z.boolean(),
});

/** Highest daily unit price accepted (VND); keeps qty x days x price a safe integer. */
export const MAX_UNIT_PRICE = 10_000_000;

/** Optional text of a price row: null/absent -> "". */
const priceText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => (v ?? "").trim())
    .pipe(z.string().max(max, "textTooLong"));
/** Empty -> null (HSTT override not set). */
const optionalOverride = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => (v ?? "").trim())
    .pipe(z.string().max(max, "textTooLong"))
    .transform((v) => (v ? v : null));

/** One row of the flat price table (billing_price_lines, 0036), as edited on the contract page. */
export const billingPriceLineSchema = z.object({
  // Same normalisation as the MISA parser (trim, single spaces).
  ma_vt: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "codesRequired").max(50, "textTooLong")),
  ten_vt: priceText(300),
  dvt: priceText(30),
  unit_price: z.number().int("priceInvalid").min(0, "priceInvalid").max(MAX_UNIT_PRICE, "priceInvalid"),
  print_name: optionalOverride(300),
  print_dvt: optionalOverride(30),
  note: priceText(500),
});

export const billingPriceLinesSchema = z.array(billingPriceLineSchema).max(2000);

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

const billingMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "monthInvalid");

/** "Mẫu kỳ" fields (0040): start day 1-28, length 1/3/6/12 months. */
export const periodPresetFields = {
  start_day: z.coerce.number().int("presetStartDayRange").min(1, "presetStartDayRange").max(28, "presetStartDayRange"),
  months: z.coerce
    .number()
    .refine((n): n is 1 | 3 | 6 | 12 => [1, 3, 6, 12].includes(n), "presetMonthsInvalid")
    .transform((n) => n as 1 | 3 | 6 | 12),
};

const computeBase = {
  contract_id: z.string().uuid("chooseContract"),
  /**
   * "months": the active month files covering the period (the normal way);
   * "files": hand-picked legacy multi-month files (fallback).
   */
  source: z.enum(["months", "files"]),
  upload_ids: z.array(z.string().uuid()).max(12),
};

/**
 * Either a preset ("mẫu kỳ") + the month the period ends in, or a custom
 * date range. Either one is a confirmable billing period only when it is
 * exactly the contract's own period (decided by the action).
 */
export const computeRentSchema = z
  .discriminatedUnion("mode", [
    z.object({
      ...computeBase,
      ...periodPresetFields,
      mode: z.literal("preset"),
      month: billingMonth,
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
  ])
  .refine((v) => v.source !== "files" || v.upload_ids.length > 0, {
    message: "chooseUpload",
    path: ["upload_ids"],
  });

/** Most projects one rent report may cover (sanity cap; 200+ warehouses is the normal "all"). */
export const MAX_REPORT_PROJECTS = 2000;

/**
 * Rent report over many projects (read-only): the chosen contracts + a
 * preset and month, or a date range.
 */
export const rentReportSchema = z.discriminatedUnion("mode", [
  z.object({
    contract_ids: z.array(z.string().uuid()).min(1, "chooseProjects").max(MAX_REPORT_PROJECTS),
    ...periodPresetFields,
    mode: z.literal("preset"),
    month: billingMonth,
  }),
  z
    .object({
      contract_ids: z.array(z.string().uuid()).min(1, "chooseProjects").max(MAX_REPORT_PROJECTS),
      mode: z.literal("range"),
      date_from: isoDate,
      date_to: isoDate,
    })
    .refine((v) => v.date_to >= v.date_from, { message: "rangeOrder", path: ["date_to"] })
    .refine(
      (v) => (Date.parse(v.date_to) - Date.parse(v.date_from)) / 86_400_000 < MAX_RANGE_DAYS,
      { message: "rangeTooLong", path: ["date_to"] },
    ),
]);

/** Add or edit a period preset (admin). */
export const periodPresetSchema = z.object({
  ...periodPresetFields,
  name: z.string().trim().min(1, "presetNameRequired").max(80, "textTooLong"),
  sort_order: z.coerce.number().int().min(0).max(100_000).default(0),
  active: z.boolean(),
});

// --- HSTT (0038) ----------------------------------------------------------

/** Largest amount accepted in HSTT money fields (VND); far below 2^53. */
export const MAX_HSTT_AMOUNT = 1_000_000_000_000_000;

/** Optional text: null/absent -> "", trimmed, max length. */
const hsttText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => (v ?? "").trim())
    .pipe(z.string().max(max, "textTooLong"));

/** Whole VND typed in a form ("1.550.000.000"); empty -> null. Same rule as parseMoney. */
const moneyField = z
  .string()
  .nullish()
  .transform((v, ctx) => {
    const s = (v ?? "").replace(/[\s.,]/g, "");
    if (s === "") return null;
    if (!/^-?\d+$/.test(s) || Math.abs(Number(s)) > MAX_HSTT_AMOUNT) {
      ctx.addIssue({ code: "custom", message: "moneyInvalid" });
      return z.NEVER;
    }
    return Number(s);
  });

const wholeAmount = z
  .number()
  .int("moneyInvalid")
  .min(-MAX_HSTT_AMOUNT, "moneyInvalid")
  .max(MAX_HSTT_AMOUNT, "moneyInvalid");

/** Bên B (company_profile, 0038). */
export const companyProfileSchema = z.object({
  ten_in_hoa: z.string().trim().min(1, "nameRequired").max(300, "textTooLong"),
  ten_2_dong: hsttText(300),
  ten_thuong: hsttText(300),
  ten_thu_huong: hsttText(300),
  dia_chi: hsttText(500),
  dia_chi_ngan: hsttText(300),
  dien_thoai: hsttText(100),
  so_tk: hsttText(100),
  ngan_hang: hsttText(300),
  mst: hsttText(50),
  dai_dien: hsttText(200),
  chuc_vu: hsttText(200),
  noi_lap: hsttText(100),
});

/** Bên A (billing_customers, 0038). */
export const billingCustomerSchema = z.object({
  ten_in_hoa: z.string().trim().min(1, "nameRequired").max(300, "textTooLong"),
  ten_thuong: hsttText(300),
  ten_rut_gon: hsttText(100),
  dia_chi: hsttText(500),
  dien_thoai: hsttText(100),
  so_tk: hsttText(100),
  ngan_hang: hsttText(300),
  mst: hsttText(50),
  dai_dien: hsttText(200),
  chuc_vu: hsttText(200),
  note: hsttText(1000),
});

const monthOrEmpty = z
  .union([z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "monthInvalid"), z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));

/** HSTT fields of a contract (billing_contract_hstt, 0038). */
export const contractHsttSchema = z
  .object({
    contract_id: z.string().uuid(),
    customer_id: z
      .union([z.string().uuid(), z.literal("")])
      .nullish()
      .transform((v) => (v ? v : null)),
    contract_type: z.string().trim().min(1, "contractTypeRequired").max(100, "textTooLong"),
    contract_date: z
      .union([isoDate, z.literal("")])
      .nullish()
      .transform((v) => (v ? v : null)),
    du_an_ten: hsttText(200),
    du_an_dia_chi: hsttText(300),
    can_cu_override: hsttText(1000).transform((v) => (v ? v : null)),
    vat_percent: z.coerce.number().min(0, "vatRange").max(100, "vatRange"),
    opening_debt: moneyField,
    opening_debt_month: monthOrEmpty,
  })
  .refine((v) => (v.opening_debt === null) === (v.opening_debt_month === null), {
    message: "openingPair",
    path: ["opening_debt_month"],
  });

/** Transport price list of a contract (JSON from the editor). */
export const transportPricesSchema = z
  .array(
    z.object({
      id: z.string().uuid().nullish(),
      name: z.string().trim().min(1, "nameRequired").max(200, "textTooLong"),
      unit: z.string().trim().min(1, "unitRequired").max(30, "textTooLong"),
      unit_price: z.number().int("moneyInvalid").min(0, "moneyInvalid").max(MAX_HSTT_AMOUNT, "moneyInvalid"),
      active: z.boolean(),
    }),
  )
  .max(50);

/** Advances of a contract + the note of the ĐCCN line (JSON from the editor). */
export const advancesSchema = z.object({
  note: hsttText(300),
  items: z
    .array(
      z.object({
        id: z.string().uuid().nullish(),
        amount: wholeAmount.refine((v) => v !== 0, "moneyInvalid"),
        paid_on: z
          .union([isoDate, z.literal("")])
          .nullish()
          .transform((v) => (v ? v : null)),
      }),
    )
    .max(100),
});

/** Per-period inputs of a billing month (JSON from the calculation page). */
export const periodInputsSchema = z.object({
  calc_id: z.string().uuid(),
  paid_in_period: wholeAmount,
  opening_debt_override: wholeAmount.nullable(),
  note: hsttText(500),
  transport: z
    .array(
      z.object({
        transport_price_id: z.string().uuid(),
        trips: z.number().int("tripsInvalid").min(0, "tripsInvalid").max(100_000, "tripsInvalid").nullable(),
        cumulative_trips: z.number().int("tripsInvalid").min(0, "tripsInvalid").max(100_000, "tripsInvalid").nullable(),
        charge_mode: z.enum(["now", "end_of_term"]),
        note: hsttText(500),
      }),
    )
    .max(50),
  deductions: z
    .array(
      z.object({
        label: z.string().trim().min(1, "labelRequired").max(300, "textTooLong"),
        amount: wholeAmount.refine((v) => v > 0, "moneyInvalid"),
      }),
    )
    .max(20),
});

export type PeriodInputsInput = z.infer<typeof periodInputsSchema>;

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
export type BillingPriceLineInput = z.infer<typeof billingPriceLineSchema>;
