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
