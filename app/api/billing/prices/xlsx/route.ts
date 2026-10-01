import { type NextRequest, NextResponse } from "next/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { loadActiveCatalog } from "@/lib/billing/month-files-server";
import { priceWorkbookBuffer } from "@/lib/billing/price-export";
import { buildPriceTable } from "@/lib/billing/price-table";
import { getAllPriceLines, todayIct } from "@/lib/billing/queries";
import { XLSX_MIME } from "@/lib/billing/server";

// exceljs needs Node APIs (Buffer, streams).
export const runtime = "nodejs";

/**
 * Export the price table (real contracts) in the import layout, with the
 * same filters as /billing/prices (?q=&contract=&issues=1): export, edit in
 * Excel, import again. Billing users and "Chỉ xem".
 */
export async function GET(request: NextRequest) {
  await requireBillingViewer();
  const sp = request.nextUrl.searchParams;
  const filter = {
    q: sp.get("q") ?? undefined,
    contract: sp.get("contract") ?? undefined,
    issues: sp.get("issues") === "1",
  };

  const supabase = await createClient();
  const [{ data: contracts }, lines, { catalog }] = await Promise.all([
    supabase.from("billing_contracts").select("id, misa_kho, misa_kho_name, contract_no, customer_name").eq("is_demo", false),
    getAllPriceLines(supabase, { demo: false }),
    filter.issues ? loadActiveCatalog(supabase, { fill: false }) : Promise.resolve({ catalog: null }),
  ]);
  const rows = buildPriceTable(contracts ?? [], lines, catalog, filter);
  const buffer = await priceWorkbookBuffer(rows);

  await logActivity(supabase, {
    action: "billing.prices_exported",
    metadata: { rows: rows.length, ...filter },
    ip: request.headers.get("x-forwarded-for"),
  });

  const fileName = `bang-don-gia-${todayIct()}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
