import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { BillingContract } from "@/lib/db/types";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ContractHsttForm } from "./contract-hstt-form";
import { TransportPricesEditor } from "./transport-prices-editor";
import { AdvancesEditor } from "./advances-editor";

/**
 * "HSTT" tab of a contract (0038): Bên A + contract fields, transport price
 * list, advances. The page guard already ran (requireBillingViewer); every
 * form is disabled for "Chỉ xem" and the actions refuse them anyway.
 */
export async function ContractHsttTab({ contract, canEdit }: { contract: BillingContract; canEdit: boolean }) {
  const t = await getTranslations("Hstt");
  const supabase = await createClient();
  const [{ data: hstt }, { data: customers }, { data: company }, { data: prices }, { data: advances }] =
    await Promise.all([
      supabase.from("billing_contract_hstt").select("*").eq("contract_id", contract.id).maybeSingle(),
      supabase.from("billing_customers").select("id, ten_in_hoa, ten_thuong").order("ten_in_hoa"),
      supabase.from("company_profile").select("ten_thuong").eq("id", 1).maybeSingle(),
      supabase.from("billing_transport_prices").select("*").eq("contract_id", contract.id).order("sort_order"),
      supabase.from("billing_contract_advances").select("*").eq("contract_id", contract.id).order("sort_order"),
    ]);
  // Remount the list editors when the saved rows change (new ids after a save).
  const stamp = (rows: { id: string; updated_at: string }[] | null) =>
    (rows ?? []).map((r) => `${r.id}@${r.updated_at}`).join("|");

  return (
    <div className="space-y-6">
      {contract.is_demo && <Alert tone="info">{t("demoNoHstt")}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>{t("contractHsttTitle")}</CardTitle>
          <p className="mt-1 text-sm text-slate-500">{t("contractHsttSubtitle")}</p>
        </CardHeader>
        <CardBody>
          <ContractHsttForm
            key={hstt?.updated_at ?? "new"}
            contractId={contract.id}
            contractNo={contract.contract_no}
            hstt={hstt}
            customers={customers ?? []}
            companyTenThuong={company?.ten_thuong ?? ""}
            readOnly={!canEdit}
          />
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("transportTitle")}</CardTitle>
            <p className="mt-1 text-sm text-slate-500">{t("transportSubtitle")}</p>
          </CardHeader>
          <CardBody>
            <TransportPricesEditor
              key={stamp(prices)}
              contractId={contract.id}
              rows={(prices ?? []).map((p) => ({
                id: p.id,
                name: p.name,
                unit: p.unit,
                unit_price: Number(p.unit_price),
                active: p.active,
              }))}
              readOnly={!canEdit}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("advancesTitle")}</CardTitle>
            <p className="mt-1 text-sm text-slate-500">{t("advancesSubtitle")}</p>
          </CardHeader>
          <CardBody>
            <AdvancesEditor
              key={`${stamp(advances)}#${hstt?.advances_note ?? ""}`}
              contractId={contract.id}
              rows={(advances ?? []).map((a) => ({ id: a.id, amount: Number(a.amount), paid_on: a.paid_on }))}
              note={hstt?.advances_note ?? ""}
              readOnly={!canEdit}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
