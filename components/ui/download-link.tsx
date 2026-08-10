"use client";

import * as React from "react";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * A download anchor that shows a brief spinner after being clicked. Browser
 * downloads emit no completion event, so the spinner is shown for a short,
 * fixed window purely as "your click registered" feedback.
 */
export function DownloadLink({
  className,
  children,
  onClick,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const [busy, setBusy] = useState(false);

  return (
    <a
      {...props}
      onClick={(e) => {
        setBusy(true);
        window.setTimeout(() => setBusy(false), 2000);
        onClick?.(e);
      }}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      {busy && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </a>
  );
}
