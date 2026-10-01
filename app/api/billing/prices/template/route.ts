import { NextResponse } from "next/server";
import { requireBillingViewer } from "@/lib/auth/dal";
import { priceWorkbookBuffer } from "@/lib/billing/price-export";
import { PRICE_TEMPLATE_ROWS } from "@/lib/billing/price-template";
import { XLSX_MIME } from "@/lib/billing/server";

// exceljs needs Node APIs (Buffer, streams).
export const runtime = "nodejs";

/** The price import template (same file as docs/mau-nhap-don-gia.xlsx, built from code). */
export async function GET() {
  await requireBillingViewer();
  const buffer = await priceWorkbookBuffer(PRICE_TEMPLATE_ROWS, { template: true });
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="mau-nhap-don-gia.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
