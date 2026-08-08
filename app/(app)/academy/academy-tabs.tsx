import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

/** Top-of-page tab row switching between the library and the user's courses. */
export async function AcademyTabs({ active }: { active: "all" | "mine" }) {
  const t = await getTranslations("Academy");
  const items = [
    { href: "/academy", key: "all" as const, label: t("allCoursesTab") },
    { href: "/academy/my-courses", key: "mine" as const, label: t("myCourses") },
  ];

  return (
    <nav className="flex gap-1 border-b border-slate-200 pb-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            active === item.key
              ? "bg-slate-100 text-slate-900"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
