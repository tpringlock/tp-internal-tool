import "server-only";
import { getTranslations } from "next-intl/server";
import { classifyError, type SupabaseErrorLike } from "./user-error";

/**
 * The text a server action may put in `FormState.error` for a Supabase error.
 * The original error is written to the server log (Vercel logs), never sent
 * to the browser, unless it is one of our own user-facing messages.
 *
 *   if (error) return { error: await userError(error) };
 */
export async function userError(error: SupabaseErrorLike | null | undefined): Promise<string> {
  const decision = classifyError(error);
  if (decision.kind === "passthrough" && decision.message) return decision.message;

  console.error("[action-error]", {
    kind: decision.kind,
    code: error?.code ?? null,
    status: error?.status ?? null,
    message: error?.message ?? null,
  });

  const t = await getTranslations("Errors");
  switch (decision.kind) {
    case "unique":
      return t("dbUnique");
    case "in_use":
      return t("dbInUse");
    case "forbidden":
      return t("dbForbidden");
    case "invalid":
      return t("dbInvalid");
    case "auth_same_password":
      return t("authSamePassword");
    case "auth_weak_password":
      return t("authWeakPassword");
    case "auth_email_exists":
      return t("authEmailExists");
    case "auth_rate_limit":
      return t("authRateLimit");
    default:
      return decision.code ? t("dbUnknownCode", { code: decision.code }) : t("dbUnknown");
  }
}
