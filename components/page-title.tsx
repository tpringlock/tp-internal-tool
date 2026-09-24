import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import type { AppModuleId } from "@/lib/app-modules";

/** Page heading style shared by every workspace page. */
export const pageTitleClass =
  "text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl";

/** Small uppercase module caption above a page title ("ADMIN PANEL"). */
export async function ModuleEyebrow({
  id,
  className,
}: {
  id: AppModuleId;
  className?: string;
}) {
  const t = await getTranslations("AppModules");
  return (
    <p
      className={cn(
        "mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary",
        className,
      )}
    >
      {t(`${id}.name`)}
    </p>
  );
}

/** Segmented tab row (Documents' "Hồ sơ dữ liệu / Chia sẻ" style). */
export const segmentedTabsClass =
  "inline-flex w-fit max-w-full overflow-x-auto rounded-xl bg-slate-200/60 p-1";

export function segmentedTabClass(active: boolean) {
  return cn(
    "flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
    active
      ? "bg-white text-slate-900 shadow-sm"
      : "text-slate-500 hover:text-slate-900",
  );
}
