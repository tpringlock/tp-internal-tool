import Link from "next/link";
import { useTranslations } from "next-intl";
import { UserMenu } from "@/components/user-menu";
import { ModuleSwitcher } from "@/components/module-switcher";
import { getModulesForRole, HOME_HREF } from "@/lib/app-modules";
import type { UserRole } from "@/lib/db/types";

/**
 * App-wide header shared by every module: brand (logo + project name) and the
 * module switcher on the left, the account menu on the right. Full width so it
 * lines up with the full-bleed Documents workspace.
 */
export function TopNav({
  fullName,
  email,
  role,
}: {
  fullName: string;
  email: string | null;
  role: UserRole;
}) {
  const tc = useTranslations("Common");
  const modules = getModulesForRole(role);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 lg:px-6">
        <Link
          href={HOME_HREF}
          className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {/* Brand logo. next/image is skipped here since it routes SVG/PNG
              logos through the optimizer; a plain img keeps it simple. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-tp.png"
            alt={tc("title")}
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 object-contain"
          />
          <span className="hidden truncate text-[15px] font-bold tracking-tight text-slate-900 sm:inline">
            {tc("title")}
          </span>
        </Link>

        <span aria-hidden className="mx-1 h-6 w-px bg-slate-200 sm:mx-2" />

        <ModuleSwitcher modules={modules} />

        <div className="ml-auto flex items-center">
          <UserMenu fullName={fullName} email={email} role={role} />
        </div>
      </div>
    </header>
  );
}
