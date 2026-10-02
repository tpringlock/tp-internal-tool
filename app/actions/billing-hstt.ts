"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireBillingUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import {
  advancesSchema,
  billingCustomerSchema,
  companyProfileSchema,
  contractHsttSchema,
  periodInputsSchema,
  translateFieldErrors,
  transportPricesSchema,
} from "@/lib/validation";
import { periodEditBlock } from "@/lib/billing/hstt-data";
import type { FormState } from "@/app/actions/auth";

/** Postgres foreign-key-violation error code. */
const FK_VIOLATION = "23503";
/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = "23505";

function revalidateBilling() {
  revalidatePath("/billing", "layout");
}

/** First issue of a JSON list, as "Dòng n: message". */
async function listError(error: ZodError): Promise<FormState> {
  const t = await getTranslations("Hstt");
  const tv = await getTranslations("Validation");
  const first = error.issues[0];
  const msg = first && tv.has(first.message) ? tv(first.message) : t("errBadData");
  const row = first?.path.find((p) => typeof p === "number");
  return { error: typeof row === "number" ? t("errOnRow", { row: row + 1, message: msg }) : msg };
}

function parseJson(formData: FormData, name: string): unknown {
  try {
    return JSON.parse(String(formData.get(name) ?? "null"));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Bên B: company profile (admin only)
// ---------------------------------------------------------------------------

export async function saveCompanyProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("Hstt");
  if (user.profile.role !== "admin") return { error: t("errAdminOnly") };

  const parsed = companyProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  // The single row is created by 0039; RLS lets only admins update it.
  const { data, error } = await supabase
    .from("company_profile")
    .update({ ...parsed.data, updated_by: user.id })
    .eq("id", 1)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: t("errCompanyMissing") };

  await logActivity(supabase, { action: "billing.company_updated", entityType: "company_profile", entityId: "1" });
  revalidatePath("/admin/company");
  revalidateBilling();
  return { success: t("companySaved") };
}

// ---------------------------------------------------------------------------
// Bên A: customers
// ---------------------------------------------------------------------------

function parseCustomer(formData: FormData) {
  return billingCustomerSchema.safeParse(Object.fromEntries(formData));
}

export async function createBillingCustomer(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("Hstt");
  const parsed = parseCustomer(formData);
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_customers")
    .insert({ ...parsed.data, created_by: user.id, updated_by: user.id })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === UNIQUE_VIOLATION) return { fieldErrors: { mst: [t("errMstInUse")] } };
    return { error: error?.message ?? t("errSaveFailed") };
  }

  await logActivity(supabase, {
    action: "billing.customer_created",
    entityType: "billing_customer",
    entityId: data.id,
    metadata: { name: parsed.data.ten_in_hoa },
  });
  revalidateBilling();
  // Back to the contract that asked for a new customer, if any.
  const back = String(formData.get("return_to") ?? "");
  redirect(/^\/billing\/contracts\/[0-9a-f-]{36}\?tab=hstt$/.test(back) ? back : `/billing/customers/${data.id}`);
}

export async function updateBillingCustomer(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("Hstt");
  const id = String(formData.get("id") ?? "");
  const parsed = parseCustomer(formData);
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_customers")
    .update({ ...parsed.data, updated_by: user.id })
    .eq("id", id)
    .select("id");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { fieldErrors: { mst: [t("errMstInUse")] } };
    return { error: error.message };
  }
  if (!data || data.length === 0) return { error: t("errNotFound") };

  await logActivity(supabase, {
    action: "billing.customer_updated",
    entityType: "billing_customer",
    entityId: id,
    metadata: { name: parsed.data.ten_in_hoa },
  });
  revalidateBilling();
  return { success: t("customerSaved") };
}

/** Delete a customer (admin only); refused while a contract uses it. */
export async function deleteBillingCustomer(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("Hstt");
  if (user.profile.role !== "admin") return { error: t("errAdminOnly") };
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.from("billing_customers").delete().eq("id", id).select("id, ten_in_hoa");
  if (error) return { error: error.code === FK_VIOLATION ? t("errCustomerInUse") : error.message };
  if (!data || data.length === 0) return { error: t("errNotFound") };

  await logActivity(supabase, {
    action: "billing.customer_deleted",
    entityType: "billing_customer",
    entityId: id,
    metadata: { name: data[0].ten_in_hoa },
  });
  revalidateBilling();
  redirect("/billing/customers");
}

// ---------------------------------------------------------------------------
// Contract: HSTT fields, transport prices, advances
// ---------------------------------------------------------------------------

