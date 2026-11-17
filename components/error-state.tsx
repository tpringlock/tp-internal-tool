import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Centered message card shared by the 404 and error pages. Presentational only
 * (no hooks), so server and client components can both render it.
 */
export function ErrorState({
  Icon,
  title,
  body,
  detail,
  children,
}: {
  Icon: LucideIcon;
  title: string;
  body: string;
  /** Small monospace line, e.g. the error reference for support. */
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{body}</p>
        {detail && (
          <p className="mt-3 break-all font-mono text-xs text-slate-500">
            {detail}
          </p>
        )}
        {children && (
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
