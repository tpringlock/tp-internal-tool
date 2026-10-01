"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveCompanyProfile } from "@/app/actions/billing-hstt";
import type { FormState } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PartyFields, type PartyField } from "@/app/(app)/billing/party-fields";

const FIELDS: PartyField[] = [
  { name: "ten_in_hoa", required: true, wide: true },
  { name: "ten_2_dong", multiline: true, hint: "twoLines", wide: true },
  { name: "ten_thuong", hint: "inSentence", wide: true },
  { name: "ten_thu_huong", wide: true },
  { name: "dia_chi", wide: true },
  { name: "dia_chi_ngan", hint: "shortAddress", wide: true },
  { name: "dien_thoai" },
  { name: "mst", mono: true },
  { name: "so_tk", mono: true },
  { name: "ngan_hang", hint: "bank" },
  { name: "dai_dien" },
  { name: "chuc_vu" },
  { name: "noi_lap" },
];

/** Bên B (company_profile): printed on every HSTT. Admin only. */
export function CompanyForm({ values }: { values: Record<string, string> }) {
  const t = useTranslations("Hstt");
  const [state, action, pending] = useActionState<FormState, FormData>(saveCompanyProfile, {});
  return (
    <form action={action} className="space-y-4">
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <PartyFields fields={FIELDS} values={values} errors={state.fieldErrors} />
      </div>
      <Button type="submit" loading={pending}>
        {t("save")}
      </Button>
    </form>
  );
}
