"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/error-state";

/**
 * Body of the route-level `error.tsx` files. Never shows `error.message`: in
 * production Next replaces server errors with a generic message plus a
 * `digest`, which is what support can match against the server logs.
 */
export function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      Icon={TriangleAlert}
      title={t("title")}
      body={t("body")}
      detail={error.digest ? t("reference", { code: error.digest }) : undefined}
    >
      <Button onClick={reset}>{t("retry")}</Button>
      <Link
        href="/"
        className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 hover:border-primary hover:bg-primary hover:text-white"
      >
        {t("home")}
      </Link>
    </ErrorState>
  );
}
