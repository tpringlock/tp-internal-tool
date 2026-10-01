import ExcelJS from "exceljs";

/**
 * Row 2 of a MISA "Sổ chi tiết vật tư hàng hóa" export ("Kho: <<Tất cả>>,
 * Tháng 9 năm 2026"), which parseMisaLedger reads but does not return. Used
 * to check the warehouse filter of month files (checkMisaScope). Server-side
 * (exceljs); reads the same visible sheet the parser does.
 */
export async function readMisaTitle(data: ArrayBuffer | Buffer | Uint8Array): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets.find((s) => s.state === "visible") ?? wb.worksheets[0];
  if (!ws) return "";
  const v = ws.getRow(2).getCell(1).value;
  if (v && typeof v === "object" && "richText" in v) return v.richText.map((t) => t.text).join("").trim();
  if (v && typeof v === "object" && "result" in v) return String(v.result ?? "").trim();
  return v == null ? "" : String(v).trim();
}
