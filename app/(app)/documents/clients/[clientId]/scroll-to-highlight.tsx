"use client";

import { useEffect } from "react";

/**
 * Scrolls the highlighted file into view when arriving from a search result.
 * Renders nothing.
 */
export function ScrollToHighlight({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [targetId]);
  return null;
}
