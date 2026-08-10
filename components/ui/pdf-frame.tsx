"use client";

import * as React from "react";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * A PDF `<iframe>` that shows a centered spinner overlay until the embedded
 * document finishes loading, so users don't stare at a blank rectangle while a
 * PDF streams in. Pass the same `className` (sizing/border/rounding) and iframe
 * attributes you'd give a bare `<iframe>`; they're applied to the wrapper so the
 * box keeps its original shape, and the iframe + overlay fill it.
 */
export function PdfFrame({
  className,
  ...props
}: React.IframeHTMLAttributes<HTMLIFrameElement>) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
          <Spinner className="h-6 w-6 text-primary" />
        </div>
      )}
      <iframe
        {...props}
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
