import ExcelJS from "exceljs";
import { formatVnDate } from "./dates";
import type { ContractConfig, RentResult } from "./types";

/**
 * Xuất mục "I. Thiết bị vật tư" theo đúng bố cục cột của Biên bản đối chiếu giá trị thuê thiết bị,
 * để kế toán so trực tiếp với file HSTT đang làm tay.
 */
export async function exportRentXlsx(result: RentResult, contract: ContractConfig): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Tiền thuê", {
    views: [{ state: "frozen", ySplit: 6 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const { from, to } = result.period;

  ws.columns = [
    { key: "stt", width: 6 },
    { key: "name", width: 38 },
    { key: "unit", width: 8 },
    { key: "date", width: 13 },
    { key: "end", width: 13 },
    { key: "open", width: 12 },
    { key: "qty", width: 14 },
    { key: "days", width: 9 },
    { key: "price", width: 11 },
    { key: "amount", width: 16 },
    { key: "note", width: 40 },
  ];
  ws.addRow([`${contract.customerName} – ${contract.projectName}`]).font = { bold: true, size: 13 };
  ws.addRow([`Hợp đồng số ${contract.contractNo} · Kho MISA ${contract.misaKho}`]);
  ws.addRow([`Giá trị thuê thiết bị từ ngày ${formatVnDate(from)} đến ngày ${formatVnDate(to)}`]).font = { italic: true };
  ws.addRow([]);
  const head = ws.addRow([
    "STT",
    "Tên thiết bị",
    "Đơn vị tính",
    "Ngày nhận/trả trên phiếu",
    "Ngày tính thời gian",
    "Số lượng tồn đầu kỳ",
    "Số lượng phát sinh trong kỳ nhận (+) trả (-)",
    "Thời gian thuê",
    "Đơn giá thuê (vnđ/cái)",
    "Thành tiền thuê",
    "Ghi chú",
  ]);
  head.font = { bold: true };
  head.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  head.height = 45;
  ws.addRow(["I", "Thiết bị vật tư", "", "", "", "", "", "", "", result.totalAmount]).font = { bold: true };

  const num = "#,##0;[Red]-#,##0";
  result.items.forEach((item, idx) => {
    item.lines.forEach((l, i) => {
      const r = ws.addRow([
        i === 0 ? idx + 1 : "",
        item.name,
        item.unit,
        toDate(l.date),
        toDate(l.endDate),
        l.openingQty ?? "",
        l.qty,
        l.days,
        l.unitPrice,
        l.amount,
        l.kind === "ton-dau-ky" ? "" : l.ref + (l.excludedDays ? ` · trừ ${l.excludedDays} ngày miễn tính` : ""),
      ]);
      r.getCell(4).numFmt = r.getCell(5).numFmt = "dd/mm/yyyy";
      [6, 7, 9, 10].forEach((c) => (r.getCell(c).numFmt = num));
    });
    const sum = ws.addRow(["", "Cộng", "", "", "", "", item.closingQty, "", "", item.amount]);
    sum.font = { bold: true };
    [7, 10].forEach((c) => (sum.getCell(c).numFmt = num));
  });
  const total = ws.addRow(["", "Tổng tiền thuê thiết bị", "", "", "", "", "", "", "", result.totalAmount]);
  total.font = { bold: true };
  total.getCell(10).numFmt = num;
  ws.getRow(6).getCell(10).numFmt = num;

  if (result.warnings.length) {
    ws.addRow([]);
    ws.addRow(["", "Cảnh báo"]).font = { bold: true, color: { argb: "FFC00000" } };
    result.warnings.forEach((w) => ws.addRow(["", w]));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function toDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
