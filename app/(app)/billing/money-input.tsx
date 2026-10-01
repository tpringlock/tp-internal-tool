"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { parseMoney } from "@/lib/billing/hstt-data";
import { formatNumber } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Whole-VND input that accepts "1.550.000.000", "1 550 000 000" or plain
 * digits. Reports the parsed value (null = empty, NaN = invalid) and shows
 * it formatted under the box. With `name`, the raw text is also submitted
 * (the server parses it with the same rule).
 */
export function MoneyInput({
  id,
  name,
  defaultValue,
  onValue,
  disabled,
  className,
  allowNegative = false,
  ariaLabel,
}: {
  id?: string;
  name?: string;
  defaultValue: number | null;
  onValue?: (value: number | null) => void;
  disabled?: boolean;
  className?: string;
  allowNegative?: boolean;
  ariaLabel?: string;
}) {
  const t = useTranslations("Hstt");
  const [text, setText] = useState(defaultValue === null ? "" : formatNumber(defaultValue));
  const value = parseMoney(text);
  const invalid = value !== null && (Number.isNaN(value) || (!allowNegative && value < 0));

  return (
    <div className="min-w-0">
      <Input
        id={id}
        name={name}
        inputMode="numeric"
        value={text}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseMoney(e.target.value);
          onValue?.(v !== null && (Number.isNaN(v) || (!allowNegative && v < 0)) ? Number.NaN : v);
        }}
        onBlur={() => {
          if (value !== null && !invalid) setText(formatNumber(value));
        }}
        className={cn("text-right tabular-nums", invalid && "border-red-400", className)}
      />
      {invalid && <p className="mt-1 text-xs text-red-600">{t("moneyInvalid")}</p>}
    </div>
  );
}
