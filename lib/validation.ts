import { z } from "zod";

/** Shared password policy for new/changed passwords. */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-zA-Z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a number");

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(120),
});

export const changePasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

export const createUserSchema = z.object({
  email: z.string().email("Enter a valid email"),
  full_name: z.string().trim().min(1, "Name is required").max(120),
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
  .min(2, "Code must be at least 2 characters")
  .max(20, "Code must be at most 20 characters")
  .regex(/^[A-Za-z0-9_-]+$/, "Use only letters, numbers, dashes or underscores")
  .transform((v) => v.toUpperCase());

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  code: codeSchema,
});

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  code: codeSchema,
  client_id: z.string().uuid("Choose a client"),
  status: z.enum(["active", "archived"]),
});

export const memberSchema = z.object({
  project_id: z.string().uuid(),
  user_id: z.string().uuid("Choose a user"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ClientInput = z.infer<typeof clientSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
