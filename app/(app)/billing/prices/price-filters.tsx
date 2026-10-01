"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Filters of /billing/prices, submitted as a GET form (shareable URL). */
export function PriceFilters({
  contracts,
  q,
  contract,
  issues,
}: {
  contracts: { id: string; label: string; keywords: (string | null)[] }[];
  q: string;
  contract: string;
  issues: boolean;
}) {
  const t = useTranslations("BillingPrices");
  const options: ComboboxOption[] = contracts.map((c) => ({ value: c.id, label: c.label, keywords: c.keywords }));
  return (
    <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] md:items-end">
      <label className="space-y-1.5 text-sm">
        <span className="font-medium text-slate-700">{t("filterSearch")}</span>
        <Input name="q" defaultValue={q} placeholder={t("filterSearchPlaceholder")} />
      </label>
      <div className="space-y-1.5 text-sm">
        <span className="font-medium text-slate-700">{t("filterContract")}</span>
        <Combobox
          name="contract"
          aria-label={t("filterContract")}
          options={options}
          defaultValue={contract}
          allLabel={t("allContracts")}
          emptyText={t("noContractMatch")}
        />
      </div>
      <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="issues" value="1" defaultChecked={issues} className="h-4 w-4 rounded border-slate-300" />
        {t("filterIssues")}
      </label>
      <Button type="submit" variant="secondary">
        <Search className="h-4 w-4" aria-hidden />
        {t("filterApply")}
      </Button>
    </form>
  );
}