export async function saveContractHstt(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("Hstt");
  const parsed = contractHsttSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const tv = await getTranslations("Validation");
    return { fieldErrors: translateFieldErrors(tv, parsed.error) };
  }
  const { contract_id: contractId, ...fields } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("billing_contract_hstt")
    .upsert({ contract_id: contractId, ...fields, updated_by: user.id }, { onConflict: "contract_id" });
  if (error) return { error: error.code === FK_VIOLATION ? t("errContractOrCustomer") : error.message };

  await logActivity(supabase, {
    action: "billing.contract_hstt_saved",
    entityType: "billing_contract",
    entityId: contractId,
    metadata: { customer_id: fields.customer_id, vat_percent: fields.vat_percent },
  });
  revalidateBilling();
  return { success: t("contractHsttSaved") };
}

/**
 * Replace a contract's transport price list. A vehicle already used by a
 * period cannot be deleted (FK): it should be switched to "not used" instead.
 */
export async function saveTransportPrices(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("Hstt");
  const contractId = String(formData.get("contract_id") ?? "");
  const parsed = transportPricesSchema.safeParse(parseJson(formData, "lines"));
  if (!parsed.success) return listError(parsed.error);
  const lines = parsed.data;
  const names = lines.map((l) => l.name.toLowerCase());
  if (new Set(names).size !== names.length) return { error: t("errDuplicateVehicle") };

  const supabase = await createClient();
  const keep = lines.flatMap((l) => (l.id ? [l.id] : []));
  let del = supabase.from("billing_transport_prices").delete().eq("contract_id", contractId);
  if (keep.length) del = del.not("id", "in", `(${keep.join(",")})`);
  const { error: delError } = await del;
  if (delError) return { error: delError.code === FK_VIOLATION ? t("errVehicleInUse") : delError.message };

  for (const [i, l] of lines.entries()) {
    const row = {
      contract_id: contractId,
      name: l.name,
      unit: l.unit,
      unit_price: l.unit_price,
      active: l.active,
      sort_order: i + 1,
      updated_by: user.id,
    };
    const { error } = l.id
      ? await supabase.from("billing_transport_prices").update(row).eq("id", l.id).eq("contract_id", contractId)
      : await supabase.from("billing_transport_prices").insert(row);
    if (error) return { error: error.code === UNIQUE_VIOLATION ? t("errDuplicateVehicle") : error.message };
  }

  await logActivity(supabase, {
    action: "billing.transport_prices_saved",
    entityType: "billing_contract",
    entityId: contractId,
    metadata: { vehicles: lines.length },
  });
  revalidateBilling();
  return { success: t("transportSaved") };
}

/** Replace a contract's advances and the note of the ĐCCN "Đã tạm ứng" line. */
export async function saveAdvances(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("Hstt");
  const contractId = String(formData.get("contract_id") ?? "");
  const parsed = advancesSchema.safeParse(parseJson(formData, "payload"));
  if (!parsed.success) return listError(parsed.error);
  const { note, items } = parsed.data;

  const supabase = await createClient();
  // The note lives on the contract's HSTT row (created here if needed).
  const { data: existing } = await supabase
    .from("billing_contract_hstt")
    .select("contract_id")
    .eq("contract_id", contractId)
    .maybeSingle();
  const { error: noteError } = existing
    ? await supabase
        .from("billing_contract_hstt")
        .update({ advances_note: note, updated_by: user.id })
        .eq("contract_id", contractId)
    : await supabase
        .from("billing_contract_hstt")
        .insert({ contract_id: contractId, advances_note: note, updated_by: user.id });
  if (noteError) return { error: noteError.message };

  const keep = items.flatMap((a) => (a.id ? [a.id] : []));
  let del = supabase.from("billing_contract_advances").delete().eq("contract_id", contractId);
  if (keep.length) del = del.not("id", "in", `(${keep.join(",")})`);
  const { error: delError } = await del;
  if (delError) return { error: delError.message };

  for (const [i, a] of items.entries()) {
    const row = { contract_id: contractId, amount: a.amount, paid_on: a.paid_on, sort_order: i + 1, updated_by: user.id };
    const { error } = a.id
      ? await supabase.from("billing_contract_advances").update(row).eq("id", a.id).eq("contract_id", contractId)
      : await supabase.from("billing_contract_advances").insert(row);
    if (error) return { error: error.message };
  }

  await logActivity(supabase, {
    action: "billing.advances_saved",
    entityType: "billing_contract",
    entityId: contractId,
    metadata: { count: items.length, total: items.reduce((s, a) => s + a.amount, 0) },
  });
  revalidateBilling();
  return { success: t("advancesSaved") };
}

