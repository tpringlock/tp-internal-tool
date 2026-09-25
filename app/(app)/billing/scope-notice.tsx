import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";

/** States the phase-1 scope: equipment rent only. */
export async function ScopeNotice() {
  const t = await getTranslations("Billing");
  return (
    <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        {t.rich("scopeNotice", {
          b: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>
    </div>
  );
}
