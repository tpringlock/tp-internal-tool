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
  role: z.enum(["admin", "employee"]),
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
