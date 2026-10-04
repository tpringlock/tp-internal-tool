"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { saveContractHstt } from "@/app/actions/billing-hstt";
import type { FormState } from "@/app/actions/auth";
import type { BillingContractHstt } from "@/lib/db/types";
import { canCuText } from "@/lib/billing/hstt-text";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { MoneyInput } from "../../money-input";

export interface CustomerOption {
  id: string;
  ten_in_hoa: string;
  ten_thuong: string;
}

/**
 * HSTT fields of a contract: Bên A, contract type/date, project, the
 * "Căn cứ" sentence (live preview, optional manual override), VAT and the
 * opening debt balance.
 */
export function ContractHsttForm({
  contractId,
  contractNo,
  hstt,
  customers,
  companyTenThuong,
  readOnly,
}: {
  contractId: string;
  contractNo: string;
  hstt: BillingContractHstt | null;
  customers: CustomerOption[];
  companyTenThuong: string;
  readOnly: boolean;
}) {
  const t = useTranslations("Hstt");
  const [state, action, pending] = useActionState<FormState, FormData>(saveContractHstt, {});
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  const [customerId, setCustomerId] = useState(hstt?.customer_id ?? "");
  const [type, setType] = useState(hstt?.contract_type ?? "Hợp đồng kinh tế");
  const [date, setDate] = useState(hstt?.contract_date ?? "");
  const [override, setOverride] = useState(hstt?.can_cu_override ?? "");
  const customer = customers.find((c) => c.id === customerId);
  const preview = canCuText({
    contract: { type, no: contractNo || "…", date: date || null, canCuOverride: override.trim() || null },
    customer: { ten_thuong: customer?.ten_thuong || "…" },
    company: { ten_thuong: companyTenThuong || "…" },
  });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="contract_id" value={contractId} />
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <fieldset disabled={readOnly} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={t("customer")} htmlFor="customer_id" error={err("customer_id")}>
            <div className="flex flex-wrap gap-2">
              <Select
                id="customer_id"
                name="customer_id"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="min-w-0 flex-1"
              >
                <option value="">{t("chooseCustomer")}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ten_in_hoa}
                  </option>
                ))}
              </Select>
              {!readOnly && (
                <Link
                  href={`/billing/customers/new?contract=${contractId}`}
                  className="inline-flex h-10 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:border-primary hover:text-primary"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {t("addCustomer")}
                </Link>
              )}
            </div>
          </Field>
        </div>
        <Field label={t("contractType")} htmlFor="contract_type" error={err("contract_type")}>
          <Input
            id="contract_type"
            name="contract_type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            required
          />
        </Field>
        <Field label={t("contractNo")} htmlFor="contract_no_view" hint={t("contractNoHint")}>
          <Input id="contract_no_view" value={contractNo} readOnly disabled className="font-mono" />
        </Field>
        <Field label={t("contractDate")} htmlFor="contract_date" error={err("contract_date")}>
          <Input id="contract_date" name="contract_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("vatPercent")} htmlFor="vat_percent" error={err("vat_percent")}>
          <Input
            id="vat_percent"
            name="vat_percent"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={hstt ? Number(hstt.vat_percent) : 8}
            required
          />
        </Field>
        <Field label={t("duAnTen")} htmlFor="du_an_ten" error={err("du_an_ten")}>
          <Input id="du_an_ten" name="du_an_ten" defaultValue={hstt?.du_an_ten ?? ""} />
        </Field>
        <Field label={t("duAnDiaChi")} htmlFor="du_an_dia_chi" error={err("du_an_dia_chi")}>
          <Input id="du_an_dia_chi" name="du_an_dia_chi" defaultValue={hstt?.du_an_dia_chi ?? ""} />
        </Field>

        <div className="space-y-2 sm:col-span-2">
          <p className="text-sm font-medium text-slate-700">{t("canCuPreview")}</p>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{preview}</p>
          <Field label={t("canCuOverride")} htmlFor="can_cu_override" error={err("can_cu_override")} hint={t("canCuOverrideHint")}>
            <Textarea
              id="can_cu_override"
              name="can_cu_override"
              rows={2}
              value={override}
              onChange={(e) => setOverride(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2" data-tour="hstt-opening-debt">
          <Field label={t("openingDebt")} htmlFor="opening_debt" error={err("opening_debt")} hint={t("openingDebtHint")}>
            <MoneyInput
              id="opening_debt"
              name="opening_debt"
              defaultValue={hstt?.opening_debt === null || hstt?.opening_debt === undefined ? null : Number(hstt.opening_debt)}
              allowNegative
              disabled={readOnly}
            />
          </Field>
          <Field label={t("openingDebtMonth")} htmlFor="opening_debt_month" error={err("opening_debt_month")}>
            <Input id="opening_debt_month" name="opening_debt_month" type="month" defaultValue={hstt?.opening_debt_month ?? ""} />
          </Field>
        </div>
      </fieldset>

      {!readOnly && (
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      )}
    </form>
  );
}
