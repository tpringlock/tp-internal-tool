"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { saveTransportPrices } from "@/app/actions/billing-hstt";
import type { FormState } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { MoneyInput } from "../../money-input";

export interface TransportPriceRow {
  id: string | null;
  name: string;
  unit: string;
  unit_price: number | null;
  active: boolean;
}

let nextKey = 0;
const withKey = (r: TransportPriceRow) => ({ ...r, key: `k${nextKey++}` });

/**
 * Transport price list of a contract (one row = one vehicle type = one HSTT
 * line in section II). A vehicle used by a period can't be deleted; switch it
 * to "not used" so it stops appearing on new HSTTs.
 */
export function TransportPricesEditor({
  contractId,
  rows: initial,
  readOnly,
}: {
  contractId: string;
  rows: TransportPriceRow[];
  readOnly: boolean;
}) {
  const t = useTranslations("Hstt");
  const [rows, setRows] = useState(() => initial.map(withKey));
  const [state, action, pending] = useActionState<FormState, FormData>(saveTransportPrices, {});
  const set = (key: string, patch: Partial<TransportPriceRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const invalid = rows.some((r) => r.unit_price === null || Number.isNaN(r.unit_price) || !r.name.trim());
  const payload = rows.map((r) => ({
    id: r.id,
    name: r.name,
    unit: r.unit,
    unit_price: r.unit_price ?? 0,
    active: r.active,
  }));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="contract_id" value={contractId} />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{t("noVehicles")}</p>
      ) : (
        <table className="responsive-table w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-slate-500">
              <th className="py-2 pr-3 font-medium">{t("vehicleName")}</th>
              <th className="w-24 py-2 pr-3 font-medium">{t("vehicleUnit")}</th>
              <th className="w-44 py-2 pr-3 text-right font-medium">{t("vehiclePrice")}</th>
              <th className="w-36 py-2 pr-3 font-medium">{t("vehicleActive")}</th>
              {!readOnly && <th className="w-10 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-slate-50 last:border-0">
                <td data-label={t("vehicleName")} className="py-2 pr-3">
                  <Input
                    value={r.name}
                    onChange={(e) => set(r.key, { name: e.target.value })}
                    disabled={readOnly}
                    aria-label={t("vehicleName")}
                    required
                  />
                </td>
                <td data-label={t("vehicleUnit")} className="py-2 pr-3">
                  <Input
                    value={r.unit}
                    onChange={(e) => set(r.key, { unit: e.target.value })}
                    disabled={readOnly}
                    aria-label={t("vehicleUnit")}
                  />
                </td>
                <td data-label={t("vehiclePrice")} className="py-2 pr-3">
                  <MoneyInput
                    defaultValue={r.unit_price}
                    onValue={(v) => set(r.key, { unit_price: v })}
                    disabled={readOnly}
                    ariaLabel={t("vehiclePrice")}
                  />
                </td>
                <td data-label={t("vehicleActive")} className="py-2 pr-3">
                  <Select
                    value={r.active ? "on" : "off"}
                    onChange={(e) => set(r.key, { active: e.target.value === "on" })}
                    disabled={readOnly}
                    aria-label={t("vehicleActive")}
                  >
                    <option value="on">{t("vehicleOn")}</option>
                    <option value="off">{t("vehicleOff")}</option>
                  </Select>
                </td>
                {!readOnly && (
                  <td className="py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-8 px-0"
                      aria-label={t("remove")}
                      title={t("remove")}
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              setRows((rs) => [...rs, withKey({ id: null, name: "", unit: "Chuyến", unit_price: null, active: true })])
            }
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("addVehicle")}
          </Button>
          <Button type="submit" size="sm" loading={pending} disabled={invalid}>
            {t("save")}
          </Button>
        </div>
      )}
    </form>
  );
}
