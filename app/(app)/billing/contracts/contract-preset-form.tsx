"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { setContractPeriodPreset } from "@/app/actions/billing-periods";
import type { FormState } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";

/** The contract's default period preset, preselected on the calculate form. */
export function ContractPresetForm({
  contractId,
  presetId,
  presets,
  readOnly,
}: {
  contractId: string;
  presetId: string | null;
  presets: { id: string; name: string; active: boolean }[];
  readOnly: boolean;
}) {
  const t = useTranslations("BillingPresets");
  const [state, action, pending] = useActionState<FormState, FormData>(setContractPeriodPreset, {});

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="contract_id" value={contractId} />
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <fieldset disabled={readOnly} className="flex min-w-0 flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field label={t("contractDefault")} htmlFor="contract-preset" hint={t("contractDefaultHint")}>
            <Select id="contract-preset" name="preset_id" defaultValue={presetId ?? ""}>
              <option value="">{t("contractDefaultNone")}</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.active ? p.name : t("inactiveOption", { name: p.name })}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {!readOnly && (
          <Button type="submit" variant="secondary" loading={pending}>
            {t("save")}
          </Button>
        )}
      </fieldset>
    </form>
  );
}
