import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { BillingCalcStatus } from "@/lib/db/types";

const TONES: Record<BillingCalcStatus, string> = {
  draft: "bg-amber-50 text-amber-800 ring-amber-200",
  confirmed: "bg-green-50 text-green-800 ring-green-200",
  voided: "bg-slate-100 text-slate-500 ring-slate-200 line-through",
};

/** Draft / confirmed / voided pill for a rent calculation. */
export function StatusBadge({ status }: { status: BillingCalcStatus }) {
  const t = useTranslations("Billing");
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[status],
      )}
    >
      {t(`status_${status}`)}
    </span>
  );
}
