"use client";

import { RouteError } from "@/components/route-error";

// Segment error boundary: renders inside the (app) layout, so the top nav stays.
export default function Error(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} />;
}
