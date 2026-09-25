"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createExcludedRange } from "@/app/actions/billing";
import type { FormState } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";

/**
 * Add a non-billable date range (e.g. Tết). With `contractId` the range is
 * fixed to that contract; otherwise the user picks one contract or all.
 */
export function RangeForm({
  contractId,
  contracts,
}: {
  contractId?: string;
  contracts?: { id: string; label: string }[];
}) {
  const t = useTranslations("Billing");
  const [state, action, pending] = useActionState<FormState, FormData>(
    createExcludedRange,
    {},
  );
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <form action={action} className="space-y-4">
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {contractId && <input type="hidden" name="contract_id" value={contractId} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("dateFrom")} htmlFor="date_from" error={err("date_from")}>
          <Input id="date_from" name="date_from" type="date" required />
        </Field>
        <Field label={t("dateTo")} htmlFor="date_to" error={err("date_to")}>
          <Input id="date_to" name="date_to" type="date" required />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("reason")} htmlFor="reason" error={err("reason")}>
            <Input id="reason" name="reason" placeholder={t("reasonPlaceholder")} required />
          </Field>
        </div>
        {!contractId && contracts && (
          <div className="sm:col-span-2">
            <Field label={t("appliesTo")} htmlFor="contract_id" error={err("contract_id")}>
              <Select id="contract_id" name="contract_id" defaultValue="">
                <option value="">{t("allContracts")}</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500">{t("rangeHint")}</p>
      <Button type="submit" loading={pending}>
        {t("addRange")}
      </Button>
    </form>
  );
}
