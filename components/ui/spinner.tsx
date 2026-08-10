import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A small inline loading spinner. Uses `currentColor`, so it inherits the text
 * color of whatever it sits inside (buttons, links, overlays). Size defaults to
 * 1em — pass an `h-*`/`w-*` className to override.
 */
export function Spinner({
  className,
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
      className={cn("h-[1em] w-[1em] animate-spin", className)}
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        className="opacity-25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className="opacity-90"
      />
    </svg>
  );
}
