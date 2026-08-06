import Link from "next/link";
import { useTranslations } from "next-intl";
import { logout } from "@/app/actions/auth";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/user-menu";

export function TopNav({
  fullName,
  role,
}: {
  fullName: string;
  role: "admin" | "employee";
}) {
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2">
          {/* Brand logo. next/image is skipped here since it routes SVG/PNG
              logos through the optimizer; a plain img keeps it simple. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-tp.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7"
          />
          <span className="font-semibold text-slate-900">{tc("title")}</span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <LanguageSwitcher />
          <UserMenu fullName={fullName} role={role} />
          <form action={logout}>
            <button
              type="submit"
              aria-label={t("signOut")}
              title={t("signOut")}
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="h-5 w-5"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
