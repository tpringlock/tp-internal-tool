"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  createBillingContract,
  updateBillingContract,
} from "@/app/actions/billing";
import type { FormState } from "@/app/actions/auth";
import type { BillingContract } from "@/lib/db/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";

/**
 * Contract header form: create (no `contract`) or edit. The price lines are
 * edited separately (ContractConfigEditor).
 */
export function ContractForm({ contract }: { contract?: BillingContract }) {
  const t = useTranslations("Billing");
  const [state, action, pending] = useActionState<FormState, FormData>(
    contract ? updateBillingContract : createBillingContract,
    {},
  );
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <form action={action} className="space-y-4">
      {contract && <input type="hidden" name="id" value={contract.id} />}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("customerName")} htmlFor="customer_name" error={err("customer_name")}>
          <Input id="customer_name" name="customer_name" defaultValue={contract?.customer_name} required />
        </Field>
        <Field label={t("projectName")} htmlFor="project_name" error={err("project_name")}>
          <Input id="project_name" name="project_name" defaultValue={contract?.project_name} required />
        </Field>
        <Field
          label={t("misaKho")}
          htmlFor="misa_kho"
          error={err("misa_kho")}
          hint={t("misaKhoHint")}
        >
          <Input id="misa_kho" name="misa_kho" defaultValue={contract?.misa_kho} required className="font-mono" />
        </Field>
        <Field label={t("contractNo")} htmlFor="contract_no" error={err("contract_no")}>
          <Input id="contract_no" name="contract_no" defaultValue={contract?.contract_no} />
        </Field>
        <Field label={t("contractCode")} htmlFor="code" error={err("code")} hint={t("contractCodeHint")}>
          <Input id="code" name="code" defaultValue={contract?.code} required className="font-mono" />
        </Field>
        <Field
          label={t("periodStartDay")}
          htmlFor="period_start_day"
          error={err("period_start_day")}
          hint={t("periodStartDayHint")}
        >
          <Input
            id="period_start_day"
            name="period_start_day"
            type="number"
            min={2}
            max={28}
            defaultValue={contract?.period_start_day ?? 26}
            required
          />
        </Field>
        <Field
          label={t("contractStart")}
          htmlFor="contract_start"
          error={err("contract_start")}
          hint={t("contractStartHint")}
        >
          <Input
            id="contract_start"
            name="contract_start"
            type="date"
            defaultValue={contract?.contract_start ?? ""}
          />
        </Field>
        {contract && (
          <Field label={t("statusLabel")} htmlFor="active">
            <Select id="active" name="active" defaultValue={contract.active ? "on" : "off"}>
              <option value="on">{t("contractActive")}</option>
              <option value="off">{t("contractInactive")}</option>
            </Select>
          </Field>
        )}
      </div>

      <Button type="submit" loading={pending}>
        {contract ? t("save") : t("createContract")}
      </Button>
    </form>
  );
}
