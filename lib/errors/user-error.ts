/**
 * Decide what a user may see for an error coming back from Supabase
 * (PostgREST, Auth or Storage). Server actions used to return
 * `error.message` as is, which put raw Postgres text on screen
 * ("duplicate key value violates unique constraint …", constraint and column
 * names). Pure: the wording lives in messages/*.json (Errors namespace), see
 * lib/errors/user-error-server.ts.
 */

export type UserErrorKind =
  /** Written for the user (our own `raise exception`): show it unchanged. */
  | "passthrough"
  | "unique"
  | "in_use"
  | "forbidden"
  | "invalid"
  | "auth_same_password"
  | "auth_weak_password"
  | "auth_email_exists"
  | "auth_rate_limit"
  | "unknown";

export interface SupabaseErrorLike {
  message?: string | null;
  /** SQLSTATE / PGRST code (PostgREST) or an auth error code. */
  code?: string | null;
  /** HTTP status (Auth, Storage). */
  status?: number | null;
}

export interface UserErrorDecision {
  kind: UserErrorKind;
  /** The original text, only for "passthrough". */
  message?: string;
  /** Code to quote to an administrator, for "unknown". */
  code?: string;
}

const VIETNAMESE = /[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/i;

/** Text Postgres / PostgREST produce themselves: never meant for end users. */
const NATIVE: [RegExp, UserErrorKind][] = [
  [/duplicate key value violates unique constraint/i, "unique"],
  [/violates foreign key constraint/i, "in_use"],
  [/row-level security|permission denied for/i, "forbidden"],
  [/violates (check|not-null) constraint|null value in column|invalid input (syntax|value)|value too long for type/i, "invalid"],
];

const BY_CODE: Record<string, UserErrorKind> = {
  "23505": "unique",
  "23503": "in_use",
  "42501": "forbidden",
  PGRST301: "forbidden",
  "23502": "invalid",
  "23514": "invalid",
  "22P02": "invalid",
  "22001": "invalid",
  "22023": "invalid",
  // Supabase Auth
  same_password: "auth_same_password",
  weak_password: "auth_weak_password",
  email_exists: "auth_email_exists",
  user_already_exists: "auth_email_exists",
  over_email_send_rate_limit: "auth_rate_limit",
  over_request_rate_limit: "auth_rate_limit",
};

export function classifyError(error: SupabaseErrorLike | null | undefined): UserErrorDecision {
  const message = (error?.message ?? "").trim();
  const code = error?.code ? String(error.code) : undefined;

  for (const [pattern, kind] of NATIVE) {
    if (pattern.test(message)) return { kind };
  }
  // Our own PL/pgSQL `raise exception` texts are written for the user: plain
  // P0001, or any SQLSTATE with a Vietnamese message (several functions raise
  // with errcode 42501 / 23514 / 23503 and a specific explanation).
  if (message && (code === "P0001" || VIETNAMESE.test(message))) {
    return { kind: "passthrough", message };
  }
  if (code && BY_CODE[code]) return { kind: BY_CODE[code] };
  if (/already (been )?registered/i.test(message)) return { kind: "auth_email_exists" };
  if (/different from the old password/i.test(message)) return { kind: "auth_same_password" };
  if (error?.status === 429) return { kind: "auth_rate_limit" };
  return { kind: "unknown", code };
}

/** What supabase-js Storage returns: `statusCode` is a string ("413"). */
export interface StorageErrorLike {
  message?: string | null;
  status?: number | null;
  statusCode?: string | number | null;
}

/**
 * Storage error text ("The resource already exists", bucket and object
 * names, "new row violates row-level security policy") is never shown. Only
 * one case is worth telling the user about: the file is too large.
 */
export function classifyStorageError(error: StorageErrorLike | null | undefined): "too_large" | "unknown" {
  const status = Number(error?.statusCode ?? error?.status ?? 0);
  if (status === 413) return "too_large";
  if (/exceeded the maximum allowed size|payload too large|entity too large/i.test(error?.message ?? "")) {
    return "too_large";
  }
  return "unknown";
}

/**
 * True for text we wrote for the user ourselves: the app's thrown errors
 * (BillingError, MisaParseError, PriceLinesError, period checks…) are all in
 * Vietnamese, while database, Storage, network and runtime errors are not.
 */
export function isUserFacingMessage(message: string | null | undefined): message is string {
  return !!message && VIETNAMESE.test(message);
}

/** The message of a thrown error if it was written for the user, else null. */
export function ownErrorMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message.trim() : null;
  return isUserFacingMessage(message) ? message : null;
}
