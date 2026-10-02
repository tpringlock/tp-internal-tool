"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createBillingCustomer, updateBillingCustomer } from "@/app/actions/billing-hstt";
import type { FormState } from "@/app/actions/auth";
import type { BillingCustomer } from "@/lib/db/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PartyFields, type PartyField } from "../party-fields";

const FIELDS: PartyField[] = [
  { name: "ten_in_hoa", required: true, wide: true },
  { name: "ten_thuong", hint: "inSentence", wide: true },
  { name: "ten_rut_gon", hint: "shortName" },
  { name: "mst", mono: true },
  { name: "dia_chi", wide: true },
  { name: "dien_thoai" },
  { name: "so_tk", mono: true },
  { name: "ngan_hang", hint: "bank", wide: true },
  { name: "dai_dien" },
  { name: "chuc_vu" },
  { name: "note", multiline: true, wide: true },
];

/**
 * Bên A: create (no `customer`) or edit. `returnTo` sends a new customer back
 * to the contract page that asked for it. `readOnly` ("Chỉ xem") disables it.
 */
export function CustomerForm({
  customer,
  returnTo,
  readOnly = false,
}: {
  customer?: BillingCustomer;
  returnTo?: string;
  readOnly?: boolean;
}) {
  const t = useTranslations("Hstt");
  const [state, action, pending] = useActionState<FormState, FormData>(
    customer ? updateBillingCustomer : createBillingCustomer,
    {},
  );
  return (
    <form action={action} className="space-y-4">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <fieldset disabled={readOnly} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <PartyFields
          fields={FIELDS}
          values={customer as unknown as Record<string, string> | undefined}
          errors={state.fieldErrors}
        />
      </fieldset>
      {!readOnly && (
        <Button type="submit" loading={pending}>
          {customer ? t("save") : t("newCustomer")}
        </Button>
      )}
    </form>
  );
}
