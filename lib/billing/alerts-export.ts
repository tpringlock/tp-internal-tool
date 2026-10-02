import ExcelJS from "exceljs";
import { formatVnDate } from "./dates";
import type { AlertKind, BillingAlert } from "./alerts";
import type { Period } from "./types";

/** Vietnamese name of each alert kind (Excel; the page uses next-intl). */
export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  negative_stock: "Tồn âm",
  missing_price: "Thiếu đơn giá",
  no_contract: "Kho chưa có hợp đồng",
  not_in_misa: "Không còn trên MISA",
  name_mismatch: "Lệch tên / ĐVT",
};

/** The filtered alerts as one sheet, with the period, files and filter in the header. */
export async function exportAlertsXlsx(input: {
  alerts: readonly BillingAlert[];
  period: Period;
  files: string[];
  filter: string;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Cảnh báo");
  ws.columns = [6, 20, 18, 34, 22, 36, 14, 34, 12, 14, 24, 60].map((width) => ({ width }));
  ws.addRow(["TRUNG TÂM CẢNH BÁO"]).font = { bold: true, size: 13 };
  ws.addRow([`Kỳ dữ liệu ${formatVnDate(input.period.from)} – ${formatVnDate(input.period.to)} · File MISA: ${input.files.join(", ")}`]).font = {
    italic: true,
  };
  ws.addRow([`Bộ lọc: ${input.filter} · ${input.alerts.length} cảnh báo`]);
  ws.addRow([]);
  const head = ws.addRow([
    "STT",
    "Loại",
    "Mã kho",
    "Tên kho",
    "Kho công ty",
    "Hợp đồng",
    "Mã VT",
    "Tên VT",
    "Ngày",
    "Tồn thấp nhất",
    "Phiếu",
    "Chi tiết",
  ]);
  head.font = { bold: true };
  head.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F1F8" } };
  });
  ws.views = [{ state: "frozen", ySplit: head.number }];
  ws.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number, column: 12 } };
  input.alerts.forEach((a, i) => {
    const row = ws.addRow([
      i + 1,
      ALERT_KIND_LABELS[a.kind],
      a.kho,
      a.khoName,
      a.company,
      a.contractLabel ? `${a.isDemo ? "[GIẢ ĐỊNH] " : ""}${a.contractLabel}` : null,
      a.maVt,
      a.tenVt,
      a.date ? new Date(`${a.date}T00:00:00Z`) : null,
      a.balance ?? null,
      a.refs?.join(", ") || null,
      a.message,
    ]);
    row.getCell(9).numFmt = "dd/mm/yyyy";
    row.getCell(10).numFmt = "#,##0.####;[Red]-#,##0.####";
    row.alignment = { vertical: "top", wrapText: true };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
