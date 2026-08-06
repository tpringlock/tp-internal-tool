"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
}

export function TopNav({
  fullName,
  role,
}: {
  fullName: string;
  role: "admin" | "employee";
}) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: "/", label: "Home" },
    { href: "/documents", label: "Documents" },
    { href: "/profile", label: "Profile" },
  ];
  if (role === "admin") {
    items.push({ href: "/admin/users", label: "Admin" });
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="font-semibold text-slate-900">
          Company Portal
        </Link>

        <nav className="flex items-center gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-slate-600 sm:inline">
            {fullName}
            {role === "admin" && (
              <span className="ml-2 rounded bg-slate-900 px-1.5 py-0.5 text-xs text-white">
                Admin
              </span>
            )}
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
