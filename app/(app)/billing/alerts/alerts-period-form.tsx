"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatBillingMonth } from "@/lib/billing/periods";
import type { PresetMonths } from "@/lib/billing/period-presets";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";

export interface AlertsPeriodValue {
  mode: "preset" | "range";
  start_day: number;
  months: PresetMonths;
  month: string;
  date_from: string;
  date_to: string;
}

/**
 * Period of the alert center: a preset + month (e.g. "Tháng dương lịch" for
 * one data month) or a date range. A plain GET form, so the URL can be
 * shared and reloaded.
 */
export function AlertsPeriodForm({
  presets,
  months,
  value,
}: {
  presets: { id: string; name: string; start_day: number; months: PresetMonths }[];
  months: string[];
  value: AlertsPeriodValue;
}) {
  const t = useTranslations("BillingAlerts");
  const [mode, setMode] = useState(value.mode);
  const [presetId, setPresetId] = useState(
    presets.find((p) => p.start_day === value.start_day && p.months === value.months)?.id ?? presets[0]?.id ?? "",
  );
  const preset = presets.find((p) => p.id === presetId) ?? presets[0];

  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="mode" value={mode} />
      <Field label={t("periodMode")} htmlFor="alerts-mode">
        <Select id="alerts-mode" value={mode} onChange={(e) => setMode(e.target.value as AlertsPeriodValue["mode"])} className="w-auto">
          <option value="preset">{t("modePreset")}</option>
          <option value="range">{t("modeRange")}</option>
        </Select>
      </Field>
      {mode === "preset" ? (
        <>
          {preset && (
            <>
              <input type="hidden" name="start_day" value={preset.start_day} />
              <input type="hidden" name="months" value={preset.months} />
            </>
          )}
          <Field label={t("preset")} htmlFor="alerts-preset">
            <Select id="alerts-preset" value={preset?.id ?? ""} onChange={(e) => setPresetId(e.target.value)} className="w-auto">
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("endMonth")} htmlFor="alerts-month">
            <Select id="alerts-month" name="month" defaultValue={value.month} className="w-auto">
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatBillingMonth(m)}
                </option>
              ))}
            </Select>
          </Field>
        </>
      ) : (
        <>
          <Field label={t("dateFrom")} htmlFor="alerts-from">
            <Input id="alerts-from" name="date_from" type="date" defaultValue={value.date_from} required />
          </Field>
          <Field label={t("dateTo")} htmlFor="alerts-to">
            <Input id="alerts-to" name="date_to" type="date" defaultValue={value.date_to} required />
          </Field>
        </>
      )}
      <Button type="submit">{t("check")}</Button>
    </form>
  );
}
