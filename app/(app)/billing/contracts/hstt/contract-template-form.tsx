"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { assignHsttTemplate } from "@/app/actions/billing-hstt-templates";
import type { FormState } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";

/** The HSTT template of a contract ("" = standard TP template). Accountants + admins. */
export function ContractTemplateForm({
  contractId,
  current,
  templates,
  readOnly,
}: {
  contractId: string;
  current: { templateId: string; name: string; version: number } | null;
  /** Active templates (only those can be assigned). */
  templates: { id: string; name: string }[];
  readOnly: boolean;
}) {
  const t = useTranslations("HsttTemplates");
  const [state, action, pending] = useActionState<FormState, FormData>(assignHsttTemplate, {});

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="contract_id" value={contractId} />
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <fieldset disabled={readOnly} className="flex min-w-0 flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field
            label={t("contractTemplate")}
            htmlFor="contract-hstt-template"
            hint={current ? t("currentInfo", { name: current.name, version: current.version }) : t("currentStandard")}
          >
            <Select id="contract-hstt-template" name="template_id" defaultValue={current?.templateId ?? ""}>
              <option value="">{t("standardOption")}</option>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {!readOnly && (
          <Button type="submit" variant="secondary" loading={pending}>
            {t("saveAssign")}
          </Button>
        )}
      </fieldset>
      <Link href="/billing/templates" className="inline-block text-sm font-medium text-primary hover:underline">
        {t("manageLink")}
      </Link>
    </form>
  );
}
