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
