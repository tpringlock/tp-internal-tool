import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

interface PaginationProps {
  /** Current page (1-based). */
  page: number;
  /** Total number of pages. */
  totalPages: number;
  /** Total number of items across all pages. */
  total: number;
  /** Builds the href for a given page, preserving any active filters. */
  hrefForPage: (page: number) => string;
}

/**
 * Presentational pagination control. Renders nothing when there is a single
 * page. Mirrors the pattern originally used on the admin activity log.
 */
export async function Pagination({
  page,
  totalPages,
  total,
  hrefForPage,
}: PaginationProps) {
  if (totalPages <= 1) return null;
  const t = await getTranslations("Pagination");

  return (
    <div className="flex items-center justify-between text-sm text-slate-500">
      <span>{t("pageOf", { page, total: totalPages, count: total })}</span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={hrefForPage(page - 1)}>
            <Button variant="secondary" size="sm">
              {t("previous")}
            </Button>
          </Link>
        )}
        {page < totalPages && (
          <Link href={hrefForPage(page + 1)}>
            <Button variant="secondary" size="sm">
              {t("next")}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