// ---------------------------------------------------------------------------
// Period inputs (on a billing-month calculation)
// ---------------------------------------------------------------------------

/**
 * Save the transport trips, after-VAT deductions, payment and (optional)
 * typed opening debt of a calculation's period. Refused once any calculation
 * of the period is confirmed (periodEditBlock): void the confirmation first.
 */
export async function savePeriodInputs(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireBillingUser();
  const t = await getTranslations("Hstt");
  const parsed = periodInputsSchema.safeParse(parseJson(formData, "payload"));
  if (!parsed.success) return listError(parsed.error);
  const input = parsed.data;

  const supabase = await createClient();
  const { data: calc } = await supabase
    .from("billing_rent_calculations")
    .select("id, contract_id, period_month, period_from, period_to, status")
    .eq("id", input.calc_id)
    .maybeSingle();
  if (!calc) return { error: t("errNotFound") };

  const [{ data: contract }, { data: confirmed }, { data: prices }] = await Promise.all([
    supabase.from("billing_contracts").select("is_demo").eq("id", calc.contract_id).maybeSingle(),
    supabase
      .from("billing_rent_calculations")
      .select("id")
      .eq("contract_id", calc.contract_id)
      .eq("period_from", calc.period_from)
      .eq("status", "confirmed")
      .limit(1),
    supabase.from("billing_transport_prices").select("id, unit_price").eq("contract_id", calc.contract_id),
  ]);
  const block = periodEditBlock({
    canEdit: true,
    status: calc.status,
    periodMonth: calc.period_month,
    isDemo: contract?.is_demo ?? true,
    confirmedForPeriod: (confirmed ?? []).length > 0,
  });
  if (block) return { error: t(`lock.${block}`) };

  const priceOf = new Map((prices ?? []).map((p) => [p.id, Number(p.unit_price)]));
  if (input.transport.some((r) => !priceOf.has(r.transport_price_id))) return { error: t("errUnknownVehicle") };

  const { data: saved, error } = await supabase
    .from("billing_period_inputs")
    .upsert(
      {
        contract_id: calc.contract_id,
        period_from: calc.period_from,
        period_to: calc.period_to,
        paid_in_period: input.paid_in_period,
        opening_debt_override: input.opening_debt_override,
        note: input.note,
        updated_by: user.id,
      },
      { onConflict: "contract_id,period_from" },
    )
    .select("id")
    .single();
  if (error || !saved) return { error: error?.message ?? t("errSaveFailed") };

  // A row keeps the price it was first entered with; new rows take today's.
  const { data: oldRows } = await supabase
    .from("billing_period_transport")
    .select("transport_price_id, unit_price")
    .eq("period_input_id", saved.id);
  const oldPrice = new Map((oldRows ?? []).map((r) => [r.transport_price_id, Number(r.unit_price)]));

  const { error: delT } = await supabase.from("billing_period_transport").delete().eq("period_input_id", saved.id);
  if (delT) return { error: delT.message };
  const transport = input.transport
    .filter((r) => r.trips !== null || r.cumulative_trips !== null || r.note || r.charge_mode !== "now")
    .map((r) => ({
      period_input_id: saved.id,
      transport_price_id: r.transport_price_id,
      trips: r.trips,
      cumulative_trips: r.cumulative_trips,
      unit_price: oldPrice.get(r.transport_price_id) ?? priceOf.get(r.transport_price_id)!,
      charge_mode: r.charge_mode,
      note: r.note,
    }));
  if (transport.length) {
    const { error: insT } = await supabase.from("billing_period_transport").insert(transport);
    if (insT) return { error: insT.message };
  }

  const { error: delD } = await supabase.from("billing_period_deductions").delete().eq("period_input_id", saved.id);
  if (delD) return { error: delD.message };
  if (input.deductions.length) {
    const { error: insD } = await supabase
      .from("billing_period_deductions")
      .insert(input.deductions.map((d, i) => ({ period_input_id: saved.id, ...d, sort_order: i + 1 })));
    if (insD) return { error: insD.message };
  }

  await logActivity(supabase, {
    action: "billing.period_inputs_saved",
    entityType: "billing_calculation",
    entityId: calc.id,
    metadata: {
      month: calc.period_month,
      paid: input.paid_in_period,
      opening_override: input.opening_debt_override,
      transport: transport.length,
      deductions: input.deductions.length,
    },
  });
  revalidateBilling();
  return { success: t("periodSaved") };
}
