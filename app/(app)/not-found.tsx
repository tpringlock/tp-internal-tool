import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ErrorState } from "@/components/error-state";

// Rendered inside the (app) layout for notFound() calls and unknown paths of
// signed-in users, so the top nav stays.
export default async function NotFound() {
  const t = await getTranslations("Errors");
  return (
    <ErrorState Icon={FileQuestion} title={t("notFoundTitle")} body={t("notFoundBody")}>
      <Link
        href="/"
        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
      >
        {t("home")}
      </Link>
    </ErrorState>
  );
}
