"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { savePeriodPreset } from "@/app/actions/billing-periods";
import type { FormState } from "@/app/actions/auth";
import { formatVnDate } from "@/lib/billing/dates";
import { formatBillingMonth } from "@/lib/billing/periods";
import { PRESET_MONTHS, presetPeriod, type PresetMonths } from "@/lib/billing/period-presets";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";

export interface PresetFormValue {
  id: string;
  name: string;
  start_day: number;
  months: PresetMonths;
  sort_order: number;
  active: boolean;
}

/** Add (no `preset`) or edit a period preset (admin), with a live example period. */
export function PresetForm({ preset, exampleMonth }: { preset?: PresetFormValue; exampleMonth: string }) {
  const t = useTranslations("BillingPresets");
  const [state, action, pending] = useActionState<FormState, FormData>(savePeriodPreset, {});
  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const [startDay, setStartDay] = useState(String(preset?.start_day ?? 26));
  const [months, setMonths] = useState(String(preset?.months ?? 1));

  const day = Number(startDay);
  const example =
    Number.isInteger(day) && day >= 1 && day <= 28
      ? presetPeriod({ start_day: day, months: Number(months) as PresetMonths }, exampleMonth)
      : null;

  return (
    <form action={action} className="space-y-4">
      {preset && <input type="hidden" name="id" value={preset.id} />}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={t("name")} htmlFor="preset-name" error={err("name")}>
            <Input id="preset-name" name="name" defaultValue={preset?.name} placeholder={t("namePlaceholder")} required />
          </Field>
        </div>
        <Field label={t("startDay")} htmlFor="preset-start" error={err("start_day")} hint={t("startDayHint")}>
          <Input
            id="preset-start"
            name="start_day"
            type="number"
            min={1}
            max={28}
            value={startDay}
            onChange={(e) => setStartDay(e.target.value)}
            required
          />
        </Field>
        <Field label={t("months")} htmlFor="preset-months" error={err("months")}>
          <Select id="preset-months" name="months" value={months} onChange={(e) => setMonths(e.target.value)}>
            {PRESET_MONTHS.map((m) => (
              <option key={m} value={m}>
                {t("monthsOption", { count: m })}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("sortOrder")} htmlFor="preset-sort" error={err("sort_order")} hint={t("sortOrderHint")}>
          <Input id="preset-sort" name="sort_order" type="number" min={0} defaultValue={preset?.sort_order ?? 0} />
        </Field>
        {preset && (
          <Field label={t("status")} htmlFor="preset-active">
            <Select id="preset-active" name="active" defaultValue={preset.active ? "on" : "off"}>
              <option value="on">{t("active")}</option>
              <option value="off">{t("inactive")}</option>
            </Select>
          </Field>
        )}
      </div>

      {example && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
          {t("example", {
            month: formatBillingMonth(exampleMonth),
            from: formatVnDate(example.from),
            to: formatVnDate(example.to),
          })}
        </p>
      )}

      <Button type="submit" loading={pending}>
        {preset ? t("save") : t("add")}
      </Button>
    </form>
  );
}
