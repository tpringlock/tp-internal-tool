"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { setLocale } from "@/app/actions/locale";
import { LOCALES, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

const LABELS: Record<Locale, string> = {
  vi: "VI",
  en: "EN",
};

export function LanguageSwitcher() {
  const active = useLocale();
  const [pending, startTransition] = useTransition();

  const choose = (locale: Locale) => {
    if (locale === active || pending) return;
    startTransition(() => {
      void setLocale(locale);
    });
  };

  return (
    <div className="flex items-center rounded-md border border-slate-200 p-0.5 text-xs font-medium">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => choose(locale)}
          aria-pressed={locale === active}
          disabled={pending}
          className={cn(
            "rounded px-2 py-1 transition-colors disabled:opacity-60",
            locale === active
              ? "bg-primary text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          )}
        >
          {LABELS[locale]}
        </button>
      ))}
    </div>
  );
}
