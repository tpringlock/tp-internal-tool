"use client";

import { RouteError } from "@/components/route-error";

// Boundary for the routes outside (app): login, password reset, public share pages.
export default function Error(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <RouteError {...props} />
    </div>
  );
}
