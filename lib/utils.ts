import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, de-duplicating Tailwind utilities. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Return `path` only if it is a same-origin relative path, else the fallback.
 * Rejects absolute URLs, protocol-relative `//host` and `/\host` (browsers
 * normalise backslashes to slashes), so redirect targets built from user input
 * can never leave the site.
 */
export function safeInternalPath(path: unknown, fallback = "/"): string {
  const v = typeof path === "string" ? path : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\")
    ? v
    : fallback;
}

/** Pages a signed-in user is bounced away from; never a post-login target. */
const AUTH_PAGES = ["/login", "/forgot-password", "/auth"];
/** Placeholder origin used only to parse a relative path. */
const PARSE_ORIGIN = "http://internal.invalid";

/**
 * Where to send the user after signing in: `next` if it is a safe page of this
 * app, else the fallback (home). On top of safeInternalPath this rejects
 *
 * - the auth pages themselves (`/login`, `/login?next=/login`, nested or not):
 *   redirecting there left the browser on /login while showing the home page;
 * - control characters, whitespace and backslashes anywhere (browsers strip
 *   tabs/newlines, turning `/\t/evil.com` into `//evil.com`);
 * - a path whose percent-decoded form starts with `//` (`/%2F%2Fevil.com`), in
 *   case anything downstream decodes it again.
 *
 * The query string of an accepted target is kept as is (filters, tabs).
 */
export function safeNextPath(path: unknown, fallback = "/"): string {
  const v = safeInternalPath(path, "");
  if (!v) return fallback;
  if (/[\\\u0000-\u0020\u007f]/.test(v)) return fallback;

  let pathname: string;
  try {
    const url = new URL(v, PARSE_ORIGIN);
    if (url.origin !== PARSE_ORIGIN) return fallback;
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return fallback; // malformed escape sequence or unparsable target
  }
  if (pathname.startsWith("//") || pathname.includes("\\")) return fallback;

  const normalized = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  const isAuthPage = AUTH_PAGES.some(
    (p) => normalized === p || normalized.startsWith(`${p}/`),
  );
  return isAuthPage ? fallback : v;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when `value` has the shape of a UUID. Route params that feed a uuid
 * column or RPC argument are checked with this first: Postgres raises on a
 * malformed uuid, which would surface as an error page instead of a 404.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
