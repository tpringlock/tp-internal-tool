"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

/** Path segment -> Breadcrumb translation key. Unlisted segments (ids) fall
 *  back to "detail". */
const SEGMENT_LABEL: Record<string, string> = {
  documents: "documents",
  list: "list",
  upload: "upload",
  clients: "customers",
  academy: "academy",
  "my-courses": "myCourses",
  quiz: "quiz",
  admin: "admin",
  users: "users",
  projects: "projects",
  activity: "activity",
  profile: "profile",
  new: "new",
};

/** Cumulative paths that have a real, linkable page. Everything else (dynamic
 *  id segments, index-less groupings like /admin) renders as plain text so we
 *  never link to a route that would 404. */
const NAVIGABLE = new Set([
  "/documents",
  "/documents/list",
  "/documents/upload",
  "/academy",
  "/academy/my-courses",
  "/admin/users",
  "/admin/clients",
  "/admin/projects",
  "/admin/academy",
  "/admin/activity",
  "/profile",
]);

export function PageHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("Breadcrumb");

  // Nothing to show on the home page.
  if (pathname === "/") return null;

  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((segment, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const key = SEGMENT_LABEL[segment];
    return {
      href,
      label: key ? t(key) : t("detail"),
      isLast: i === segments.length - 1,
    };
  });

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
          <li>
            <Link href="/" className="hover:text-slate-900 hover:underline">
              {t("home")}
            </Link>
          </li>
          {crumbs.map((crumb) => (
            <Fragment key={crumb.href}>
              <li aria-hidden className="text-slate-300">
                <ChevronRight className="h-4 w-4" />
              </li>
              <li>
                {!crumb.isLast && NAVIGABLE.has(crumb.href) ? (
                  <Link
                    href={crumb.href}
                    className="hover:text-slate-900 hover:underline"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={crumb.isLast ? "font-medium text-slate-900" : ""}
                    aria-current={crumb.isLast ? "page" : undefined}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            </Fragment>
          ))}
        </ol>
      </nav>
    </div>
  );
}
